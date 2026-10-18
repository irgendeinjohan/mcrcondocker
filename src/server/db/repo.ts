// Typisierte Datenbankzugriffe.
import type { GapEntry, GameMode, PlayerData, SessionEntry } from "../../shared/types.js";
import type { Db } from "./db.js";

export interface PlayerRow {
  uuid: string;
  name: string;
  is_bedrock: number;
  first_seen: number | null;
  last_seen: number | null;
}

export interface SnapshotRow {
  uuid: string;
  taken_at: number;
  dimension: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  health: number | null;
  max_health: number | null;
  food: number | null;
  xp_level: number | null;
  game_mode: GameMode | null;
  parsed_json: string;
  raw: string | null;
  parser_version: number;
}

export class Repo {
  constructor(readonly db: Db) {}

  // --- Einstellungen ---
  getSetting(key: string): string | null {
    const r = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return r?.value ?? null;
  }

  setSetting(key: string, value: string | null): void {
    if (value === null) this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    else this.db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  // --- Spieler ---
  upsertPlayer(uuid: string, name: string, isBedrock: boolean, seenAt: number): void {
    this.db
      .prepare(
        `INSERT INTO players (uuid, name, is_bedrock, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(uuid) DO UPDATE SET name = excluded.name, is_bedrock = excluded.is_bedrock, last_seen = excluded.last_seen`,
      )
      .run(uuid, name, isBedrock ? 1 : 0, seenAt, seenAt);
  }

  listPlayers(): PlayerRow[] {
    return this.db.prepare("SELECT * FROM players ORDER BY last_seen DESC").all() as unknown as PlayerRow[];
  }

  getPlayer(uuid: string): PlayerRow | undefined {
    return this.db.prepare("SELECT * FROM players WHERE uuid = ?").get(uuid) as PlayerRow | undefined;
  }

  // --- Datenstände ---
  saveSnapshot(uuid: string, takenAt: number, data: PlayerData, raw: string | null, parserVersion: number): void {
    this.db
      .prepare(
        `INSERT INTO player_snapshot (uuid, taken_at, dimension, x, y, z, health, max_health, food, xp_level, game_mode, parsed_json, raw, parser_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(uuid) DO UPDATE SET taken_at = excluded.taken_at, dimension = excluded.dimension, x = excluded.x, y = excluded.y,
           z = excluded.z, health = excluded.health, max_health = excluded.max_health, food = excluded.food, xp_level = excluded.xp_level,
           game_mode = excluded.game_mode, parsed_json = excluded.parsed_json, raw = excluded.raw, parser_version = excluded.parser_version`,
      )
      .run(
        uuid, takenAt, data.dimension, data.pos.x, data.pos.y, data.pos.z, data.health, data.maxHealth, data.food,
        data.xpLevel, data.gameMode, JSON.stringify(data), raw, parserVersion,
      );
  }

  listSnapshots(): SnapshotRow[] {
    return this.db.prepare("SELECT * FROM player_snapshot").all() as unknown as SnapshotRow[];
  }

  getSnapshot(uuid: string): SnapshotRow | undefined {
    return this.db.prepare("SELECT * FROM player_snapshot WHERE uuid = ?").get(uuid) as SnapshotRow | undefined;
  }

  outdatedSnapshots(parserVersion: number): SnapshotRow[] {
    return this.db.prepare("SELECT * FROM player_snapshot WHERE parser_version < ? AND raw IS NOT NULL").all(parserVersion) as unknown as SnapshotRow[];
  }

  // --- Sessions ---
  openSessions(): SessionEntry[] {
    return (this.db.prepare(`SELECT id, uuid, start, "end", end_reason FROM sessions WHERE "end" IS NULL`).all() as unknown as RawSession[]).map(toSession);
  }

  startSession(uuid: string, start: number): void {
    this.db.prepare("INSERT INTO sessions (uuid, start) VALUES (?, ?)").run(uuid, start);
  }

  endSession(id: number, end: number, reason: "logout" | "unknown"): void {
    this.db.prepare(`UPDATE sessions SET "end" = ?, end_reason = ? WHERE id = ?`).run(end, reason, id);
  }

  sessionsFor(uuid: string, limit: number): SessionEntry[] {
    return (this.db.prepare(`SELECT id, uuid, start, "end", end_reason FROM sessions WHERE uuid = ? ORDER BY start DESC LIMIT ?`).all(uuid, limit) as unknown as RawSession[]).map(toSession);
  }

  sessionTotals(now: number): { uuid: string; total: number; count: number }[] {
    return this.db
      .prepare(`SELECT uuid, SUM(COALESCE("end", ?) - start) AS total, COUNT(*) AS count FROM sessions GROUP BY uuid`)
      .all(now) as unknown as { uuid: string; total: number; count: number }[];
  }

  // --- Lücken ---
  openGap(): GapEntry | undefined {
    const r = this.db.prepare(`SELECT id, start, "end", reason FROM gaps WHERE "end" IS NULL ORDER BY id DESC LIMIT 1`).get() as GapEntry | undefined;
    return r ? { ...r } : undefined;
  }

  startGap(start: number, reason: GapEntry["reason"]): void {
    this.db.prepare("INSERT INTO gaps (start, reason) VALUES (?, ?)").run(start, reason);
  }

  endGap(id: number, end: number): void {
    this.db.prepare(`UPDATE gaps SET "end" = ? WHERE id = ?`).run(end, id);
  }

  recentGaps(since: number): GapEntry[] {
    return (this.db.prepare(`SELECT id, start, "end", reason FROM gaps WHERE COALESCE("end", 9e15) >= ? ORDER BY start DESC LIMIT 200`).all(since) as unknown as GapEntry[]).map((g) => ({ ...g }));
  }

  // --- Login-Sessions ---
  createAuthSession(tokenHash: string, now: number, expiresAt: number): void {
    this.db.prepare("INSERT INTO auth_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)").run(tokenHash, now, expiresAt);
  }

  validAuthSession(tokenHash: string, now: number): boolean {
    return !!this.db.prepare("SELECT 1 FROM auth_sessions WHERE token_hash = ? AND expires_at > ?").get(tokenHash, now);
  }

  deleteAuthSession(tokenHash: string): void {
    this.db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash);
  }

  purgeAuthSessions(now: number): void {
    this.db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(now);
  }
}

interface RawSession {
  id: number;
  uuid: string;
  start: number;
  end: number | null;
  end_reason: string | null;
}

function toSession(r: RawSession): SessionEntry {
  return { id: r.id, uuid: r.uuid, start: r.start, end: r.end, endReason: (r.end_reason as SessionEntry["endReason"]) ?? null };
}
