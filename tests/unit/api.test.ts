// Integrationstest: kompletter Stack (Fastify → Poller → RCON-Client → Mock-RCON-Server → MockWorld)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/server/app.js";
import { Assets } from "../../src/server/assets.js";
import { loadConfig } from "../../src/server/config.js";
import { ConsoleService } from "../../src/server/console.js";
import { openMemoryDb } from "../../src/server/db/db.js";
import { Repo } from "../../src/server/db/repo.js";
import { MockWorld } from "../../src/server/mock-world.js";
import { Diagnostics } from "../../src/server/parse/diagnostics.js";
import { Poller } from "../../src/server/poller.js";
import { RconClient } from "../../src/server/rcon/client.js";
import { startMockRconServer, type MockRconServer } from "../../src/server/rcon/mock-server.js";
import { SessionTracker } from "../../src/server/sessions.js";
import type { PlayerDetail, PlayerSummary, ServerStatus } from "../../src/shared/types.js";

const RCON_PW = "Geheimes-RCON-Passwort-123";
const DASH_PW = "Dashboard-Passwort";
let app: FastifyInstance;
let mock: MockRconServer;
let rcon: RconClient;
let poller: Poller;
let repo: Repo;
let cookie = "";

beforeAll(async () => {
  const world = new MockWorld();
  mock = await startMockRconServer({ password: RCON_PW, handler: (c) => world.handle(c) });
  const config = loadConfig({
    DASHBOARD_PASSWORD: DASH_PW,
    RCON_HOST: "127.0.0.1",
    RCON_PORT: String(mock.port),
    RCON_PASSWORD: RCON_PW,
    DATA_DIR: "/nonexistent",
    LOG_LEVEL: "silent",
    POLL_INTERVAL_SECONDS: "60",
  });
  repo = new Repo(openMemoryDb());
  const diag = new Diagnostics();
  rcon = new RconClient({ host: "127.0.0.1", port: mock.port, password: RCON_PW });
  poller = new Poller(rcon, repo, new SessionTracker(repo), diag, { pollIntervalMs: 60_000, perfIntervalMs: 1000, floodgatePrefix: ".", mock: false, version: "test" });
  const consoleService = new ConsoleService(rcon, diag, []);
  app = await buildApp({ config, repo, poller, console: consoleService, diag, rcon, assets: new Assets("/nonexistent"), version: "test", webRoot: "/nonexistent" });
  rcon.start();
  await rcon.waitForConnected();
  poller.start();
  await poller.cycle();
});

afterAll(async () => {
  poller.stop();
  rcon.stop();
  await app.close();
  await mock.close();
});

const json = { "content-type": "application/json" };

