// Parser für die Textantworten der RCON-Befehle.
import { stripLegacy } from "../../shared/mctext.js";
import type { Warn } from "./diagnostics.js";
import { isCompound, parseSnbt, type SnbtCompound, type SnbtValue } from "./snbt.js";

export interface ListResult {
  online: number;
  max: number;
  players: { name: string; uuid: string | null }[];
  /** Antwort endet mit "..." – der Server hat die Liste gekürzt (siehe docs/datenformat.md) */
  truncated: boolean;
}

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/**
 * "There are 3 of a max of 20 players online: A (uuid), .B C (uuid)"
 * Namen werden anhand des UUID-Musters getrennt – so funktionieren auch Namen
 * mit Leerzeichen, Punkten oder Kommas.
 */
export function parseList(body: string, warn: Warn): ListResult | null {
  const text = stripLegacy(body).replace(/\r/g, "");
  const m = /There are (\d+) (?:of a max of|out of maximum) (\d+) players online:?(.*)$/s.exec(text);
  if (!m) {
    warn("error", "list-unreadable", "Antwort auf /list konnte nicht gelesen werden", body.slice(0, 200));
    return null;
  }
  const online = Number(m[1]);
  const max = Number(m[2]);
  const rest = m[3]!.trim();
  const players: ListResult["players"] = [];
  // Über RCON bricht der Text nach 32 Textstücken mit "..." ab. Bei "list uuids"
  // kostet jeder Spieler 5 Stücke → ab dem 6. Spieler fehlt der Rest.
  const truncated = rest.endsWith("...");
  if (rest) {
    const re = new RegExp(`\\s*(.+?) \\((${UUID})\\)\\s*(?:,|$)`, "gs");
    let consumed = 0;
    for (const pm of rest.matchAll(re)) {
      players.push({ name: pm[1]!.trim(), uuid: pm[2]!.toLowerCase() });
      consumed = (pm.index ?? 0) + pm[0].length;
    }
    if (players.length === 0) {
      // ohne UUIDs (/list): Namen durch ", " getrennt
      for (const n of rest.split(", ")) if (n.trim()) players.push({ name: n.trim(), uuid: null });
    } else if (consumed < rest.length && !truncated) {
      warn("warn", "list-leftover", "Teil der /list-Antwort nicht zuordenbar", rest.slice(consumed, consumed + 100));
    }
  }
  if (players.length !== online && !truncated) {
    // Paper kann Spieler ausblenden (vanish); nur Hinweis
    warn("info", "list-count-mismatch", `/list meldet ${online} Spieler, gelesen wurden ${players.length}`);
  }
  return { online, max, players, truncated };
}

