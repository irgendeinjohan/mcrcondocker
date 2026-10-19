// Aktionen aus dem Dashboard (Spielmodus, Teleport, Items, Welt, Nachrichten …).
// Jede Aktion wird hier geprüft und in feste RCON-Befehle übersetzt – das Frontend
// schickt nie eigene Befehlstexte. Alles landet im Aktionsprotokoll.
import { EventEmitter } from "node:events";
import { GAMERULES } from "../shared/gamerules.js";
import type {
  ActionRequest, ActionResult, AuditEntry, BanLists, Difficulty, GameruleState, LiveEvent, TimePreset, Vec3, WeatherKind, WorldState,
} from "../shared/types.js";
import type { Repo } from "./db/repo.js";
import type { Diagnostics } from "./parse/diagnostics.js";
import { looksLikeError, parseBanlist, parseDifficulty, parseGamerule, parseTest, parseTimeQuery } from "./parse/world.js";
import type { RconClient } from "./rcon/client.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Spielernamen inkl. Floodgate-Präfix; keine Leerzeichen, Anführungszeichen oder Steuerzeichen */
const NAME_RE = /^[^\s"'\\§\u0000-\u001f]{1,40}$/;
const IP_RE = /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]{2,39}$/;
const ITEM_RE = /^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/;
const DIM_RE = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const MAX_TEXT = 256;
const MAX_COORD = 30_000_000;

export const GAME_MODE_LABELS: Record<string, string> = { survival: "Überleben", creative: "Kreativ", adventure: "Abenteuer", spectator: "Zuschauer" };
const TIME_PRESETS: Record<TimePreset, { ticks: number; label: string }> = {
  morning: { ticks: 0, label: "Morgen" },
  noon: { ticks: 6000, label: "Mittag" },
  evening: { ticks: 12000, label: "Abend" },
  night: { ticks: 13000, label: "Nacht" },
  midnight: { ticks: 18000, label: "Mitternacht" },
};
const WEATHER_LABELS: Record<WeatherKind, string> = { clear: "Klar", rain: "Regen", thunder: "Gewitter" };
const DIFFICULTY_LABELS: Record<Difficulty, string> = { peaceful: "Friedlich", easy: "Leicht", normal: "Normal", hard: "Schwer" };

export class ActionError extends Error {}

interface BuiltAction {
  label: string;
  commands: string[];
  /** Grund für eine Sicherheitsabfrage, sonst null */
  confirm: string | null;
}

export interface ActionContext {
  /** Name zu einer UUID (aus Datenbank/Online-Liste) */
  nameOf(uuid: string): string | null;
}

export type ActionOutcome =
  | { kind: "done"; result: ActionResult }
  | { kind: "needs_confirmation"; reason: string; label: string };

function uuidOf(v: unknown, field = "uuid"): string {
  if (typeof v !== "string" || !UUID_RE.test(v.toLowerCase())) throw new ActionError(`${field}: ungültige UUID`);
  return v.toLowerCase();
}

function coordOf(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > MAX_COORD) throw new ActionError(`${field}: ungültige Koordinate`);
  return Math.round(v * 100) / 100;
}

function dimOf(v: unknown): string {
  if (typeof v !== "string" || !DIM_RE.test(v)) throw new ActionError("Ungültige Dimension");
  return v;
}

/** einzeiliger Freitext (Grund, Nachricht) */
function textOf(v: unknown, field: string, required: boolean): string {
  if (v === undefined || v === null || v === "") {
    if (required) throw new ActionError(`${field} fehlt`);
    return "";
  }
  if (typeof v !== "string") throw new ActionError(`${field}: Text erwartet`);
  const t = v.replace(/[\r\n\t]+/g, " ").trim();
  if (required && !t) throw new ActionError(`${field} fehlt`);
  if (t.length > MAX_TEXT) throw new ActionError(`${field}: höchstens ${MAX_TEXT} Zeichen`);
  return t;
}

/** Text als SNBT-/JSON-String (beide Formate verstehen "…" mit \" und \\) */
function quoted(text: string): string {
  return JSON.stringify(text);
}

