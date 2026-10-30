// Named dashboard users, scrypt passwords, revocable sessions, and login rate limits.
import { createHash, randomBytes, timingSafeEqual, scryptSync } from "node:crypto";
import { USERNAME_RE, type DashboardUser } from "../shared/users.js";
import type { UserRow } from "./db/repo.js";
import type { Repo } from "./db/repo.js";

export const COOKIE_NAME = "mcdash_session";

const WINDOW_MS = 15 * 60_000;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_GLOBAL = 30;

function sha256(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

export function hashToken(token: string): string {
  return sha256(token).toString("hex");
}

export class Auth {
  private readonly bootstrap: UserRow;
  private fails = new Map<string, number[]>();
  private globalFails: number[] = [];

  constructor(password: string, private readonly repo: Repo, private readonly sessionDays: number) {
    const existing = repo.userByName("admin");
    if (existing && !existing.bootstrap) throw new Error("The reserved admin identity is not a bootstrap account");
    if (existing && !verifyPassword(password, existing.password_hash)) {
      repo.updateUser(existing.id, "operator", true, passwordHash(password));
    }
    this.bootstrap = repo.userByName("admin") ?? repo.addUser("admin", passwordHash(password), "operator", true);
  }

  authenticate(username: string, password: string): DashboardUser | null {
    const user = USERNAME_RE.test(username) ? this.repo.userByName(username) : undefined;
    // Unknown accounts still do the same expensive password work.
    const valid = verifyPassword(password, user?.password_hash ?? this.bootstrap.password_hash);
    return user?.enabled && valid ? publicUser(user) : null;
  }

  listUsers(): DashboardUser[] { return this.repo.listUsers().map(publicUser); }

  createUser(input: { username?: unknown; password?: unknown; role?: unknown }): DashboardUser {
    if (typeof input.username !== "string" || !USERNAME_RE.test(input.username) || input.username.toLowerCase() === "admin") throw new Error("Ungültiger Benutzername");
    if (input.role !== "viewer" && input.role !== "operator") throw new Error("Ungültige Rolle");
    validatePassword(input.password);
    if (this.repo.userByName(input.username)) throw new Error("Benutzername bereits vergeben");
    return publicUser(this.repo.addUser(input.username, passwordHash(input.password as string), input.role));
  }

  updateUser(id: number, input: { role?: unknown; enabled?: unknown; password?: unknown }, actor: DashboardUser): DashboardUser {
    const user = this.repo.userById(id);
    if (!user) throw new Error("Benutzer unbekannt");
    if (user.bootstrap) throw new Error("Das Administratorkonto wird über DASHBOARD_PASSWORD verwaltet");
    if (input.role !== "viewer" && input.role !== "operator") throw new Error("Ungültige Rolle");
    if (typeof input.enabled !== "boolean") throw new Error("enabled (boolean) erwartet");
    if (id === actor.id && (!input.enabled || input.role !== "operator")) throw new Error("Das eigene Konto kann nicht deaktiviert oder herabgestuft werden");
    let hash: string | undefined;
    if (input.password !== undefined) { validatePassword(input.password); hash = passwordHash(input.password as string); }
    this.repo.updateUser(id, input.role, input.enabled, hash);
    return publicUser(this.repo.userById(id)!);
  }

  /** Millisekunden bis zum nächsten erlaubten Versuch, 0 = erlaubt */
  retryAfter(ip: string, now = Date.now()): number {
    const prune = (list: number[]) => list.filter((t) => now - t < WINDOW_MS);
    const mine = prune(this.fails.get(ip) ?? []);
    this.fails.set(ip, mine);
    this.globalFails = prune(this.globalFails);
    if (mine.length >= MAX_FAILS_PER_IP) return WINDOW_MS - (now - mine[0]!);
    if (this.globalFails.length >= MAX_FAILS_GLOBAL) return WINDOW_MS - (now - this.globalFails[0]!);
    return 0;
  }

  recordFailure(ip: string, now = Date.now()): void {
    const list = this.fails.get(ip) ?? [];
    list.push(now);
    this.fails.set(ip, list);
    this.globalFails.push(now);
    if (this.fails.size > 10_000) this.fails.clear();
  }

  recordSuccess(ip: string): void {
    this.fails.delete(ip);
  }

  createSession(user: DashboardUser, now = Date.now()): { token: string; maxAgeSeconds: number } {
    const token = randomBytes(32).toString("base64url");
    const maxAgeSeconds = this.sessionDays * 86_400;
    this.repo.purgeAuthSessions(now);
    this.repo.createAuthSession(hashToken(token), now, now + maxAgeSeconds * 1000, user.id);
    return { token, maxAgeSeconds };
  }

  sessionUser(token: string | undefined, now = Date.now()): DashboardUser | null {
    if (!token || token.length > 200) return null;
    const row = this.repo.sessionUser(hashToken(token), now);
    return row ? publicUser(row) : null;
  }
  validSession(token: string | undefined, now = Date.now()): boolean { return !!this.sessionUser(token, now); }

  destroySession(token: string | undefined): void {
    if (token) this.repo.deleteAuthSession(hashToken(token));
  }
}

function publicUser(row: UserRow): DashboardUser {
  return { id: row.id, username: row.username, role: row.role, enabled: !!row.enabled, bootstrap: !!row.bootstrap };
}
function validatePassword(input: unknown): void {
  if (typeof input !== "string" || input.length < 8 || Buffer.byteLength(input) > 1024) throw new Error("Passwort muss 8 bis 1024 Bytes lang sein");
}
function passwordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}
function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, hash] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !hash || Buffer.byteLength(password) > 1024) return false;
  const expected = Buffer.from(hash, "hex");
  const candidate = scryptSync(password, salt, 32);
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

export function clearCookie(secure: boolean): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}