/** [I; a, b, c, d] → "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" */
export function uuidFromInts(ints: number[]): string {
  const hex = ints.map((n) => (n >>> 0).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Antwort auf "execute as @a run data get entity @s UUID": eine Meldung pro Spieler,
 * "Name has the following entity data: [I; a, b, c, d]". Jede Meldung wird einzeln
 * gekürzt, deshalb kommt sie auch bei vielen Spielern vollständig an.
 * Der Name ist der Anzeigename (ggf. mit Team-Präfix) – nur als Notlösung gedacht.
 */
export function parseUuidQuery(body: string): { name: string; uuid: string }[] {
  const text = stripLegacy(body).replace(/\r/g, "");
  const re = /\s*(.+?) has the following entity data: \[I;\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\]/gs;
  const out: { name: string; uuid: string }[] = [];
  for (const m of text.matchAll(re)) {
    out.push({ name: m[1]!.trim(), uuid: uuidFromInts([m[2], m[3], m[4], m[5]].map(Number)) });
  }
  return out;
}

/** "§6TPS from last 1m, 5m, 15m: §a20.0§r, §a20.0§r, §a*20.0" → [20, 20, 20] */
export function parseTps(body: string, warn: Warn): number[] | null {
  const text = stripLegacy(body);
  const idx = text.lastIndexOf(":");
  if (!/TPS/i.test(text) || idx < 0) {
    warn("warn", "tps-unreadable", "Antwort auf /tps konnte nicht gelesen werden", body.slice(0, 200));
    return null;
  }
  const nums = [...text.slice(idx + 1).matchAll(/\*?(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (nums.length < 1) {
    warn("warn", "tps-unreadable", "Antwort auf /tps enthielt keine Zahlen", body.slice(0, 200));
    return null;
  }
  return nums.slice(0, 3);
}

/** zweite Zeile: "◴ 0.4/0.1/3.9, 0.9/0.1/42.8, 0.9/0.0/50.3" */
export function parseMspt(body: string, warn: Warn): { avg: number; min: number; max: number }[] | null {
  const text = stripLegacy(body);
  const triples = [...text.matchAll(/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/g)].map((m) => ({
    avg: Number(m[1]),
    min: Number(m[2]),
    max: Number(m[3]),
  }));
  if (!triples.length) {
    warn("warn", "mspt-unreadable", "Antwort auf /mspt konnte nicht gelesen werden", body.slice(0, 200));
    return null;
  }
  return triples.slice(0, 3);
}

export type EntityDump =
  | { kind: "ok"; nbt: SnbtCompound; truncated: boolean }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

const NOT_FOUND = /^(No entity was found|No player was found|That player does not exist)/i;

/**
 * Liest die Antwort auf `data modify storage … set string entity <uuid>`
 * ("Expected a value: got {…}") oder – tolerant – eine `data get entity`-Antwort.
 */
export function parseEntityDump(body: string, warn: Warn): EntityDump {
  const text = body.trim();
  if (NOT_FOUND.test(text)) return { kind: "not_found" };
  let start = -1;
  const got = /Expected a value: got /.exec(text);
  if (got) start = got.index + got[0].length;
  else {
    const has = /has the following entity data: /.exec(text);
    if (has) start = has.index + has[0].length;
  }
  if (start < 0) {
    // unbekanntes Format: erstes "{" versuchen
    start = text.indexOf("{");
    if (start < 0) {
      warn("error", "entity-unreadable", "Spielerdaten-Antwort konnte nicht gelesen werden", text.slice(0, 300));
      return { kind: "error", message: text.slice(0, 300) };
    }
    warn("warn", "entity-unknown-prefix", "Spielerdaten-Antwort hat ein unbekanntes Format, versuche trotzdem zu lesen", text.slice(0, 120));
  }
  const r = parseSnbt(text, start);
  if (!isCompound(r.value)) {
    warn("error", "entity-not-compound", "Spielerdaten sind kein Compound", text.slice(start, start + 200));
    return { kind: "error", message: "Spielerdaten nicht lesbar" };
  }
  if (r.truncated) {
    warn("warn", "entity-truncated", "Spielerdaten waren abgeschnitten – es wird nur ein Teil angezeigt", r.error?.message);
  } else if (r.error) {
    warn("warn", "entity-parse-error", `SNBT-Fehler an Position ${r.error.pos}: ${r.error.message}`, text.slice(Math.max(0, r.error.pos - 60), r.error.pos + 60));
  } else if (r.end < text.length && text.slice(r.end).trim()) {
    warn("info", "entity-trailing", "Nach den Spielerdaten folgte weiterer Text", text.slice(r.end, r.end + 100));
  }
  return { kind: "ok", nbt: r.value, truncated: r.truncated || !!r.error };
}

/** Wert aus `data get entity <uuid> <pfad>` ("X has the following entity data: 20.0f") */
export function parsePathValue(body: string): SnbtValue | undefined {
  const m = /has the following entity data: /.exec(body);
  if (!m) return undefined;
  const r = parseSnbt(body, m.index + m[0].length);
  return r.error ? undefined : r.value;
}
