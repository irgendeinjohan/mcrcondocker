import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fixture } from "./helpers.js";
import { Auth } from "../../src/server/auth.js";
import { openDb, openMemoryDb } from "../../src/server/db/db.js";
import { Repo } from "../../src/server/db/repo.js";
import { Backups, restoreBackup, verifyBackup } from "../../src/server/backups.js";
import { readiness } from "../../src/shared/readiness.js";
import type { ServerStatus } from "../../src/shared/types.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const temp = () => { const dir = mkdtempSync(path.join(tmpdir(), "mcdash-test-")); directories.push(dir); return dir; };

describe("named users", () => {
  it("migrates the original database without losing player history and revokes anonymous sessions", () => {
    const directory = temp();
    const legacy = new DatabaseSync(path.join(directory, "dashboard.db"));
    legacy.exec(fixture("migrations/v2.sql"));
    legacy.prepare("INSERT INTO settings(key, value) VALUES (?, ?)").run("bluemap.url", "https://map.example.com/");
    legacy.prepare("INSERT INTO players(uuid, name) VALUES (?, ?)").run("test-player", "Existing player");
    legacy.prepare("INSERT INTO sessions(uuid, start, end) VALUES (?, ?, ?)").run("test-player", 100, 500);
    legacy.prepare("INSERT INTO audit_log(at, source, label, command, ok, output) VALUES (?, ?, ?, ?, ?, ?)").run(100, "console", "seed", "seed", 1, "original response");
    legacy.prepare("INSERT INTO auth_sessions(token_hash, created_at, expires_at) VALUES (?, ?, ?)").run("anonymous-old-token", 1, Date.now() + 100000);
    legacy.close();
    const migrated = openDb(directory);
    try {
      const repo = new Repo(migrated);
      expect(repo.getSetting("bluemap.url")).toBe("https://map.example.com/");
      expect(repo.listPlayers()[0]?.name).toBe("Existing player");
      expect(repo.sessionsFor("test-player", 10)[0]).toMatchObject({ start: 100, end: 500 });
      expect(repo.listAudit(1)[0]).toMatchObject({ output: "original response", actor: null });
      expect(migrated.prepare("SELECT COUNT(*) AS n FROM auth_sessions").get()).toMatchObject({ n: 0 });
      const auth = new Auth("existing-dashboard-password", repo, 30);
      expect(auth.authenticate("admin", "existing-dashboard-password")?.role).toBe("operator");
    } finally { migrated.close(); }
  });

  it("hashes passwords, attributes sessions, revokes account changes, and protects bootstrap admin", () => {
    const repo = new Repo(openMemoryDb());
    try {
      const auth = new Auth("administrator-password", repo, 30);
      const admin = auth.authenticate("admin", "administrator-password")!;
      const user = auth.createUser({ username: "reader", password: "reader-password", role: "viewer" });
      expect(repo.userByName("reader")?.password_hash).toMatch(/^scrypt:/);
      expect(repo.userByName("reader")?.password_hash).not.toContain("reader-password");
      expect(auth.authenticate("READER", "reader-password")?.role).toBe("viewer");
      expect(auth.authenticate("reader", "wrong-password")).toBeNull();
      expect(auth.authenticate("unknown", "administrator-password")).toBeNull();
      const session = auth.createSession(user);
      expect(auth.sessionUser(session.token)?.username).toBe("reader");
      auth.updateUser(user.id, { role: "operator", enabled: true }, admin);
      expect(auth.validSession(session.token)).toBe(false);
      expect(auth.authenticate("reader", "reader-password")?.role).toBe("operator");
      auth.updateUser(user.id, { role: "viewer", enabled: false }, admin);
      expect(auth.authenticate("reader", "reader-password")).toBeNull();
      expect(() => auth.updateUser(admin.id, { role: "viewer", enabled: false }, admin)).toThrow();
      expect(() => auth.createUser({ username: "READER", password: "reader-password", role: "viewer" })).toThrow();
      expect(() => auth.createUser({ username: "admin", password: "reader-password", role: "viewer" })).toThrow();
      expect(JSON.stringify(auth.listUsers())).not.toContain("scrypt:");
    } finally { repo.db.close(); }
  });

  it("revokes bootstrap sessions when DASHBOARD_PASSWORD changes and retains other accounts", () => {
    const repo = new Repo(openMemoryDb());
    try {
      const old = new Auth("old-password", repo, 30);
      const token = old.createSession(old.authenticate("admin", "old-password")!).token;
      old.createUser({ username: "viewer", password: "viewer-password", role: "viewer" });
      const updated = new Auth("new-password", repo, 30);
      expect(updated.validSession(token)).toBe(false);
      expect(updated.authenticate("admin", "old-password")).toBeNull();
      expect(updated.authenticate("admin", "new-password")).not.toBeNull();
      expect(updated.authenticate("viewer", "viewer-password")).not.toBeNull();
    } finally { repo.db.close(); }
  });
});

