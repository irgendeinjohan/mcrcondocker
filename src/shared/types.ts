// Gemeinsame Typen für Backend und Frontend.
import type { TextSegment } from "./mctext.js";

export type { TextSegment };

export interface Enchantment {
  id: string;
  name: string;
  level: number;
}

export interface Item {
  slot: number;
  id: string;
  count: number;
  /** Anzeigename (eigener Name, item_name, Buchtitel oder aus der ID abgeleitet) */
  name: TextSegment[];
  hasCustomName: boolean;
  enchantments: Enchantment[];
  storedEnchantments: Enchantment[];
  damage?: number;
  maxDamage?: number;
  unbreakable?: boolean;
  lore?: TextSegment[][];
  /** Inhalt von Shulkerkisten/Bündeln */
  contents?: Item[];
  /** Kapazität des Behälters (27 bei Shulkerkisten), sonst undefined */
  containerSize?: number;
  /** weitere Tooltip-Zeilen (Trank, Färbung, Rüstungsbesatz, …) */
  details: string[];
  glint?: boolean;
}

export type ArmorSlot = "head" | "chest" | "legs" | "feet";
export type GameMode = "survival" | "creative" | "adventure" | "spectator" | "unknown";

export interface Effect {
  id: string;
  name: string;
  amplifier: number;
  /** Ticks, -1 = unendlich */
  duration: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Aus dem Spieler-NBT gelesene Daten */
export interface PlayerData {
  dimension: string;
  pos: Vec3;
  health: number;
  maxHealth: number;
  food: number;
  saturation: number;
  xpLevel: number;
  xpProgress: number;
  gameMode: GameMode;
  selectedSlot: number;
  inventory: Item[];
  armor: Record<ArmorSlot, Item | null>;
  offhand: Item | null;
  enderChest: Item[] | null;
  effects: Effect[];
  /** letzter Todespunkt (LastDeathLocation) */
  lastDeath?: { dimension: string; pos: Vec3 } | null;
  /** gesetzter Spawnpunkt (Bett/Seelenanker) */
  respawn?: { dimension: string; pos: Vec3 } | null;
  /** false, wenn nur Einzelwerte gelesen werden konnten (Rückfallweg) */
  complete: boolean;
}

export interface PlayerSummary {
  uuid: string;
  name: string;
  isBedrock: boolean;
  online: boolean;
  /** letzter Zeitpunkt, an dem der Spieler online gesehen wurde (ms) */
  lastSeen: number | null;
  firstSeen: number | null;
  /** Zeitpunkt des gespeicherten Datenstands */
  snapshotAt: number | null;
  dimension: string | null;
  pos: Vec3 | null;
  health: number | null;
  maxHealth: number | null;
  food: number | null;
  xpLevel: number | null;
  gameMode: GameMode | null;
}

export interface PlayerDetail extends PlayerSummary {
  data: PlayerData | null;
}

export type ConnectionState = "connected" | "connecting" | "paused" | "error" | "auth_failed";

export interface TpsInfo {
  /** 1 min, 5 min, 15 min */
  tps: number[] | null;
  /** avg/min/max für 5 s, 10 s, 1 min */
  mspt: { avg: number; min: number; max: number }[] | null;
  at: number;
}

export interface ServerStatus {
  connection: ConnectionState;
  /** Fehlermeldung (bei error/auth_failed) */
  message: string | null;
  paused: boolean;
  pausedSince: number | null;
  lastUpdate: number | null;
  online: number | null;
  maxPlayers: number | null;
  perf: TpsInfo | null;
  pollIntervalMs: number;
  mock: boolean;
  /** Daten nur eingeschränkt lesbar (Rückfallweg aktiv) */
  degraded: boolean;
  version: string;
}

export interface SessionEntry {
  id: number;
  uuid: string;
  start: number;
  end: number | null;
  /** logout = per /list erkannt; unknown = Ende fällt in eine Lücke (Pause/Fehler/Dashboard aus) */
  endReason: "logout" | "unknown" | null;
}

export interface GapEntry {
  id: number;
  start: number;
  end: number | null;
  reason: "paused" | "rcon_error" | "dashboard_offline";
}

export interface PlayerSessionStats {
  uuid: string;
  name: string;
  isBedrock: boolean;
  online: boolean;
  totalMs: number;
  sessionCount: number;
  lastSeen: number | null;
  firstSeen: number | null;
}

export interface ConsoleEntry {
  id: number;
  at: number;
  command: string;
  output: string;
  ok: boolean;
  durationMs: number;
}

export type WarningLevel = "info" | "warn" | "error";

export interface DiagnosticWarning {
  key: string;
  level: WarningLevel;
  message: string;
  context?: string;
  count: number;
  firstAt: number;
  lastAt: number;
}

export interface RawResponse {
  at: number;
  kind: string;
  command: string;
  body: string;
  fragments: number;
  bytes: number;
  durationMs: number;
  error?: string;
  truncatedForDisplay?: boolean;
}

export interface DiagnosticsSnapshot {
  warnings: DiagnosticWarning[];
  raw: Record<string, RawResponse[]>;
  rcon: { state: string; lastError: string | null; queueLength: number; commandsSent: number };
  startedAt: number;
  version: string;
}

/** Ereignisse per Server-Sent Events */
export type LiveEvent =
  | { type: "status"; status: ServerStatus }
  | { type: "players"; players: PlayerSummary[] }
  | { type: "console"; entry: ConsoleEntry }
  | { type: "audit"; entry: AuditEntry };

// --- Aktionen (Spieler, Welt, Server) ------------------------------------

export type WeatherKind = "clear" | "rain" | "thunder";
export type Difficulty = "peaceful" | "easy" | "normal" | "hard";
export type TimePreset = "morning" | "noon" | "evening" | "night" | "midnight";

/** Vom Frontend angeforderte Aktion. Spieler werden immer per UUID angegeben. */
export type ActionRequest =
  | { type: "gamemode"; uuid: string; mode: Exclude<GameMode, "unknown"> }
  | { type: "heal"; uuid: string }
  | { type: "feed"; uuid: string }
  | { type: "tp_player"; uuid: string; target: string }
  | { type: "tp_coords"; uuid: string; dimension: string; x: number; y: number; z: number }
  /** auf den höchsten festen Block bei x/z (Karte); maxY begrenzt die Suche (Nether) */
  | { type: "tp_surface"; uuid: string; dimension: string; x: number; z: number; maxY?: number }
  | { type: "give"; uuid: string; item: string; count: number }
  | { type: "clear"; uuid: string }
  | { type: "kick"; uuid: string; reason?: string }
  | { type: "ban"; uuid: string; reason?: string }
  | { type: "op"; uuid: string }
  | { type: "deop"; uuid: string }
  | { type: "pardon"; name: string }
  | { type: "pardon_ip"; ip: string }
  | { type: "time"; preset: TimePreset }
  | { type: "weather"; weather: WeatherKind }
  | { type: "difficulty"; difficulty: Difficulty }
  | { type: "gamerule"; rule: string; value: boolean | number }
  | { type: "say"; text: string }
  | { type: "title"; text: string; subtitle?: string }
  | { type: "msg"; uuid: string; text: string };

export interface ActionResult {
  ok: boolean;
  /** Beschreibung, z. B. „Spielmodus von Alex → Kreativ“ */
  label: string;
  commands: string[];
  output: string;
}

export interface GameruleState {
  /** Schlüssel aus GAMERULES (stabil, unabhängig von der Server-Version) */
  key: string;
  /** tatsächlicher Name auf dem Server (z. B. keep_inventory oder keepInventory) */
  name: string;
  value: boolean | number;
}

export interface WorldState {
  /** Tageszeit in Ticks (0–23999) */
  daytime: number | null;
  day: number | null;
  weather: WeatherKind | null;
  difficulty: Difficulty | null;
  gamerules: GameruleState[];
  /** im Dashboard hinterlegter Weltspawn (lässt sich per RCON nicht auslesen) */
  worldSpawn: Vec3 | null;
}

export interface BanEntry {
  target: string;
  source: string;
  reason: string;
}

export interface BanLists {
  players: BanEntry[];
  ips: BanEntry[];
}

export interface AuditEntry {
  id: number;
  at: number;
  source: "action" | "console";
  label: string;
  command: string;
  ok: boolean;
  output: string;
}

export interface ItemInfo {
  id: string;
  name: string;
}
