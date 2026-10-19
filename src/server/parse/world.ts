// Parser für Antworten auf Welt- und Verwaltungsbefehle (time, gamerule, difficulty, banlist …).
import { stripLegacy } from "../../shared/mctext.js";
import type { BanEntry, Difficulty } from "../../shared/types.js";

const ERROR_PATTERNS = [
  /^Unknown or incomplete command/i,
  /^Incorrect argument for command/i,
  /<--\[HERE\]/,
  /^No (player|entity|targets?) (was|were) found/i,
  /^No entity was found/i,
  /^Unknown (item|block|effect|game ?rule)/i,
  /^Invalid /i,
  /^Expected /i,
  /^That (player|IP)/i,
  /^Could not /i,
  /^Can't /i,
  /^Failed to /i,
  /^Cannot /i,
  /^Nothing changed/i,
  /^Only players may/i,
  /^Unable to /i,
  /^A player is required/i,
  /^This (command|position)/i,
  /^Position is not loaded/i,
  /^Could not spread/i,
];

/** Erkennt typische Fehlermeldungen. RCON selbst meldet keinen Erfolg/Fehlschlag. */
export function looksLikeError(body: string): boolean {
  const text = stripLegacy(body).trim();
  return ERROR_PATTERNS.some((re) => re.test(text));
}

/** "Gamerule keepInventory is currently set to: false" → false; Zahl → number; sonst null */
export function parseGamerule(body: string): boolean | number | null {
  if (looksLikeError(body)) return null;
  const text = stripLegacy(body).trim();
  // bekanntes Format, sonst das letzte Wort (falls sich der Satz in neuen Versionen ändert)
  const m = /(?:is currently set to|is now set to):\s*(\S+)/i.exec(text) ?? /(\S+)$/.exec(text);
  if (!m) return null;
  const v = m[1]!.toLowerCase().replace(/[.,;]$/, "");
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "The time is 1234" → 1234 (bis 1.21) */
export function parseTimeQuery(body: string): number | null {
  if (looksLikeError(body)) return null;
  const m = /time is\s*(-?\d+)/i.exec(stripLegacy(body));
  return m ? Number(m[1]) : null;
}

/** "Timeline minecraft:day is at 4839 tick(s)" → 4839 (ab 26.x) */
export function parseTimeline(body: string): number | null {
  if (looksLikeError(body)) return null;
  const m = /Timeline \S+ is at (-?\d+)/i.exec(stripLegacy(body));
  return m ? Number(m[1]) : null;
}

/** letzte ganze Zahl der Antwort (z. B. "time query day repetition"), bei Fehler null */
export function parseLastNumber(body: string): number | null {
  if (looksLikeError(body)) return null;
  const all = [...stripLegacy(body).matchAll(/-?\d+/g)];
  return all.length ? Number(all[all.length - 1]![0]) : null;
}

const DIFFICULTIES: Difficulty[] = ["peaceful", "easy", "normal", "hard"];

/** "The difficulty is Normal" → "normal" */
export function parseDifficulty(body: string): Difficulty | null {
  if (looksLikeError(body)) return null;
  const m = /difficulty is\s*(\w+)/i.exec(stripLegacy(body));
  const d = m?.[1]?.toLowerCase();
  return d && (DIFFICULTIES as string[]).includes(d) ? (d as Difficulty) : null;
}

/** Antwort auf "execute if predicate …": "Test passed" / "Test failed" */
export function parseTest(body: string): boolean | null {
  const text = stripLegacy(body);
  if (/test passed/i.test(text)) return true;
  if (/test failed/i.test(text)) return false;
  return null;
}

/**
 * Antwort auf "banlist players" bzw. "banlist ips":
 *   There are 2 ban(s):
 *   Steve was banned by Rcon: Griefing
 * Jeder Eintrag ist eine eigene Meldung. Ob dazwischen ein Zeilenumbruch steht,
 * hängt vom Server ab – ohne Umbruch werden die Einträge am Muster getrennt.
 */
export function parseBanlist(body: string): BanEntry[] {
  const text = stripLegacy(body).replace(/\r/g, "");
  if (/There are no bans/i.test(text) || looksLikeError(text)) return [];
  const rest = text.replace(/^.*?There (?:are|is) \d+ bans?(?:\(s\))?:\s*/is, "");
  const lines = rest.includes("\n") ? rest.split("\n") : splitWithoutNewlines(rest);
  const out: BanEntry[] = [];
  for (const line of lines) {
    const m = /^\s*(\S+) was banned by (.+?): ?(.*)$/s.exec(line);
    if (m) out.push({ target: m[1]!, source: m[2]!, reason: m[3]!.trim() });
  }
  return out;
}

function splitWithoutNewlines(rest: string): string[] {
  // Ein neuer Eintrag beginnt bei "<Name> was banned by". Ohne Trenner klebt der Name am
  // Grund davor ("…angezündet.Steve"). Name = längstes passendes Ende des Wortes; ein Punkt
  // gehört eher zum Grund (Standardgrund endet mit "."), außer bei ".." (Floodgate-Präfix).
  const starts: number[] = [];
  for (const m of rest.matchAll(/(\S+) was banned by /g)) {
    const word = m[1]!;
    const base = m.index ?? 0;
    if (base === 0) {
      starts.push(0);
      continue;
    }
    const n = /(\.?)([A-Za-z0-9_]{1,16})$/.exec(word);
    if (!n) continue;
    let nameStart = word.length - n[2]!.length;
    if (n[1] && (word[nameStart - 2] === "." || nameStart - 1 === 0)) nameStart -= 1;
    starts.push(base + nameStart);
  }
  return starts.map((s, i) => rest.slice(s, starts[i + 1] ?? rest.length));
}
