import type { ServerStatus } from "./types.js";
export function readiness(status: ServerStatus, now = Date.now()) {
  const stale = status.lastUpdate === null || now - status.lastUpdate > status.pollIntervalMs * 3 + 2000;
  const ready = status.connection === "connected" && !status.paused && !status.degraded && !stale;
  return { ready, connection: status.connection, paused: status.paused, degraded: status.degraded, stale };
}