/** Übersetzt eine Aktion in Befehle. Wirft ActionError bei ungültigen Eingaben. */
export function buildAction(raw: unknown, ctx: ActionContext): BuiltAction {
  if (!raw || typeof raw !== "object") throw new ActionError("Aktion erwartet");
  const a = raw as ActionRequest & Record<string, unknown>;
  const who = (uuid: string) => ctx.nameOf(uuid) ?? uuid;
  const nameFor = (uuid: string) => {
    const n = ctx.nameOf(uuid);
    if (!n || !NAME_RE.test(n)) throw new ActionError("Name des Spielers unbekannt");
    return n;
  };

  switch (a.type) {
    case "gamemode": {
      const uuid = uuidOf(a.uuid);
      if (!(a.mode in GAME_MODE_LABELS)) throw new ActionError("Ungültiger Spielmodus");
      return { label: `Spielmodus von ${who(uuid)} → ${GAME_MODE_LABELS[a.mode]}`, commands: [`gamemode ${a.mode} ${uuid}`], confirm: null };
    }
    case "heal": {
      const uuid = uuidOf(a.uuid);
      // Sofortheilung Stufe 11 heilt weit mehr als jedes Maximum
      return { label: `${who(uuid)} geheilt`, commands: [`effect give ${uuid} minecraft:instant_health 1 10 true`], confirm: null };
    }
    case "feed": {
      const uuid = uuidOf(a.uuid);
      return { label: `${who(uuid)} gesättigt`, commands: [`effect give ${uuid} minecraft:saturation 1 20 true`], confirm: null };
    }
    case "tp_player": {
      const uuid = uuidOf(a.uuid);
      const target = uuidOf(a.target, "target");
      if (uuid === target) throw new ActionError("Spieler und Ziel sind gleich");
      return { label: `${who(uuid)} → ${who(target)} teleportiert`, commands: [`tp ${uuid} ${target}`], confirm: null };
    }
    case "tp_coords": {
      const uuid = uuidOf(a.uuid);
      const dim = dimOf(a.dimension);
      const [x, y, z] = [coordOf(a.x, "x"), coordOf(a.y, "y"), coordOf(a.z, "z")];
      return { label: `${who(uuid)} → ${x} / ${y} / ${z} (${dim.replace("minecraft:", "")}) teleportiert`, commands: [`execute in ${dim} run tp ${uuid} ${x} ${y} ${z}`], confirm: null };
    }
    case "tp_surface": {
      const uuid = uuidOf(a.uuid);
      const dim = dimOf(a.dimension);
      const [x, z] = [Math.floor(coordOf(a.x, "x")) + 0.5, Math.floor(coordOf(a.z, "z")) + 0.5];
      let under = "";
      if (a.maxY !== undefined && a.maxY !== null) {
        const y = coordOf(a.maxY, "maxY");
        under = ` under ${Math.floor(y)}`;
      }
      // spreadplayers sucht den höchsten sicheren Block (mit "under" unterhalb einer Höhe, z. B. im Nether)
      return {
        label: `${who(uuid)} → ${Math.floor(x)} / ${Math.floor(z)} (${dim.replace("minecraft:", "")}) teleportiert`,
        commands: [`execute in ${dim} run spreadplayers ${x} ${z} 0 1${under} false ${uuid}`],
        confirm: null,
      };
    }
    case "give": {
      const uuid = uuidOf(a.uuid);
      if (typeof a.item !== "string" || !ITEM_RE.test(a.item) || a.item.includes("..")) throw new ActionError("Ungültige Item-ID");
      const count = a.count;
      if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 6400) throw new ActionError("Anzahl muss zwischen 1 und 6400 liegen");
      const item = a.item.includes(":") ? a.item : `minecraft:${a.item}`;
      return { label: `${who(uuid)} erhält ${count}× ${item.replace("minecraft:", "")}`, commands: [`give ${uuid} ${item} ${count}`], confirm: null };
    }
    case "clear": {
      const uuid = uuidOf(a.uuid);
      return { label: `Inventar von ${who(uuid)} geleert`, commands: [`clear ${uuid}`], confirm: `Das komplette Inventar von ${who(uuid)} wird gelöscht.` };
    }
    case "kick": {
      const uuid = uuidOf(a.uuid);
      const reason = textOf(a.reason, "Grund", false);
      return { label: `${who(uuid)} gekickt${reason ? ` (${reason})` : ""}`, commands: [`kick ${uuid}${reason ? " " + reason : ""}`], confirm: `${who(uuid)} wird vom Server geworfen.` };
    }
    case "ban": {
      const uuid = uuidOf(a.uuid);
      const name = nameFor(uuid);
      const reason = textOf(a.reason, "Grund", false);
      return { label: `${name} gebannt${reason ? ` (${reason})` : ""}`, commands: [`ban ${name}${reason ? " " + reason : ""}`], confirm: `${name} wird gebannt und kann den Server nicht mehr betreten.` };
    }
    case "op": {
      const name = nameFor(uuidOf(a.uuid));
      return { label: `${name} ist jetzt Operator`, commands: [`op ${name}`], confirm: `${name} erhält Operator-Rechte (alle Befehle).` };
    }
    case "deop": {
      const name = nameFor(uuidOf(a.uuid));
      return { label: `${name} ist kein Operator mehr`, commands: [`deop ${name}`], confirm: `${name} verliert die Operator-Rechte.` };
    }
    case "pardon": {
      if (typeof a.name !== "string" || !NAME_RE.test(a.name)) throw new ActionError("Ungültiger Name");
      return { label: `${a.name} entbannt`, commands: [`pardon ${a.name}`], confirm: null };
    }
    case "pardon_ip": {
      if (typeof a.ip !== "string" || !IP_RE.test(a.ip)) throw new ActionError("Ungültige IP-Adresse");
      return { label: `IP ${a.ip} entbannt`, commands: [`pardon-ip ${a.ip}`], confirm: null };
    }
    case "time": {
      const p = TIME_PRESETS[a.preset as TimePreset];
      if (!p) throw new ActionError("Ungültige Uhrzeit");
      return { label: `Uhrzeit → ${p.label}`, commands: [`time set ${p.ticks}`], confirm: null };
    }
    case "weather": {
      const l = WEATHER_LABELS[a.weather as WeatherKind];
      if (!l) throw new ActionError("Ungültiges Wetter");
      return { label: `Wetter → ${l}`, commands: [`weather ${a.weather}`], confirm: null };
    }
    case "difficulty": {
      const l = DIFFICULTY_LABELS[a.difficulty as Difficulty];
      if (!l) throw new ActionError("Ungültige Schwierigkeit");
      return { label: `Schwierigkeit → ${l}`, commands: [`difficulty ${a.difficulty}`], confirm: `Die Schwierigkeit wird für alle Spieler auf „${l}“ gesetzt.` };
    }
    case "gamerule": {
      const def = GAMERULES.find((g) => g.names.includes(a.rule as string));
      if (!def) throw new ActionError("Unbekannte Gamerule");
      const v = a.value;
      if (typeof v !== "boolean" && (typeof v !== "number" || !Number.isInteger(v) || v < -1_000_000 || v > 1_000_000)) {
        throw new ActionError("Wert muss an/aus oder eine ganze Zahl sein");
      }
      const shown = typeof v === "boolean" ? (v ? "an" : "aus") : String(v);
      return { label: `Gamerule ${def.label} → ${shown}`, commands: [`gamerule ${a.rule} ${v}`], confirm: `„${def.label}“ wird für die ganze Welt auf ${shown} gesetzt.` };
    }
    case "say": {
      const text = textOf(a.text, "Nachricht", true);
      return { label: `Nachricht an alle: ${text}`, commands: [`say ${text}`], confirm: null };
    }
    case "title": {
      const text = textOf(a.text, "Titel", true);
      const sub = textOf(a.subtitle, "Untertitel", false);
      const cmds = [`title @a times 10 70 20`];
      // Untertitel muss vor dem Titel gesetzt werden, angezeigt wird erst mit "title"
      if (sub) cmds.push(`title @a subtitle ${quoted(sub)}`);
      cmds.push(`title @a title ${quoted(text)}`);
      return { label: `Titel an alle: ${text}${sub ? ` / ${sub}` : ""}`, commands: cmds, confirm: null };
    }
    case "msg": {
      const uuid = uuidOf(a.uuid);
      const text = textOf(a.text, "Nachricht", true);
      return { label: `Nachricht an ${who(uuid)}: ${text}`, commands: [`msg ${uuid} ${text}`], confirm: null };
    }
    default:
      throw new ActionError("Unbekannte Aktion");
  }
}

