const dtf = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "medium" });
const tf = new Intl.DateTimeFormat("de-DE", { timeStyle: "medium" });
const df = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function dateTime(ms: number | null | undefined): string {
  return ms ? dtf.format(ms) : "–";
}

export function time(ms: number | null | undefined): string {
  return ms ? tf.format(ms) : "–";
}

export function shortDate(ms: number | null | undefined): string {
  return ms ? df.format(ms) : "–";
}

/** "vor 5 s", "vor 3 min", "vor 2 h", sonst Datum */
export function ago(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return "nie";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `vor ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `vor ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `vor ${d} Tag${d === 1 ? "" : "en"}`;
  return dateTime(ms);
}

export function duration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return `${Math.max(0, Math.round(ms / 1000))} s`;
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d} T ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function coord(v: number): string {
  return v.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
}

export const DIMENSIONS: Record<string, { label: string; short: string; color: string }> = {
  "minecraft:overworld": { label: "Oberwelt", short: "Oberwelt", color: "#5bbf5b" },
  "minecraft:the_nether": { label: "Nether", short: "Nether", color: "#d9534f" },
  "minecraft:the_end": { label: "Ende", short: "Ende", color: "#b48ae6" },
};

export function dimLabel(id: string | null | undefined): string {
  if (!id) return "unbekannt";
  return DIMENSIONS[id]?.label ?? id.replace(/^minecraft:/, "");
}

export function dimColor(id: string | null | undefined): string {
  return (id && DIMENSIONS[id]?.color) || "#8a8f98";
}

export const GAME_MODES: Record<string, string> = {
  survival: "Überleben",
  creative: "Kreativ",
  adventure: "Abenteuer",
  spectator: "Zuschauer",
  unknown: "?",
};

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
export function roman(n: number): string {
  return n > 0 && n < ROMAN.length ? ROMAN[n]! : String(n);
}
