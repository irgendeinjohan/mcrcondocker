// Integrationstest: kompletter Stack (Fastify → Poller → RCON-Client → Mock-RCON-Server → MockWorld)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ActionService } from "../../src/server/actions.js";
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
let world: MockWorld;

beforeAll(async () => {
  world = new MockWorld();
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
  const actions = new ActionService(rcon, repo, diag, { nameOf: (u) => poller.nameOf(u) });
  const consoleService = new ConsoleService(rcon, diag, [], (cmd, ok, out, actor) => actions.audit("console", cmd, cmd, ok, out, actor));
  app = await buildApp({ config, repo, poller, console: consoleService, actions, diag, rcon, assets: new Assets("/nonexistent"), version: "test", webRoot: "/nonexistent" });
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

  it("protects BlueMap settings, validates URLs, persists changes, and isolates frame permissions", async () => {
    expect((await app.inject({ url: "/api/settings/bluemap" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/bluemap/view" })).statusCode).toBe(401);
    const settings = (payload: unknown, headers = { ...json, cookie }) =>
      app.inject({ method: "POST", url: "/api/settings/bluemap", headers, payload });
    expect((await settings({ url: "javascript:alert(1)" })).statusCode).toBe(400);
    expect((await settings({ url: "https://user:password@map.example.com/" })).statusCode).toBe(400);
    expect((await settings({})).statusCode).toBe(400);
    expect((await settings({ url: "https://map.example.com/" }, { ...json, cookie, origin: "https://evil.example.com" } as typeof json & { cookie: string })).statusCode).toBe(403);
    const url = "https://map.example.com:8100/maps/?a=1&b=%22#world:0:0:0";
    expect((await settings({ url })).json()).toEqual({ url });
    expect(repo.getSetting("bluemap.url")).toBe(url);
    expect((await app.inject({ url: "/api/settings/bluemap", headers: { cookie } })).json()).toEqual({ url });
    const frame = await app.inject({ url: "/api/bluemap/view?v=1", headers: { cookie } });
    expect(frame.statusCode).toBe(200);
    expect(frame.headers["content-type"]).toContain("text/html");
    expect(frame.body).toContain("a=1&amp;b=%22");
    expect(frame.body).toContain('sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-downloads"');
    expect(frame.headers["content-security-policy"]).toContain("frame-src https://map.example.com:8100;");
    expect(frame.headers["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(frame.headers["x-frame-options"]).toBe("SAMEORIGIN");
    const dashboard = await app.inject({ url: "/api/status", headers: { cookie } });
    expect(dashboard.headers["content-security-policy"]).toContain("frame-src 'self';");
    expect(dashboard.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(dashboard.headers["x-frame-options"]).toBe("DENY");
    expect((await settings({ url: null })).json()).toEqual({ url: null });
    expect(repo.getSetting("bluemap.url")).toBeNull();
    expect((await app.inject({ url: "/api/bluemap/view", headers: { cookie } })).statusCode).toBe(404);
  });

  it("serves language and GUI routes only to authenticated sessions", async () => {
    expect((await app.inject({ url: "/api/translations?lang=en" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/gui/food_full" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/translations?lang=en", headers: { cookie } })).json()).toEqual({});
    expect((await app.inject({ url: "/api/gui/not_a_sprite", headers: { cookie } })).statusCode).toBe(404);
  });

  it("enforces viewer permissions on every administration API and revokes changed accounts", async () => {
    const created = await app.inject({ method: "POST", url: "/api/users", headers: { ...json, cookie }, payload: { username: "read-only", password: "viewer-password", role: "viewer" } });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain("scrypt:");
    const login = await app.inject({ method: "POST", url: "/api/login", headers: json, payload: { username: "read-only", password: "viewer-password" } });
    expect(login.json().user.role).toBe("viewer");
    const viewer = String(login.headers["set-cookie"]).split(";")[0]!;
    const headers = { ...json, cookie: viewer };
    expect((await app.inject({ url: "/api/session", headers })).json().user.username).toBe("read-only");
    for (const url of ["/api/status", "/api/players", "/api/sessions", "/api/settings/bluemap", "/api/assets"]) expect((await app.inject({ url, headers })).statusCode, url).toBe(200);
    for (const url of ["/api/console", "/api/debug", "/api/debug/export", "/api/audit", "/api/users", "/api/backups", "/api/world", "/api/bans"]) expect((await app.inject({ url, headers })).statusCode, url).toBe(403);
    const sent = rcon.sentCount;
    for (const url of ["/api/action", "/api/console", "/api/pause", "/api/settings/bluemap", "/api/world/spawn", "/api/debug/clear-warnings", "/api/users", "/api/backups"]) {
      expect((await app.inject({ method: "POST", url, headers, payload: {} })).statusCode, url).toBe(403);
    }
    expect(rcon.sentCount).toBe(sent);
    await app.inject({ method: "PATCH", url: `/api/users/${created.json().id}`, headers: { ...json, cookie }, payload: { role: "viewer", enabled: false } });
    expect((await app.inject({ url: "/api/status", headers })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/audit", headers: { cookie } })).json().some((entry: { actor: string }) => entry.actor === "admin")).toBe(true);
  });

  it("keeps liveness independent from readiness", async () => {
    expect((await app.inject({ url: "/healthz" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/readyz" })).statusCode).toBe(200);
    poller.setPaused(true);
    expect((await app.inject({ url: "/readyz" })).statusCode).toBe(503);
    expect((await app.inject({ url: "/healthz" })).statusCode).toBe(200);
    poller.setPaused(false);
    await poller.cycle();
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

describe("Aktionen, Welt, Bann-Liste, Protokoll", () => {
  const alex = "36532b5e-c442-3dbb-a24c-c7e55d0f979a";
  const steve = "00000000-0000-0000-0009-01f5f0fa4c3b";
  const act = (action: unknown, confirmed = false) =>
    app.inject({ method: "POST", url: "/api/action", headers: { ...json, cookie }, payload: { action, confirmed } });
  const mock = () => world.players.find((p) => p.uuid === alex)!;

  beforeAll(async () => {
    const r = await app.inject({ method: "POST", url: "/api/login", headers: json, payload: { password: DASH_PW } });
    cookie = String(r.headers["set-cookie"]).split(";")[0]!;
  });

  it("Spielmodus setzen", async () => {
    const r = await act({ type: "gamemode", uuid: alex, mode: "creative" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, label: "Spielmodus von Alex → Kreativ", commands: [`execute as ${alex} run gamemode creative @s`] });
    expect(mock().gameMode).toBe(1);
    await act({ type: "gamemode", uuid: alex, mode: "survival" });
  });

  it("returns English action labels and confirmations when requested", async () => {
    const headers = { ...json, cookie, "accept-language": "en" };
    const result = await app.inject({ method: "POST", url: "/api/action", headers, payload: { action: { type: "heal", uuid: alex } } });
    expect(result.json()).toMatchObject({ ok: true, label: "Healed Alex" });
    const confirmation = await app.inject({ method: "POST", url: "/api/action", headers, payload: { action: { type: "clear", uuid: alex } } });
    expect(confirmation.statusCode).toBe(409);
    expect(confirmation.json()).toMatchObject({ needsConfirmation: true, reason: "The entire inventory of Alex will be deleted." });
  });

  it("Heilen, Teleport zu Spieler und Koordinaten, Oberfläche (Karte)", async () => {
    mock().health = 3;
    expect((await act({ type: "heal", uuid: alex })).json().ok).toBe(true);
    expect(mock().health).toBe(20);
    expect((await act({ type: "tp_player", uuid: alex, target: steve })).json().ok).toBe(true);
    expect(mock().pos).toEqual(world.players.find((p) => p.uuid === steve)!.pos);
    await act({ type: "tp_coords", uuid: alex, dimension: "minecraft:the_nether", x: 10, y: 70, z: -20.5 });
    expect([mock().dimension, ...mock().pos]).toEqual(["minecraft:the_nether", 10, 70, -20.5]);
    const r = (await act({ type: "tp_surface", uuid: alex, dimension: "minecraft:the_nether", x: 100.7, z: -3.2, maxY: 120 })).json();
    expect(r.commands).toEqual([`execute in minecraft:the_nether run spreadplayers 100.5 -3.5 0 1 under 120 false ${alex}`]);
    expect(r.ok).toBe(true);
  });

  it("Kicken und Inventar leeren über execute as (UUID wäre für Spieler-Befehle unzulässig)", async () => {
    const ninja = "65366474-7912-31ba-8ffe-0c2eab803f9e";
    expect((await act({ type: "kick", uuid: ninja, reason: "AFK" }, true)).json()).toMatchObject({ ok: true, commands: [`execute as ${ninja} run kick @s AFK`] });
    expect((await act({ type: "clear", uuid: ninja }, true)).json()).toMatchObject({ ok: true, output: "Removed 3 item(s) from player NetherNinja" });
  });

  it("Items geben, Fehler vom Server wird erkannt", async () => {
    expect((await act({ type: "give", uuid: alex, item: "torch", count: 64 })).json()).toMatchObject({ ok: true, commands: [`execute as ${alex} run give @s minecraft:torch 64`] });
    expect((await act({ type: "give", uuid: alex, item: "minecraft:Gibts-Nicht", count: 1 })).statusCode).toBe(400);
    expect((await act({ type: "give", uuid: alex, item: "torch", count: 0 })).statusCode).toBe(400);
  });

  it("gefährliche Aktionen brauchen eine Bestätigung", async () => {
    const r = await act({ type: "ban", uuid: alex, reason: "Test" });
    expect(r.statusCode).toBe(409);
    expect(r.json().needsConfirmation).toBe(true);
    expect(world.bans.has("Alex")).toBe(false);
    expect((await act({ type: "ban", uuid: alex, reason: "Test" }, true)).json()).toMatchObject({ ok: true, commands: ["ban Alex Test"] });
    expect(world.bans.get("Alex")).toBe("Test");
  });

  it("Bann-Liste lesen und entbannen", async () => {
    const r = await app.inject({ url: "/api/bans", headers: { cookie } });
    expect(r.json().players).toEqual([
      { target: "Griefer123", source: "Rcon", reason: "Hat das Dorf angezündet" },
      { target: "Alex", source: "Rcon", reason: "Test" },
    ]);
    expect((await act({ type: "pardon", name: "Alex" })).json().ok).toBe(true);
    expect((await act({ type: "pardon", name: "Alex" })).json().ok).toBe(false); // „Nothing changed“
    expect((await act({ type: "pardon", name: "Alex; stop" })).statusCode).toBe(400);
  });

  it("Welt: Zeit, Wetter, Schwierigkeit, Gamerules (neue Namen)", async () => {
    await act({ type: "time", preset: "midnight" });
    await act({ type: "weather", weather: "thunder" });
    const w = (await app.inject({ url: "/api/world", headers: { cookie } })).json();
    expect(w.daytime).toBeGreaterThanOrEqual(18000);
    expect(w.daytime).toBeLessThan(18100);
    expect(w.weather).toBe("thunder");
    expect(w.day).toBe(0);
    expect(w.difficulty).toBe("normal");
    expect(w.gamerules.find((g: { key: string }) => g.key === "keepInventory")).toEqual({ key: "keepInventory", name: "keep_inventory", value: false });
    expect(w.gamerules.find((g: { key: string }) => g.key === "playersSleepingPercentage").value).toBe(100);
    expect((await act({ type: "gamerule", rule: "keep_inventory", value: true })).statusCode).toBe(409);
    expect((await act({ type: "gamerule", rule: "keep_inventory", value: true }, true)).json().ok).toBe(true);
    expect(world.gamerules.get("keep_inventory")).toBe("true");
    expect((await act({ type: "gamerule", rule: "doesNotExist", value: true }, true)).statusCode).toBe(400);
  });

  it("Gamerules mit alten Namen (vor 1.21.11)", async () => {
    for (const [k, v] of [...world.gamerules]) {
      world.gamerules.delete(k);
      if (k === "keep_inventory") world.gamerules.set("keepInventory", v);
    }
    const w = (await app.inject({ url: "/api/world", headers: { cookie } })).json();
    // Name war schon aufgelöst → neuer Versuch mit allen Kandidaten im nächsten Abruf
    const w2 = (await app.inject({ url: "/api/world", headers: { cookie } })).json();
    expect([...w.gamerules, ...w2.gamerules].find((g: { key: string }) => g.key === "keepInventory")?.name).toBe("keepInventory");
  });

  it("Nachrichten: Titel mit Untertitel, private Nachricht", async () => {
    const r = (await act({ type: "title", text: 'Hallo "Welt"', subtitle: "Neustart in 5 min" })).json();
    expect(r.commands).toEqual(["title @a times 10 70 20", 'title @a subtitle "Neustart in 5 min"', 'title @a title "Hallo \\"Welt\\""']);
    const msg = (await act({ type: "msg", uuid: alex, text: "Hi\nstop" })).json();
    expect(msg).toMatchObject({ ok: true, commands: ["msg Alex Hi stop"] });
    expect((await act({ type: "say", text: "" })).statusCode).toBe(400);
  });

  it("Weltspawn hinterlegen", async () => {
    const r = await app.inject({ method: "POST", url: "/api/world/spawn", headers: { ...json, cookie }, payload: { spawn: { x: 1, y: 70, z: -2 } } });
    expect(r.json()).toEqual({ worldSpawn: { x: 1, y: 70, z: -2 } });
    expect((await app.inject({ url: "/api/world", headers: { cookie } })).json().worldSpawn).toEqual({ x: 1, y: 70, z: -2 });
  });

  it("Aktionsprotokoll enthält Aktionen und Konsolenbefehle", async () => {
    await app.inject({ method: "POST", url: "/api/console", headers: { ...json, cookie }, payload: { command: "seed" } });
    const log = (await app.inject({ url: "/api/audit?limit=50", headers: { cookie } })).json();
    expect(log[0]).toMatchObject({ source: "console", command: "seed", ok: true });
    expect(log.some((e: { label: string }) => e.label === "Alex gebannt (Test)")).toBe(true);
    expect(log.some((e: { ok: boolean; label: string }) => !e.ok && e.label === "Alex entbannt")).toBe(true);
  });

  it("Todespunkt aus den Spielerdaten", async () => {
    await poller.cycle();
    const d = (await app.inject({ url: `/api/players/${alex}`, headers: { cookie } })).json() as PlayerDetail;
    expect(d.data?.lastDeath).toEqual({ dimension: "minecraft:overworld", pos: { x: 98, y: 63, z: -322 } });
  });
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

describe("Viele Spieler (/list wird vom Server gekürzt)", () => {
  it("findet alle Spieler, auch nach einem Tod am Ende der Liste", async () => {
    const world = new MockWorld();
    const base = world.players[0]!;
    for (let i = 0; i < 4; i++) {
      const ints = [0x1111_0000 + i, 0x2222_0000, -0x3333_0000, 0x4444_0000 + i];
      const hex = ints.map((n) => (n >>> 0).toString(16).padStart(8, "0")).join("");
      world.players.push({
        ...base,
        schedule: undefined,
        name: `Extra${i}`,
        uuid: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
        uuidInts: `[I;${ints.join(",")}]`,
      });
    }
    // Spieler mit Online-Zeitplan entfernen, damit das Ergebnis feststeht
    for (const x of world.players.filter((x) => x.schedule)) world.players.splice(world.players.indexOf(x), 1);
    // gestorbener Spieler steht nach dem Respawn hinten in der Liste
    world.players.push(world.players.shift()!);
    const srv = await startMockRconServer({ password: "pw", handler: (c) => world.handle(c) });
    const r = new Repo(openMemoryDb());
    const d = new Diagnostics();
    const client = new RconClient({ host: "127.0.0.1", port: srv.port, password: "pw" });
    const p = new Poller(client, r, new SessionTracker(r), d, { pollIntervalMs: 60_000, perfIntervalMs: 60_000, floodgatePrefix: ".", mock: false, version: "test" });
    client.start();
    await client.waitForConnected();
    await p.cycle();
    expect(world.players.length).toBeGreaterThan(5);
    expect(d.getRaw().list?.find((x) => x.command === "list uuids")?.body).toMatch(/\.\.\.$/);
    expect(p.status().online).toBe(world.players.length);
    expect(p.summaries().filter((x) => x.online).map((x) => x.name).sort()).toEqual(world.players.map((x) => x.name).sort());
    expect(d.getWarnings().filter((w) => w.key.startsWith("list-"))).toEqual([]);
    client.stop();
    await srv.close();
  });
});
