// Erkennung gefährlicher Konsolenbefehle (brauchen eine Bestätigung).
// Wird im Frontend (Dialog) und im Backend (Durchsetzung) verwendet.

import { translate, type Locale } from "./translations.js";

export const DEFAULT_DANGEROUS = [
  "stop", "restart", "reload", "op", "deop", "ban", "ban-ip", "pardon", "pardon-ip", "kick", "kill",
  "whitelist", "clear", "save-off", "difficulty", "gamerule", "fill", "clone", "setblock", "worldborder",
  "defaultgamemode", "fillbiome", "place", "transfer", "spreadplayers", "setidletimeout",
];

/** Unterbefehle von `data`, die etwas verändern */
const DATA_WRITE = new Set(["modify", "merge", "remove"]);

/**
 * Gibt den Grund zurück, wenn der Befehl bestätigt werden muss, sonst null.
 * Berücksichtigt Namespaces (minecraft:stop, bukkit:reload) und `execute … run …`.
 */
export function dangerousReason(command: string, extra: string[] = [], depth = 0, locale: Locale = "de"): string | null {
  const list = new Set([...DEFAULT_DANGEROUS, ...extra.map((e) => e.toLowerCase())]);
  const cmd = command.trim().replace(/^\/+/, "");
  if (!cmd) return null;
  const tokens = cmd.split(/\s+/);
  const head = tokens[0]!.toLowerCase();
  const name = head.includes(":") ? head.slice(head.indexOf(":") + 1) : head;
  if (list.has(name)) return translate(locale, "„{command}“ ist als gefährlich eingestuft", { command: name });
  if (name === "data" && tokens[1] && DATA_WRITE.has(tokens[1].toLowerCase())) {
    return translate(locale, "„data {command}“ verändert Daten", { command: tokens[1].toLowerCase() });
  }
  if (name === "execute" && depth < 8) {
    // jeden "run"-Teil prüfen
    const lower = tokens.map((t) => t.toLowerCase());
    for (let i = 1; i < lower.length; i++) {
      if (lower[i] === "run") {
        const r = dangerousReason(tokens.slice(i + 1).join(" "), extra, depth + 1, locale);
        if (r) return r + translate(locale, " (in execute … run)");
      }
    }
  }
  return null;
}
