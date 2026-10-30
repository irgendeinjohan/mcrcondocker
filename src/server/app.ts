// HTTP-Server: REST-API, Server-Sent Events, statisches Frontend.
import { resolveLocale, translate } from "../shared/translations.js";
import { normalizeBlueMapUrl } from "../shared/bluemap.js";
import type { DashboardUser } from "../shared/users.js";
import { readiness } from "../shared/readiness.js";
import { RenderAssets } from "./render-assets.js";
import { Backups } from "./backups.js";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { LogController, type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { DiagnosticsSnapshot, LiveEvent, PlayerSessionStats } from "../shared/types.js";
import { ActionError, type ActionService } from "./actions.js";
import type { Assets } from "./assets.js";
import { Auth, clearCookie, COOKIE_NAME, parseCookies, sessionCookie } from "./auth.js";
import type { Config } from "./config.js";
import type { ConsoleService } from "./console.js";
import type { Repo } from "./db/repo.js";
import type { Diagnostics } from "./parse/diagnostics.js";
import type { Poller } from "./poller.js";
import type { RconClient } from "./rcon/client.js";

declare module "fastify" { interface FastifyRequest { user: DashboardUser | null } }

export interface AppDeps {
  config: Config;
  repo: Repo;
  poller: Poller;
  console: ConsoleService;
  actions: ActionService;
  diag: Diagnostics;
  rcon: RconClient;
  assets: Assets;
  version: string;
  webRoot?: string;
  backups?: Backups;
  renderAssets?: RenderAssets;
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
  app.decorateRequest("user", null);
  const renderAssets = deps.renderAssets;
  app.get("/api/render/index", async () => renderAssets?.info() ?? { enabled: false, version: "26.3", revision: "none", files: [], custom: false, skins: [] });
  app.get<{ Querystring: { path?: string } }>("/api/render/file", async (req, reply) => {
    const file = typeof req.query.path === "string" ? req.query.path : "";
    const content = renderAssets?.read(file);
    if (!content) return reply.code(404).send({ error: "Render asset not found" });
    return reply.type(file.endsWith(".png") ? "image/png" : "application/json").send(content);
  });
  app.get<{ Params: { hash: string } }>("/api/skin/:hash", async (req, reply) => {
    const skin = renderAssets?.skin(req.params.hash);
    if (!skin) return reply.code(404).send({ error: "Skin not installed" });
    return reply.type("image/png").send(skin);
  });
  const auth = new Auth(config.dashboardPassword, repo, config.sessionDays);
  const isSecure = (req: FastifyRequest) => (config.cookieSecure === "auto" ? req.protocol === "https" : config.cookieSecure);
  const token = (req: FastifyRequest) => parseCookies(req.headers.cookie)[COOKIE_NAME];

  const blueMapUrl = () => normalizeBlueMapUrl(repo.getSetting("bluemap.url"));

  // Sicherheits-Header
  app.addHook("onSend", async (req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    const isMapFrame = req.url.split("?")[0] === "/api/bluemap/view";
    reply.header("X-Frame-Options", isMapFrame ? "SAMEORIGIN" : "DENY");
    const frameOrigin = isMapFrame && blueMapUrl() ? new URL(blueMapUrl()!).origin : "'self'";
    reply.header(
      "Content-Security-Policy",
      `default-src 'self'; frame-src ${frameOrigin}; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; frame-ancestors ${isMapFrame ? "'self'" : "'none'"}; base-uri 'self'; form-action 'self'; manifest-src 'self'; worker-src 'self'`,
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
      if (origin && req.headers.host) {
        try { if (new URL(origin).host !== req.headers.host) return reply.code(403).send({ error: "Fremde Herkunft" }); }
        catch { return reply.code(403).send({ error: "Fremde Herkunft" }); }
      }
    }
    if (PUBLIC.has(url)) return;
    req.user = auth.sessionUser(token(req));
    if (!req.user) return reply.code(401).send({ error: "Nicht angemeldet" });
    if (req.user.role === "viewer") {
      const readable = new Set(["/api/status", "/api/players", "/api/sessions", "/api/assets", "/api/items", "/api/translations", "/api/events", "/api/settings/bluemap", "/api/bluemap/view"]);
      const safe = readable.has(url) || /^\/api\/(?:players|icon|gui|render|skin)\/[^/]+$/.test(url);
      if (url !== "/api/logout" && (!(req.method === "GET" || req.method === "HEAD") || !safe)) {
        return reply.code(403).send({ error: "Operator-Rechte erforderlich" });
      }
    }
  });

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/readyz", async (_req, reply) => {
    const result = readiness(poller.status());
    return reply.header("Cache-Control", "no-store").code(result.ready ? 200 : 503).send(result);
  });
  const backups = deps.backups ?? new Backups(repo.db, config.backup.directory, config.backup.keep);
  app.get("/api/backups", async () => backups.list());
  app.post("/api/backups", async (req) => {
    const result = await backups.create();
    deps.actions.audit("action", "SQLite backup created", "", true, result.name, req.user!.username);
    return result;
  });
  app.get<{ Params: { name: string } }>("/api/backups/:name", async (req, reply) => {
    try {
      const file = backups.file(req.params.name);
      if (!existsSync(file)) return reply.code(404).send({ error: "Backup nicht gefunden" });
      return reply.type("application/octet-stream").header("Content-Disposition", `attachment; filename="${req.params.name}"`).send(createReadStream(file));
    } catch { return reply.code(400).send({ error: "Ungültiger Backup-Name" }); }
  });

  // --- Login ---------------------------------------------------------------
  app.get("/api/session", async (req) => { const user = auth.sessionUser(token(req)); return { authenticated: !!user, mock: config.mock, user }; });

  app.post<{ Body: { password?: unknown; username?: unknown } }>("/api/login", async (req, reply) => {
    const ip = req.ip;
    const wait = auth.retryAfter(ip);
    if (wait > 0) {
      reply.header("Retry-After", Math.ceil(wait / 1000));
      return reply.code(429).send({ error: translate(resolveLocale(req.headers["accept-language"] ?? "de"), "Zu viele Fehlversuche. Bitte in {minutes} Minute(n) erneut versuchen.", { minutes: Math.ceil(wait / 60000) }) });
    }
    const pw = typeof req.body?.password === "string" ? req.body.password : "";
    const user = auth.authenticate(typeof req.body?.username === "string" ? req.body.username : "admin", pw);
    if (!user) {
      auth.recordFailure(ip);
      await new Promise((r) => setTimeout(r, 400)); // bremst Durchprobieren zusätzlich
      return reply.code(401).send({ error: "Falsches Passwort" });
    }
    auth.recordSuccess(ip);
    const s = auth.createSession(user);
    reply.header("Set-Cookie", sessionCookie(s.token, s.maxAgeSeconds, isSecure(req)));
    return { ok: true, user };
  });

  app.post("/api/logout", async (req, reply) => {
    auth.destroySession(token(req));
    reply.header("Set-Cookie", clearCookie(isSecure(req)));
    return { ok: true };
  });

  app.get("/api/users", async () => auth.listUsers());
  app.post<{ Body: { username?: unknown; password?: unknown; role?: unknown } }>("/api/users", async (req, reply) => {
    try {
      const user = auth.createUser(req.body ?? {});
      deps.actions.audit("action", `User created: ${user.username} (${user.role})`, "", true, "", req.user!.username);
      return reply.code(201).send(user);
    } catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
  });
  app.patch<{ Params: { id: string }; Body: { role?: unknown; enabled?: unknown; password?: unknown } }>("/api/users/:id", async (req, reply) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) return reply.code(400).send({ error: "Benutzer unbekannt" });
      const user = auth.updateUser(id, req.body ?? {}, req.user!);
      deps.actions.audit("action", `User updated: ${user.username} (${user.role}, ${user.enabled ? "enabled" : "disabled"})`, "", true, "", req.user!.username);
      return user;
    } catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
  });

  // BlueMap settings share the dashboard's authentication and CSRF protections.
  app.get("/api/settings/bluemap", async () => ({ url: blueMapUrl() }));
  app.post<{ Body: { url?: unknown } }>("/api/settings/bluemap", async (req, reply) => {
    try {
      if (!req.body || !("url" in req.body)) return reply.code(400).send({ error: "url erwartet" });
      const url = normalizeBlueMapUrl(req.body.url);
      if (url && req.protocol === "https" && new URL(url).protocol !== "https:") {
        return reply.code(400).send({ error: "Bitte für BlueMap HTTPS verwenden." });
      }
      repo.setSetting("bluemap.url", url);
      deps.actions.audit("action", "BlueMap settings updated", "", true, "", req.user!.username);
      return { url };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });
  // Isolate the configurable frame policy in a fresh same-origin document. This
  // allows settings to change without weakening the dashboard CSP or reloading it.
  app.get("/api/bluemap/view", async (_req, reply) => {
    const url = blueMapUrl();
    if (!url) return reply.code(404).send({ error: "BlueMap is not configured" });
    const escaped = url.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    reply.type("text/html; charset=utf-8");
    return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>BlueMap</title><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block;background:#131813}</style></head><body><iframe src="${escaped}" title="BlueMap" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-downloads"></iframe></body></html>`;
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
    deps.actions.audit("action", req.body.paused ? "Polling paused" : "Polling resumed", "", true, "", req.user!.username);
    return poller.status();
  });

  app.get("/api/console", async () => deps.console.entries());

  app.post<{ Body: { command?: unknown; confirmed?: unknown } }>("/api/console", async (req, reply) => {
    if (typeof req.body?.command !== "string") return reply.code(400).send({ error: "command erwartet" });
    const r = await deps.console.run(req.body.command, req.body.confirmed === true, resolveLocale(req.headers["accept-language"] ?? "de"), req.user!.username);
    if (r.kind === "invalid") return reply.code(400).send({ error: r.message });
    if (r.kind === "needs_confirmation") return reply.code(409).send({ needsConfirmation: true, reason: r.reason });
    return r.entry;
  });

  // --- Aktionen ------------------------------------------------------------
  const { actions } = deps;
  /** RCON-Fehler (keine Verbindung, Zeitüberschreitung) als 503 statt 500 */
  const rconFailure = (reply: FastifyReply, e: unknown) => {
    if (e instanceof ActionError) return reply.code(400).send({ error: e.message });
    return reply.code(503).send({ error: `RCON: ${(e as Error).message}` });
  };

  app.post<{ Body: { action?: unknown; confirmed?: unknown } }>("/api/action", async (req, reply) => {
    try {
      const r = await actions.run(req.body?.action, req.body?.confirmed === true, resolveLocale(req.headers["accept-language"] ?? "de"), req.user!.username);
      if (r.kind === "needs_confirmation") return reply.code(409).send({ needsConfirmation: true, reason: r.reason, label: r.label });
      return r.result;
    } catch (e) {
      return rconFailure(reply, e);
    }
  });

  app.get("/api/world", async (_req, reply) => {
    try {
      return await actions.world();
    } catch (e) {
      return rconFailure(reply, e);
    }
  });

  app.get("/api/world/spawn", async () => ({ worldSpawn: actions.worldSpawn() }));

  app.post<{ Body: { spawn?: unknown } }>("/api/world/spawn", async (req, reply) => {
    try {
      const worldSpawn = actions.setWorldSpawn(req.body?.spawn ?? null);
      actions.audit("action", "World spawn updated", "", true, "", req.user!.username);
      return { worldSpawn };
    } catch (e) {
      return rconFailure(reply, e);
    }
  });

  app.get("/api/bans", async (_req, reply) => {
    try {
      return await actions.bans();
    } catch (e) {
      return rconFailure(reply, e);
    }
  });

  app.get<{ Querystring: { lang?: string } }>("/api/items", async (req) => assets.items(req.query.lang));
  app.get<{ Querystring: { lang?: string } }>("/api/translations", async (req) => assets.translations(req.query.lang ?? "en"));
  app.get<{ Params: { name: string } }>("/api/gui/:name", async (req, reply) => {
    const png = assets.gui(req.params.name);
    if (!png) return reply.code(404).send({ error: "No GUI sprite" });
    return reply.type("image/png").header("Cache-Control", "private, max-age=86400").send(png);
  });

  app.get<{ Querystring: { limit?: string; before?: string } }>("/api/audit", async (req) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200) || 200));
    const before = Number(req.query.before) || undefined;
    return actions.auditEntries(limit, before);
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
    // letzte Aktionen mit Serverantwort, damit fehlgeschlagene Aktionen im Export sichtbar sind
    return { ...diagSnapshot(), assets: assets.info(), status: poller.status(), audit: actions.auditEntries(100), exportedAt: new Date().toISOString() };
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
    const send = (ev: LiveEvent) => {
      const user = auth.sessionUser(token(req));
      if (!user) { res.end(); return; }
      if (user.role === "viewer" && (ev.type === "console" || ev.type === "audit")) return;
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    };
    res.write("retry: 3000\n\n");
    send({ type: "status", status: poller.status() });
    send({ type: "players", players: poller.summaries() });
    poller.on("event", send);
    deps.console.on("event", send);
    actions.on("event", send);
    const ping = setInterval(() => { if (!auth.sessionUser(token(req))) res.end(); else res.write(": ping\n\n"); }, 25_000);
    req.raw.on("close", () => {
      clearInterval(ping);
      poller.off("event", send);
      deps.console.off("event", send);
      actions.off("event", send);
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
