import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS: string[] = [
  // 1: Grundschema
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE players (
    uuid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_bedrock INTEGER NOT NULL DEFAULT 0,
    first_seen INTEGER,
    last_seen INTEGER
  );
  CREATE TABLE player_snapshot (
    uuid TEXT PRIMARY KEY REFERENCES players(uuid),
    taken_at INTEGER NOT NULL,
    dimension TEXT,
    x REAL, y REAL, z REAL,
    health REAL, max_health REAL, food INTEGER, xp_level INTEGER, game_mode TEXT,
    parsed_json TEXT NOT NULL,
    raw TEXT,
    parser_version INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL REFERENCES players(uuid),
    start INTEGER NOT NULL,
    "end" INTEGER,
    end_reason TEXT
  );
  CREATE INDEX sessions_uuid ON sessions(uuid, start);
  CREATE INDEX sessions_open ON sessions("end") WHERE "end" IS NULL;
  CREATE TABLE gaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start INTEGER NOT NULL,
    "end" INTEGER,
    reason TEXT NOT NULL
  );
  CREATE TABLE auth_sessions (
    token_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  `,
  // 2: Aktionsprotokoll
  `
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    source TEXT NOT NULL,
    label TEXT NOT NULL,
    command TEXT NOT NULL,
    ok INTEGER NOT NULL,
    output TEXT NOT NULL
  );
  CREATE INDEX audit_log_at ON audit_log(at);
  `,
];

export type Db = DatabaseSync;

export function openDb(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "dashboard.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

export function openMemoryDb(): Db {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