describe("consistent SQLite backups", () => {
  it("includes committed WAL writes, verifies restoration, invalidates sessions, and refuses overwrites", async () => {
    const directory = temp();
    const db = openDb(directory);
    try {
      const repo = new Repo(db);
      repo.setSetting("bluemap.url", "https://map.example.com/");
      const auth = new Auth("admin-password", repo, 30);
      auth.createSession(auth.authenticate("admin", "admin-password")!);
      const service = new Backups(db, path.join(directory, "backups"), 2);
      const first = await service.create();
      expect(verifyBackup(service.file(first.name)).schemaVersion).toBe(3);
      expect(statSync(service.file(first.name)).mode & 0o777).toBe(0o600);
      const restoredFile = path.join(directory, "restore-check.db");
      await restoreBackup(service.file(first.name), restoredFile);
      const restored = new DatabaseSync(restoredFile);
      try {
        expect(restored.prepare("SELECT value FROM settings WHERE key = 'bluemap.url'").get()).toMatchObject({ value: "https://map.example.com/" });
        expect(restored.prepare("SELECT COUNT(*) AS n FROM auth_sessions").get()).toMatchObject({ n: 0 });
        expect(restored.prepare("SELECT COUNT(*) AS n FROM dashboard_users").get()).toMatchObject({ n: 1 });
      } finally { restored.close(); }
      const before = readFileSync(restoredFile);
      await expect(restoreBackup(service.file(first.name), restoredFile)).rejects.toThrow();
      expect(readFileSync(restoredFile)).toEqual(before);
      await Promise.all([service.create(), service.create()]);
      await service.create();
      expect(await service.list()).toHaveLength(2);
      expect(readdirSync(service.directory).some((file) => file.endsWith(".partial"))).toBe(false);
      expect(() => service.file("../../dashboard.db")).toThrow();
    } finally { db.close(); }
  });

  it("rejects corrupt databases and non-dashboard databases", () => {
    const directory = temp();
    const invalid = path.join(directory, "bad.sqlite");
    writeFileSync(invalid, "not a SQLite database");
    expect(() => verifyBackup(invalid)).toThrow();
    const empty = path.join(directory, "empty.sqlite");
    new DatabaseSync(empty).close();
    expect(() => verifyBackup(empty)).toThrow("Not a dashboard database");
  });
});

describe("readiness", () => {
  const healthy = { connection: "connected", paused: false, degraded: false, lastUpdate: 10000, pollIntervalMs: 5000 } as ServerStatus;
  it("requires a connected, current, unpaused, fully parsed state", () => {
    expect(readiness(healthy, 12000).ready).toBe(true);
    for (const change of [{ connection: "error" }, { paused: true }, { degraded: true }, { lastUpdate: null }]) {
      expect(readiness({ ...healthy, ...change } as ServerStatus, 12000).ready).toBe(false);
    }
    expect(readiness(healthy, 30000)).toMatchObject({ ready: false, stale: true });
  });
});
