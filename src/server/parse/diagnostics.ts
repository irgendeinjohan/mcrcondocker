import type { DiagnosticWarning, RawResponse, WarningLevel } from "../../shared/types.js";

export type Warn = (level: WarningLevel, key: string, message: string, context?: string) => void;

/** Ringpuffer-Größe pro Befehlsart (Aktionen/Welt: mehr, damit Fehler im Export landen) */
const RAW_PER_KIND = 5;
const RAW_PER_KIND_LARGE: Record<string, number> = { action: 40, world: 40, console: 20 };
/** Sehr große Antworten nur gekürzt aufbewahren */
const RAW_MAX_CHARS = 256 * 1024;
const MAX_WARNINGS = 500;

/**
 * Sammelt Parser-Warnungen (dedupliziert nach Schlüssel, mit Zähler) und die
 * letzten Rohantworten pro Befehlsart für die Debug-Seite.
 */
export class Diagnostics {
  private warnings = new Map<string, DiagnosticWarning>();
  private raw = new Map<string, RawResponse[]>();
  readonly startedAt = Date.now();

  warn: Warn = (level, key, message, context) => {
    const now = Date.now();
    const existing = this.warnings.get(key);
    if (existing) {
      existing.count++;
      existing.lastAt = now;
      existing.message = message;
      if (context !== undefined) existing.context = context;
      return;
    }
    if (this.warnings.size >= MAX_WARNINGS) {
      // ältesten Eintrag verwerfen
      const oldest = [...this.warnings.values()].sort((a, b) => a.lastAt - b.lastAt)[0];
      if (oldest) this.warnings.delete(oldest.key);
    }
    this.warnings.set(key, { key, level, message, context, count: 1, firstAt: now, lastAt: now });
  };

  recordRaw(entry: RawResponse): void {
    const list = this.raw.get(entry.kind) ?? [];
    const e = { ...entry };
    if (e.body.length > RAW_MAX_CHARS) {
      e.body = e.body.slice(0, RAW_MAX_CHARS);
      e.truncatedForDisplay = true;
    }
    list.unshift(e);
    const max = RAW_PER_KIND_LARGE[entry.kind] ?? RAW_PER_KIND;
    if (list.length > max) list.length = max;
    this.raw.set(entry.kind, list);
  }

  getWarnings(): DiagnosticWarning[] {
    const order: Record<WarningLevel, number> = { error: 0, warn: 1, info: 2 };
    return [...this.warnings.values()].sort((a, b) => order[a.level] - order[b.level] || b.lastAt - a.lastAt);
  }

  getRaw(): Record<string, RawResponse[]> {
    return Object.fromEntries(this.raw);
  }

  clearWarnings(): void {
    this.warnings.clear();
  }
}

/** Sammelt Warnungen nur lokal (z. B. für Tests). */
export function collectingWarn(): { warn: Warn; list: { level: WarningLevel; key: string; message: string }[] } {
  const list: { level: WarningLevel; key: string; message: string }[] = [];
  return { list, warn: (level, key, message) => void list.push({ level, key, message }) };
}
