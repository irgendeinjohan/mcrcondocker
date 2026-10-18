// HTTP-Server: REST-API, Server-Sent Events, statisches Frontend.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { LogController, type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { DiagnosticsSnapshot, LiveEvent, PlayerSessionStats } from "../shared/types.js";
import type { Assets } from "./assets.js";
import { Auth, clearCookie, COOKIE_NAME, parseCookies, sessionCookie } from "./auth.js";
import type { Config } from "./config.js";
import type { ConsoleService } from "./console.js";
import type { Repo } from "./db/repo.js";
import type { Diagnostics } from "./parse/diagnostics.js";
import type { Poller } from "./poller.js";
import type { RconClient } from "./rcon/client.js";

export interface AppDeps {
  config: Config;
  repo: Repo;
  poller: Poller;
  console: ConsoleService;
  diag: Diagnostics;
  rcon: RconClient;
  assets: Assets;
  version: string;
  webRoot?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function defaultWebRoot(): string | undefined {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/server → dist/web; bei tsx (src/server) → dist/web. src/web (Quellen) hat keinen assets-Ordner.
  for (const c of [path.resolve(here, "../web"), path.resolve(here, "../../dist/web"), path.resolve("dist/web")]) {
    if (existsSync(path.join(c, "index.html")) && existsSync(path.join(c, "assets"))) return c;
  }
  return undefined;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, repo, poller, diag, rcon, assets } = deps;
  const app = Fastify({
    logger: config.logLevel === "silent" ? false : { level: config.logLevel },
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
  });
  const auth = new Auth(config.dashboardPassword, repo, config.sessionDays);
  const isSecure = (req: FastifyRequest) => (config.cookieSecure === "auto" ? req.protocol === "https" : config.cookieSecure);
  const token = (req: FastifyRequest) => parseCookies(req.headers.cookie)[COOKIE_NAME];