const SPAWN_SETTING = "world_spawn";
const OUTPUT_LIMIT = 2000;

export class ActionService extends EventEmitter {
  /** aufgelöste Gamerule-Namen pro Schlüssel (null = Server kennt keinen) */
  private ruleNames = new Map<string, string | null>();

  constructor(
    private readonly rcon: RconClient,
    private readonly repo: Repo,
    private readonly diag: Diagnostics,
    private readonly ctx: ActionContext,
  ) {
    super();
  }

  async run(raw: unknown, confirmed: boolean): Promise<ActionOutcome> {
    const built = buildAction(raw, this.ctx);
    if (built.confirm && !confirmed) return { kind: "needs_confirmation", reason: built.confirm, label: built.label };
    const outputs: string[] = [];
    let ok = true;
    for (const cmd of built.commands) {
      try {
        const body = await this.send("action", cmd);
        outputs.push(body);
        if (looksLikeError(body)) ok = false;
      } catch (e) {
        outputs.push(`Fehler: ${(e as Error).message}`);
        ok = false;
        break;
      }
      if (!ok) break;
    }
    const output = outputs.filter(Boolean).join("\n");
    this.audit("action", built.label, built.commands.join("\n"), ok, output);
    return { kind: "done", result: { ok, label: built.label, commands: built.commands, output } };
  }

