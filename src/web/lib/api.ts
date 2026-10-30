import type { RenderIndex } from "../../shared/appearance";
import type { DashboardUser, LoginSession, UserRole } from "../../shared/users";
import type { BlueMapSettings } from "../../shared/bluemap";
import { t, language } from "./i18n.svelte";
import type {
  ActionRequest, ActionResult, AuditEntry, BanLists, ConsoleEntry, DiagnosticsSnapshot, GapEntry, ItemInfo, PlayerDetail,
  PlayerSessionStats, PlayerSummary, ServerStatus, SessionEntry, Vec3, WorldState,
} from "../../shared/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Accept-Language": language.locale, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data: Record<string, unknown> = {};
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* kein JSON */
  }
  if (!res.ok) {
    if (res.status === 401 && url !== "/api/login") onUnauthorized();
    throw new ApiError(typeof data.error === "string" ? t(data.error) : t("Fehler {status}", { status: res.status }), res.status, data);
  }
  return data as T;
}

export interface AssetsInfo {
  textures: "rendered" | "folder" | "jar" | null;
  textureSource: string | null;
  language: string | null;
  translations: number;
}

export const api = {
  renderIndex: () => request<RenderIndex>("GET", "/api/render/index"),
  backups: () => request<{ name: string; createdAt: number; bytes: number }[]>("GET", "/api/backups"),
  createBackup: () => request<{ name: string; createdAt: number; bytes: number }>("POST", "/api/backups", {}),
  blueMap: () => request<BlueMapSettings>("GET", "/api/settings/bluemap"),
  setBlueMap: (url: string | null) => request<BlueMapSettings>("POST", "/api/settings/bluemap", { url }),
  session: () => request<LoginSession>("GET", "/api/session"),
  login: (password: string, username = "admin") => request<{ ok: true; user: DashboardUser }>("POST", "/api/login", { password, username }),
  users: () => request<DashboardUser[]>("GET", "/api/users"),
  createUser: (username: string, password: string, role: UserRole) => request<DashboardUser>("POST", "/api/users", { username, password, role }),
  updateUser: (id: number, role: UserRole, enabled: boolean, password?: string) => request<DashboardUser>("PATCH", `/api/users/${id}`, { role, enabled, ...(password ? { password } : {}) }),
  logout: () => request<{ ok: true }>("POST", "/api/logout", {}),
  status: () => request<ServerStatus>("GET", "/api/status"),
  players: () => request<PlayerSummary[]>("GET", "/api/players"),
  player: (uuid: string) => request<PlayerDetail>("GET", `/api/players/${encodeURIComponent(uuid)}`),
  sessions: (uuid?: string) =>
    request<{ stats: PlayerSessionStats[]; sessions?: SessionEntry[]; gaps: GapEntry[] }>(
      "GET",
      uuid ? `/api/sessions?uuid=${encodeURIComponent(uuid)}` : "/api/sessions",
    ),
  setPaused: (paused: boolean) => request<ServerStatus>("POST", "/api/pause", { paused }),
  consoleHistory: () => request<ConsoleEntry[]>("GET", "/api/console"),
  console: (command: string, confirmed = false) => request<ConsoleEntry>("POST", "/api/console", { command, confirmed }),
  debug: () => request<DiagnosticsSnapshot & { assets: AssetsInfo; status: ServerStatus }>("GET", "/api/debug"),
  clearWarnings: () => request<{ ok: true }>("POST", "/api/debug/clear-warnings", {}),
  assets: () => request<AssetsInfo>("GET", "/api/assets"),
  action: (action: ActionRequest, confirmed = false) => request<ActionResult>("POST", "/api/action", { action, confirmed }),
  world: () => request<WorldState>("GET", "/api/world"),
  worldSpawn: () => request<{ worldSpawn: Vec3 | null }>("GET", "/api/world/spawn"),
  setWorldSpawn: (spawn: Vec3 | null) => request<{ worldSpawn: Vec3 | null }>("POST", "/api/world/spawn", { spawn }),
  bans: () => request<BanLists>("GET", "/api/bans"),
  items: (lang: string) => request<ItemInfo[]>("GET", `/api/items?lang=${encodeURIComponent(lang)}`),
  translations: (lang: string) => request<Record<string, string>>("GET", `/api/translations?lang=${encodeURIComponent(lang)}`),
  audit: (limit = 200, before?: number) => request<AuditEntry[]>("GET", `/api/audit?limit=${limit}${before ? `&before=${before}` : ""}`),
};