  // Sicherheits-Header
  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Frame-Options", "DENY");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; manifest-src 'self'; worker-src 'self'",
    );
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    return payload;
  });

  // Auth + einfacher CSRF-Schutz für alle /api-Routen außer Login/Healthcheck
  const PUBLIC = new Set(["/api/login", "/api/session"]);
  app.addHook("onRequest", async (req, reply) => {
    const url = req.url.split("?")[0]!;
    if (!url.startsWith("/api/")) return;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const ct = req.headers["content-type"] ?? "";
      if (!ct.startsWith("application/json")) return reply.code(415).send({ error: "JSON erwartet" });
      const origin = req.headers.origin;
      if (origin && req.headers.host && new URL(origin).host !== req.headers.host) {
        return reply.code(403).send({ error: "Fremde Herkunft" });
      }
    }
    if (PUBLIC.has(url)) return;
    if (!auth.validSession(token(req))) return reply.code(401).send({ error: "Nicht angemeldet" });
  });

  app.get("/healthz", async () => ({ ok: true }));

  // --- Login ---------------------------------------------------------------
  app.get("/api/session", async (req) => ({ authenticated: auth.validSession(token(req)), mock: config.mock }));

  app.post<{ Body: { password?: unknown } }>("/api/login", async (req, reply) => {
    const ip = req.ip;
    const wait = auth.retryAfter(ip);
    if (wait > 0) {
      reply.header("Retry-After", Math.ceil(wait / 1000));
      return reply.code(429).send({ error: `Zu viele Fehlversuche. Bitte in ${Math.ceil(wait / 60000)} Minute(n) erneut versuchen.` });
    }
    const pw = typeof req.body?.password === "string" ? req.body.password : "";
    if (!auth.checkPassword(pw)) {
      auth.recordFailure(ip);
      await new Promise((r) => setTimeout(r, 400)); // bremst Durchprobieren zusätzlich
      return reply.code(401).send({ error: "Falsches Passwort" });
    }
    auth.recordSuccess(ip);
    const s = auth.createSession();
    reply.header("Set-Cookie", sessionCookie(s.token, s.maxAgeSeconds, isSecure(req)));
    return { ok: true };
  });

  app.post("/api/logout", async (req, reply) => {
    auth.destroySession(token(req));
    reply.header("Set-Cookie", clearCookie(isSecure(req)));
    return { ok: true };
  });

  // --- Daten ---------------------------------------------------------------
  app.get("/api/status", async () => poller.status());
  app.get("/api/players", async () => poller.summaries());

  app.get<{ Params: { uuid: string } }>("/api/players/:uuid", async (req, reply) => {
    const uuid = req.params.uuid.toLowerCase();
    if (!UUID_RE.test(uuid)) return reply.code(400).send({ error: "Ungültige UUID" });
    const d = poller.detail(uuid);
    if (!d) return reply.code(404).send({ error: "Spieler unbekannt" });
    return d;
  });

  app.get<{ Querystring: { uuid?: string; days?: string } }>("/api/sessions", async (req, reply) => {
    const now = Date.now();
    const totals = new Map(repo.sessionTotals(now).map((t) => [t.uuid, t]));
    const online = new Set(poller.summaries().filter((p) => p.online).map((p) => p.uuid));
    const stats: PlayerSessionStats[] = repo.listPlayers().map((p) => ({
      uuid: p.uuid,
      name: p.name,
      isBedrock: p.is_bedrock === 1,
      online: online.has(p.uuid),
      totalMs: totals.get(p.uuid)?.total ?? 0,
      sessionCount: totals.get(p.uuid)?.count ?? 0,
      lastSeen: p.last_seen,
      firstSeen: p.first_seen,
    }));
    const days = Math.min(365, Math.max(1, Number(req.query.days ?? 30) || 30));
    const gaps = repo.recentGaps(now - days * 86_400_000);
    if (req.query.uuid) {
      const uuid = req.query.uuid.toLowerCase();
      if (!UUID_RE.test(uuid)) return reply.code(400).send({ error: "Ungültige UUID" });
      return { stats, sessions: repo.sessionsFor(uuid, 50), gaps };
    }
    return { stats, gaps };
  });

  // --- Steuerung -----------------------------------------------------------
  app.post<{ Body: { paused?: unknown } }>("/api/pause", async (req, reply) => {
    if (typeof req.body?.paused !== "boolean") return reply.code(400).send({ error: "paused (boolean) erwartet" });
    poller.setPaused(req.body.paused);
    return poller.status();
  });

  app.get("/api/console", async () => deps.console.entries());

  app.post<{ Body: { command?: unknown; confirmed?: unknown } }>("/api/console", async (req, reply) => {
    if (typeof req.body?.command !== "string") return reply.code(400).send({ error: "command erwartet" });
    const r = await deps.console.run(req.body.command, req.body.confirmed === true);
    if (r.kind === "invalid") return reply.code(400).send({ error: r.message });
    if (r.kind === "needs_confirmation") return reply.code(409).send({ needsConfirmation: true, reason: r.reason });
    return r.entry;
  });

  // --- Diagnose ------------------------------------------------------------
  const diagSnapshot = (): DiagnosticsSnapshot => ({
    warnings: diag.getWarnings(),
    raw: diag.getRaw(),
    rcon: { state: rcon.state, lastError: rcon.lastError, queueLength: rcon.queueLength, commandsSent: rcon.sentCount },
    startedAt: diag.startedAt,
    version: deps.version,
  });
  app.get("/api/debug", async () => ({ ...diagSnapshot(), assets: assets.info(), status: poller.status() }));
  app.get("/api/debug/export", async (_req, reply) => {
    reply.header("Content-Disposition", `attachment; filename="mcdash-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json"`);
    return { ...diagSnapshot(), assets: assets.info(), status: poller.status(), exportedAt: new Date().toISOString() };
  });
  app.post("/api/debug/clear-warnings", async () => {
    diag.clearWarnings();
    return { ok: true };
  });

  // --- Texturen ------------------------------------------------------------
  app.get("/api/assets", async () => assets.info());
  app.get<{ Params: { id: string } }>("/api/icon/:id", async (req, reply) => {
    const png = assets.icon(req.params.id.replace(/\.png$/, ""));
    if (!png) return reply.code(404).send({ error: "keine Textur" });
    reply.header("Content-Type", "image/png");
    reply.header("Cache-Control", "private, max-age=86400");
    return png;
  });

  // --- Live-Ereignisse (SSE) ----------------------------------------------
  app.get("/api/events", (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (ev: LiveEvent) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    res.write("retry: 3000\n\n");
    send({ type: "status", status: poller.status() });
    send({ type: "players", players: poller.summaries() });
    poller.on("event", send);
    deps.console.on("event", send);
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.raw.on("close", () => {
      clearInterval(ping);
      poller.off("event", send);
      deps.console.off("event", send);
    });
  });

  // --- Frontend ------------------------------------------------------------
  const webRoot = deps.webRoot ?? defaultWebRoot();
  if (webRoot) {
    await app.register(fastifyStatic, {
      root: webRoot,
      index: ["index.html"],
      setHeaders: (res, file) => {
        // gehashte Assets lange cachen, index.html nie
        if (/[\\/]assets[\\/]/.test(file)) res.header("Cache-Control", "public, max-age=31536000, immutable");
        else res.header("Cache-Control", "no-cache");
      },
    });
    app.setNotFoundHandler((req, reply: FastifyReply) => {
      if (req.url.startsWith("/api/") || req.method !== "GET") return reply.code(404).send({ error: "Nicht gefunden" });
      return reply.sendFile("index.html");
    });
  } else {
    app.get("/", async () => "Frontend nicht gebaut (npm run build:web)");
  }

  return app;
}
