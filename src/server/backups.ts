// SQLite online backups include committed WAL data. Never copy a live .db file.
import { backup, DatabaseSync } from "node:sqlite";
import { chmod, mkdir, readdir, stat, rename, rm, open } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { CURRENT_SCHEMA_VERSION, type Db } from "./db/db.js";

const NAME = /^mcdash-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}\.sqlite$/;
const REQUIRED = ["settings", "players", "player_snapshot", "sessions", "gaps", "auth_sessions", "audit_log"];
export interface BackupInfo { name: string; createdAt: number; bytes: number }

export function verifyBackup(file: string): { schemaVersion: number } {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all() as { integrity_check: string }[];
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") throw new Error("SQLite integrity check failed");
    if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("SQLite foreign key check failed");
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name));
    if (REQUIRED.some((name) => !tables.has(name))) throw new Error("Not a dashboard database");
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (version < 2 || version > CURRENT_SCHEMA_VERSION) throw new Error("Unsupported dashboard schema version");
    return { schemaVersion: version };
  } finally { db.close(); }
}

/** Restore to a NEW file only. The operator stops the app and swaps files separately. */
export async function restoreBackup(source: string, destination: string): Promise<void> {
  verifyBackup(source);
  const reservation = await open(destination, "wx", 0o600);
  await reservation.close();
  try {
    const db = new DatabaseSync(source, { readOnly: true });
    try { await backup(db, destination); } finally { db.close(); }
    verifyBackup(destination);
    const restored = new DatabaseSync(destination);
    try { restored.exec("DELETE FROM auth_sessions"); } finally { restored.close(); }
  } catch (e) { await rm(destination, { force: true }); throw e; }
}

export class Backups {
  private inFlight: Promise<BackupInfo> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private readonly db: Db, readonly directory: string, private readonly keep = 7) { if (!Number.isInteger(keep) || keep < 1) throw new Error("Backup retention must be a positive integer"); }

  async list(): Promise<BackupInfo[]> {
    const files = await readdir(this.directory).catch((e: NodeJS.ErrnoException) => { if (e.code === "ENOENT") return []; throw e; });
    const entries = await Promise.all(files.filter((name) => NAME.test(name)).map(async (name) => {
      const info = await stat(path.join(this.directory, name));
      return { name, createdAt: info.mtimeMs, bytes: info.size };
    }));
    return entries.sort((a, b) => b.name.localeCompare(a.name));
  }
  file(name: string): string {
    if (!NAME.test(name)) throw new Error("Ungültiger Backup-Name");
    return path.join(this.directory, name);
  }
  create(): Promise<BackupInfo> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.write().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
  private async write(): Promise<BackupInfo> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const name = `mcdash-${new Date().toISOString().replaceAll(":", "-").replace(".", "-")}-${randomBytes(4).toString("hex")}.sqlite`;
    const target = this.file(name);
    const temporary = `${target}.partial`;
    // Reserve with private permissions before SQLite opens the destination.
    const reserved = await open(temporary, "wx", 0o600); await reserved.close();
    try {
      await backup(this.db, temporary);
      await chmod(temporary, 0o600);
      verifyBackup(temporary);
      await rename(temporary, target);
      const entries = await this.list();
      for (const entry of entries.slice(this.keep)) await rm(this.file(entry.name));
      const result = await stat(target);
      return { name, createdAt: result.mtimeMs, bytes: result.size };
    } catch (e) { await rm(temporary, { force: true }); throw e; }
  }
  async start(intervalMs: number, onError: (e: Error) => void): Promise<void> {
    if (intervalMs <= 0) return;
    const maybe = async () => {
      try {
        const latest = (await this.list())[0];
        if (!latest || Date.now() - latest.createdAt >= intervalMs) await this.create();
      } catch (e) { onError(e as Error); }
    };
    await maybe();
    this.timer = setInterval(() => { void maybe(); }, Math.min(intervalMs, 60 * 60_000));
    this.timer.unref();
  }
  async stop(): Promise<void> { if (this.timer) clearInterval(this.timer); this.timer = null; await this.inFlight; }
}