describe("API", () => {
  it("ohne Login 401", async () => {
    expect((await app.inject({ url: "/api/status" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/players" })).statusCode).toBe(401);
  });

  it("Healthcheck ohne Login", async () => {
    expect((await app.inject({ url: "/healthz" })).json()).toEqual({ ok: true });
  });

  it("falsches Passwort 401, POST ohne JSON 415", async () => {
    expect((await app.inject({ method: "POST", url: "/api/login", headers: json, payload: { password: "falsch" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/login", payload: "password=x", headers: { "content-type": "application/x-www-form-urlencoded" } })).statusCode).toBe(415);
  });

  it("Login setzt HttpOnly-Cookie", async () => {
    const r = await app.inject({ method: "POST", url: "/api/login", headers: json, payload: { password: DASH_PW } });
    expect(r.statusCode).toBe(200);
    const sc = String(r.headers["set-cookie"]);
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/SameSite=Strict/);
    cookie = sc.split(";")[0]!;
  });

  it("Status und Spieler", async () => {
    const s = (await app.inject({ url: "/api/status", headers: { cookie } })).json<ServerStatus>();
    expect(s.connection).toBe("connected");
    expect(s.online).toBeGreaterThanOrEqual(4);
    expect(s.perf?.tps).toHaveLength(3);
    const players = (await app.inject({ url: "/api/players", headers: { cookie } })).json<PlayerSummary[]>();
    const bedrock = players.find((p) => p.name === ".Steve Bedrock")!;
    expect(bedrock.isBedrock).toBe(true);
    expect(bedrock.online).toBe(true);
    const dims = new Set(players.map((p) => p.dimension));
    expect(dims).toEqual(new Set(["minecraft:overworld", "minecraft:the_nether", "minecraft:the_end"]));
  });

  it("Spielerdetails mit Inventar, Rüstung, Offhand, Enderkiste", async () => {
    const d = (await app.inject({ url: "/api/players/36532b5e-c442-3dbb-a24c-c7e55d0f979a", headers: { cookie } })).json<PlayerDetail>();
    expect(d.data!.complete).toBe(true);
    expect(d.data!.inventory.length).toBeGreaterThan(20);
    expect(d.data!.armor.head!.id).toBe("minecraft:diamond_helmet");
    expect(d.data!.offhand!.id).toBe("minecraft:shield");
    expect(d.data!.enderChest).toHaveLength(2);
  });

  it("Bedrock-Spieler mit Leerzeichen per UUID", async () => {
    const d = (await app.inject({ url: "/api/players/00000000-0000-0000-0009-01f5f0fa4c3b", headers: { cookie } })).json<PlayerDetail>();
    expect(d.name).toBe(".Steve Bedrock");
    expect(d.data!.inventory.map((i) => i.id)).toContain("minecraft:iron_sword");
  });

  it("ungültige UUID 400", async () => {
    expect((await app.inject({ url: "/api/players/../../etc", headers: { cookie } })).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/players/abc", headers: { cookie } })).statusCode).toBe(400);
  });

  it("Konsole: harmloser Befehl, gefährlicher Befehl braucht Bestätigung", async () => {
    const ok = await app.inject({ method: "POST", url: "/api/console", headers: { ...json, cookie }, payload: { command: "/seed" } });
    expect(ok.json().output).toBe("Seed: [4046814556654922723]");
    const danger = await app.inject({ method: "POST", url: "/api/console", headers: { ...json, cookie }, payload: { command: "stop" } });
    expect(danger.statusCode).toBe(409);
    expect(danger.json().needsConfirmation).toBe(true);
    const confirmed = await app.inject({ method: "POST", url: "/api/console", headers: { ...json, cookie }, payload: { command: "stop", confirmed: true } });
    expect(confirmed.statusCode).toBe(200);
  });

  it("Pause: wird gespeichert, Konsole funktioniert weiter, Lücke wird angelegt", async () => {
    const r = await app.inject({ method: "POST", url: "/api/pause", headers: { ...json, cookie }, payload: { paused: true } });
    expect(r.json().connection).toBe("paused");
    expect(repo.getSetting("paused")).toBe("1");
    expect(repo.openGap()!.reason).toBe("paused");
    const c = await app.inject({ method: "POST", url: "/api/console", headers: { ...json, cookie }, payload: { command: "list" } });
    expect(c.json().output).toMatch(/There are/);
    await app.inject({ method: "POST", url: "/api/pause", headers: { ...json, cookie }, payload: { paused: false } });
    await poller.cycle();
    expect(repo.openGap()).toBeUndefined();
  });

  it("Online-Zeiten", async () => {
    const r = (await app.inject({ url: "/api/sessions", headers: { cookie } })).json();
    expect(r.stats.length).toBeGreaterThanOrEqual(4);
    expect(r.gaps[0].reason).toBe("paused");
  });

  it("Debug-Seite enthält Rohantworten, aber nie das RCON-Passwort oder den Host/Port", async () => {
    const r = await app.inject({ url: "/api/debug", headers: { cookie } });
    const body = r.body;
    expect(Object.keys(r.json().raw)).toEqual(expect.arrayContaining(["list", "player", "tps", "mspt", "console"]));
    for (const url of ["/api/debug", "/api/debug/export", "/api/status", "/api/players", "/api/sessions", "/api/console"]) {
      const b = (await app.inject({ url, headers: { cookie } })).body;
      expect(b).not.toContain(RCON_PW);
      expect(b).not.toContain(`:${mock.port}`);
    }
    expect(body).not.toContain(RCON_PW);
  });

  it("Logout macht Cookie ungültig", async () => {
    await app.inject({ method: "POST", url: "/api/logout", headers: { ...json, cookie }, payload: {} });
    expect((await app.inject({ url: "/api/status", headers: { cookie } })).statusCode).toBe(401);
  });

  it("Rate-Limit nach 5 Fehlversuchen", async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await app.inject({ method: "POST", url: "/api/login", headers: json, payload: { password: "x" }, remoteAddress: "10.9.9.9" })).statusCode;
    }
    expect(last).toBe(429);
    // auch das richtige Passwort wird während der Sperre abgelehnt
    expect((await app.inject({ method: "POST", url: "/api/login", headers: json, payload: { password: DASH_PW }, remoteAddress: "10.9.9.9" })).statusCode).toBe(429);
  }, 20_000);
});

describe("Server ohne /tps und /mspt (Vanilla/Fabric/Spigot)", () => {
  it("blendet Leistungswerte aus, statt ständig zu warnen", async () => {
    const world = new MockWorld();
    const vanilla = await startMockRconServer({
      password: "pw",
      handler: (c) => (c === "tps" || c === "mspt" ? `Unknown or incomplete command. See below for error\n${c}<--[HERE]` : world.handle(c)),
    });
    const r = new Repo(openMemoryDb());
    const d = new Diagnostics();
    const client = new RconClient({ host: "127.0.0.1", port: vanilla.port, password: "pw" });
    const p = new Poller(client, r, new SessionTracker(r), d, { pollIntervalMs: 60_000, perfIntervalMs: 0, floodgatePrefix: ".", mock: false, version: "test" });
    client.start();
    await client.waitForConnected();
    await p.cycle();
    await p.cycle();
    expect(p.status().perf).toBeNull();
    expect(p.status().online).toBeGreaterThan(0);
    expect(d.getWarnings().map((w) => [w.level, w.key])).toEqual(expect.arrayContaining([["info", "no-tps"], ["info", "no-mspt"]]));
    expect(d.getWarnings().filter((w) => w.level !== "info")).toEqual([]);
    // nach dem ersten Mal werden die Befehle nicht mehr gesendet
    expect((d.getRaw().tps ?? []).length).toBe(1);
    client.stop();
    await vanilla.close();
  });
});
