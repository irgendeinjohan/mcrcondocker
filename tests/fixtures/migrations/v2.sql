-- Pre-user-accounts schema from the original project. Keep this fixture fixed.
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

PRAGMA user_version = 2;
