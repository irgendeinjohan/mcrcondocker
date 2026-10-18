import type {
  ConsoleEntry, DiagnosticsSnapshot, GapEntry, PlayerDetail, PlayerSessionStats, PlayerSummary, ServerStatus, SessionEntry,
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
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
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
    throw new ApiError(typeof data.error === "string" ? data.error : `Fehler ${res.status}`, res.status, data);
  }
  return data as T;
}

export interface AssetsInfo {
  textures: "folder" | "jar" | null;
  textureSource: string | null;
  language: string | null;
  translations: number;
}

export const api = {
  session: () => request<{ authenticated: boolean; mock: boolean }>("GET", "/api/session"),
  login: (password: string) => request<{ ok: true }>("POST", "/api/login", { password }),
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
};