  /** Eintrag ins Aktionsprotokoll (auch für Konsolenbefehle) */
  audit(source: AuditEntry["source"], label: string, command: string, ok: boolean, output: string): void {
    const entry = this.repo.addAudit({ at: Date.now(), source, label, command, ok, output: output.slice(0, OUTPUT_LIMIT) });
    this.emit("event", { type: "audit", entry } satisfies LiveEvent);
  }

  private async send(kind: string, command: string): Promise<string> {
    try {
      const r = await this.rcon.send(command, "high");
      this.diag.recordRaw({ at: r.receivedAt, kind, command, body: r.body, fragments: r.fragments, bytes: r.bytes, durationMs: r.durationMs });
      return r.body;
    } catch (e) {
      this.diag.recordRaw({ at: Date.now(), kind, command, body: "", fragments: 0, bytes: 0, durationMs: 0, error: (e as Error).message });
      throw e;
    }
  }

  worldSpawn(): Vec3 | null {
    const v = this.repo.getSetting(SPAWN_SETTING);
    if (!v) return null;
    try {
      const p = JSON.parse(v) as Vec3;
      return [p.x, p.y, p.z].every((n) => typeof n === "number") ? p : null;
    } catch {
      return null;
    }
  }

  setWorldSpawn(raw: unknown): Vec3 | null {
    if (raw === null) {
      this.repo.setSetting(SPAWN_SETTING, null);
      return null;
    }
    const p = raw as Record<string, unknown>;
    const v = { x: coordOf(p?.x, "x"), y: coordOf(p?.y, "y"), z: coordOf(p?.z, "z") };
    this.repo.setSetting(SPAWN_SETTING, JSON.stringify(v));
    return v;
  }

  /** Liest Uhrzeit, Wetter, Schwierigkeit und Gamerules (ca. 15 kurze Befehle). */
  async world(): Promise<WorldState> {
    const daytime = parseTimeQuery(await this.send("world", "time query daytime"));
    const day = parseTimeQuery(await this.send("world", "time query day"));
    let weather: WeatherKind | null = null;
    const thunder = parseTest(await this.send("world", `execute if predicate {condition:"minecraft:weather_check",thundering:true}`));
    if (thunder === true) weather = "thunder";
    else if (thunder === false) {
      const rain = parseTest(await this.send("world", `execute if predicate {condition:"minecraft:weather_check",raining:true}`));
      weather = rain === null ? null : rain ? "rain" : "clear";
    }
    const difficulty = parseDifficulty(await this.send("world", "difficulty"));
    const gamerules: GameruleState[] = [];
    for (const def of GAMERULES) {
      const known = this.ruleNames.get(def.key);
      if (known === null) continue;
      const candidates = known ? [known] : def.names;
      let found = false;
      for (const name of candidates) {
        const value = parseGamerule(await this.send("world", `gamerule ${name}`));
        if (value !== null) {
          this.ruleNames.set(def.key, name);
          gamerules.push({ key: def.key, name, value });
          found = true;
          break;
        }
      }
      // nur merken, wenn der Server wirklich keinen der Namen kennt (nicht bei Verbindungsfehlern)
      if (!found && !known) this.ruleNames.set(def.key, null);
      if (!found && known) this.ruleNames.delete(def.key);
    }
    return { daytime, day, weather, difficulty, gamerules, worldSpawn: this.worldSpawn() };
  }

  async bans(): Promise<BanLists> {
    return {
      players: parseBanlist(await this.send("world", "banlist players")),
      ips: parseBanlist(await this.send("world", "banlist ips")),
    };
  }

  auditEntries(limit: number, before?: number): AuditEntry[] {
    return this.repo.listAudit(limit, before);
  }
}
