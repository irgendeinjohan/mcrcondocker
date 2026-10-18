// Konfiguration ausschließlich aus Umgebungsvariablen (siehe .env.example).
import path from "node:path";

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  assetsDir: string;
  dashboardPassword: string;
  sessionDays: number;
  cookieSecure: "auto" | boolean;
  trustProxy: boolean;
  rcon: { host: string; port: number; password: string; timeoutMs: number };
  pollIntervalMs: number;
  perfIntervalMs: number;
  floodgatePrefix: string;
  extraDangerous: string[];
  mock: boolean;
  logLevel: string;
}

export class ConfigError extends Error {}

function int(env: NodeJS.ProcessEnv, key: string, def: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new ConfigError(`${key} muss eine Zahl sein`);
  return Math.min(max, Math.max(min, n));
}

function bool(env: NodeJS.ProcessEnv, key: string, def: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return def;
  return ["1", "true", "yes", "ja", "on"].includes(raw);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mock = bool(env, "MOCK", false);
  const dataDir = path.resolve(env.DATA_DIR || (mock ? "./data-mock" : "./data"));
  let dashboardPassword = env.DASHBOARD_PASSWORD ?? "";
  if (!dashboardPassword) {
    if (mock) dashboardPassword = "mock";
    else throw new ConfigError("DASHBOARD_PASSWORD ist nicht gesetzt");
  }
  if (!mock && dashboardPassword.length < 8) {
    throw new ConfigError("DASHBOARD_PASSWORD muss mindestens 8 Zeichen lang sein");
  }
  const rconHost = env.RCON_HOST ?? "";
  const rconPassword = env.RCON_PASSWORD ?? "";
  if (!mock && !rconHost) throw new ConfigError("RCON_HOST ist nicht gesetzt");
  if (!mock && !rconPassword) throw new ConfigError("RCON_PASSWORD ist nicht gesetzt");
  const secureRaw = (env.COOKIE_SECURE ?? "auto").trim().toLowerCase();
  return {
    port: int(env, "PORT", 8080, 1, 65535),
    host: env.HOST || "0.0.0.0",
    dataDir,
    assetsDir: path.resolve(env.ASSETS_DIR || path.join(dataDir, "assets")),
    dashboardPassword,
    sessionDays: int(env, "SESSION_DAYS", 30, 1, 365),
    cookieSecure: secureRaw === "auto" ? "auto" : bool(env, "COOKIE_SECURE", false),
    trustProxy: bool(env, "TRUST_PROXY", false),
    rcon: {
      host: rconHost || "127.0.0.1",
      port: int(env, "RCON_PORT", 25575, 1, 65535),
      password: rconPassword,
      timeoutMs: int(env, "RCON_TIMEOUT_SECONDS", 10, 2, 120) * 1000,
    },
    pollIntervalMs: int(env, "POLL_INTERVAL_SECONDS", 5, 2, 3600) * 1000,
    perfIntervalMs: int(env, "PERF_INTERVAL_SECONDS", 30, 5, 3600) * 1000,
    floodgatePrefix: env.FLOODGATE_PREFIX ?? ".",
    extraDangerous: (env.DANGEROUS_COMMANDS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    mock,
    logLevel: env.LOG_LEVEL || "info",
  };
}
