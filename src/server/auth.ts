// Login mit einem Passwort, Session-Cookie, Rate-Limit für Fehlversuche.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
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
  private readonly passwordHash: Buffer;
  private fails = new Map<string, number[]>();
  private globalFails: number[] = [];

  constructor(password: string, private readonly repo: Repo, private readonly sessionDays: number) {
    this.passwordHash = sha256(password);
  }

  /** Zeitkonstanter Vergleich über SHA-256-Digests (gleiche Länge). */
  checkPassword(candidate: string): boolean {
    return timingSafeEqual(sha256(candidate), this.passwordHash);
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

  createSession(now = Date.now()): { token: string; maxAgeSeconds: number } {
    const token = randomBytes(32).toString("base64url");
    const maxAgeSeconds = this.sessionDays * 86_400;
    this.repo.purgeAuthSessions(now);
    this.repo.createAuthSession(hashToken(token), now, now + maxAgeSeconds * 1000);
    return { token, maxAgeSeconds };
  }

  validSession(token: string | undefined, now = Date.now()): boolean {
    if (!token || token.length > 200) return false;
    return this.repo.validAuthSession(hashToken(token), now);
  }

  destroySession(token: string | undefined): void {
    if (token) this.repo.deleteAuthSession(hashToken(token));
  }
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
