import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { ActionService } from "./actions.js";
import { Assets } from "./assets.js";
import { ConfigError, loadConfig } from "./config.js";
import { ConsoleService } from "./console.js";
import { openDb } from "./db/db.js";
import { Repo } from "./db/repo.js";
import { MockWorld } from "./mock-world.js";
import { Diagnostics } from "./parse/diagnostics.js";
import { Poller } from "./poller.js";
import { RconClient } from "./rcon/client.js";
import { startMockRconServer } from "./rcon/mock-server.js";
import { SessionTracker } from "./sessions.js";

function readVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const p of [path.resolve(here, "../../package.json"), path.resolve("package.json")]) {
    if (existsSync(p)) {
      try {
        return (JSON.parse(readFileSync(p, "utf8")) as { version: string }).version;
      } catch {
        /* weiter */
      }
    }
  }
  return "0.0.0";
}

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`Konfigurationsfehler: ${e.message}. Siehe .env.example.`);
      process.exit(1);
    }
    throw e;
  }
  const version = readVersion();
  const db = openDb(config.dataDir);
  const repo = new Repo(db);
  const diag = new Diagnostics();

  let rconTarget = config.rcon;
  let mockServer: Awaited<ReturnType<typeof startMockRconServer>> | undefined;
  if (config.mock) {
    const world = new MockWorld(process.env.MOCK_OLD_FORMAT === "true");
    mockServer = await startMockRconServer({ password: "mock", handler: (c) => world.handle(c), delayMs: 5 });
    rconTarget = { ...config.rcon, host: "127.0.0.1", port: mockServer.port, password: "mock" };
  }

  const rcon = new RconClient({ host: rconTarget.host, port: rconTarget.port, password: rconTarget.password, commandTimeoutMs: rconTarget.timeoutMs });
  const assets = new Assets(config.assetsDir, process.env.LANGUAGE_FILE || "de_de", (m) => console.log(`[assets] ${m}`));
  const tracker = new SessionTracker(repo);
  const poller = new Poller(rcon, repo, tracker, diag, {
    pollIntervalMs: config.pollIntervalMs,
    perfIntervalMs: config.perfIntervalMs,
    floodgatePrefix: config.floodgatePrefix,
    mock: config.mock,
    version,
  }, assets.translate);
  const actions = new ActionService(rcon, repo, diag, { nameOf: (uuid) => poller.nameOf(uuid) });
  const consoleService = new ConsoleService(rcon, diag, config.extraDangerous, (cmd, ok, out) => actions.audit("console", cmd, cmd, ok, out));
  const app = await buildApp({ config, repo, poller, console: consoleService, actions, diag, rcon, assets, version });

  rcon.on("state", (s: string, err: string | null) => app.log.info(`RCON: ${s}${err ? ` (${err})` : ""}`));
  rcon.start();
  poller.start();
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`MC-Dashboard ${version} läuft auf Port ${config.port}${config.mock ? " (MOCK-MODUS, Passwort: " + (process.env.DASHBOARD_PASSWORD ? "aus DASHBOARD_PASSWORD" : "mock") + ")" : ""}`);

  let shuttingDown = false;
  const shutdown = async (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`${sig} empfangen, beende …`);
    poller.stop();
    rcon.stop();
    await app.close().catch(() => {});
    await mockServer?.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main();
