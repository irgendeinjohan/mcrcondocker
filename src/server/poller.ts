// Regelmäßige RCON-Abfragen: Online-Liste, Spielerdaten, TPS/MSPT.
import { EventEmitter } from "node:events";
import type {
  ConnectionState, LiveEvent, PlayerData, PlayerDetail, PlayerSummary, ServerStatus, TpsInfo,
} from "../shared/types.js";
import type { Repo } from "./db/repo.js";
import type { Diagnostics } from "./parse/diagnostics.js";
import type { Translate } from "./parse/items.js";
import { parsePlayer } from "./parse/player.js";
import { parseEntityDump, parseList, parseMspt, parsePathValue, parseTps, parseUuidQuery } from "./parse/responses.js";
import { RconError, type RconClient, type RconResponse } from "./rcon/client.js";
import type { SessionTracker } from "./sessions.js";

/** Bei Änderungen am Parser erhöhen → gespeicherte Rohdaten werden neu eingelesen */
export const PARSER_VERSION = 1;

export const STORAGE_TARGET = "mcdash:tmp";

/** Befehl, der das vollständige SNBT einer Entity liefert (siehe docs/datenformat.md) */
export function dumpCommand(uuid: string): string {
  return `data modify storage ${STORAGE_TARGET} s set string entity ${uuid}`;
}

/** Ersatz für eine gekürzte /list-Antwort: eine Meldung pro Spieler (siehe parseUuidQuery) */
export const UUID_QUERY_COMMAND = "execute as @a run data get entity @s UUID";

const UNKNOWN_COMMAND = /^Unknown or incomplete command/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Snapshot spätestens nach dieser Zeit speichern, auch ohne Änderung */
const SNAPSHOT_SAVE_INTERVAL_MS = 60_000;

export interface PollerOptions {
  pollIntervalMs: number;
  perfIntervalMs: number;
  floodgatePrefix: string;
  mock: boolean;
  version: string;
}

interface CachedSnapshot {
  takenAt: number;
  data: PlayerData;
  json: string;
  savedAt: number;
}

export class Poller extends EventEmitter {
  private paused: boolean;
  private pausedSince: number | null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inCycle = false;
  private stopped = false;
  private online = new Set<string>();
  private snapshots = new Map<string, CachedSnapshot>();
  private lastUpdate: number | null = null;
  private lastError: string | null = null;
  private onlineCount: number | null = null;
  private maxPlayers: number | null = null;
  private perf: TpsInfo | null = null;
  private lastPerfAt = 0;
  /** Server kennt /tps bzw. /mspt nicht (kein Paper) → nicht mehr abfragen */
  private noTps = false;
  private noMspt = false;
  private degraded = false;
  private lastSummariesJson = "";
  private lastStatusJson = "";

  constructor(
    private readonly rcon: RconClient,
    private readonly repo: Repo,
    private readonly tracker: SessionTracker,
    private readonly diag: Diagnostics,
    private readonly opts: PollerOptions,
    private readonly translate?: Translate,
  ) {
    super();
    this.paused = repo.getSetting("paused") === "1";
    const ps = repo.getSetting("paused_since");
    this.pausedSince = this.paused && ps ? Number(ps) : null;
    this.loadSnapshots();
    rcon.on("state", () => {
      this.emitStatus();
      // nach (Wieder-)Verbindung sofort abfragen
      if (rcon.state === "connected" && !this.paused) this.schedule(0);
    });
  }

  private loadSnapshots(): void {
    for (const row of this.repo.outdatedSnapshots(PARSER_VERSION)) {
      // ältere Parser-Version: aus Rohdaten neu einlesen
      const dump = parseEntityDump(row.raw!, this.diag.warn);
      if (dump.kind === "ok") {
        const data = parsePlayer(dump.nbt, { warn: this.diag.warn, translate: this.translate });
        this.repo.saveSnapshot(row.uuid, row.taken_at, data, row.raw, PARSER_VERSION);
      }
    }
    for (const row of this.repo.listSnapshots()) {
      try {
        const data = JSON.parse(row.parsed_json) as PlayerData;
        this.snapshots.set(row.uuid, { takenAt: row.taken_at, data, json: row.parsed_json, savedAt: row.taken_at });
      } catch {
        this.diag.warn("warn", `snapshot-corrupt:${row.uuid}`, "Gespeicherter Datenstand ist beschädigt");
      }
    }
  }

  start(): void {
    this.running = true;
    this.tracker.recoverOnStartup(Date.now());
    if (!this.paused) this.schedule(0);
    this.emitStatus();
  }

  stop(): void {
    this.stopped = true;
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    // Ausfallzeit des Dashboards ab jetzt als Lücke
    if (!this.paused) this.tracker.interrupt("dashboard_offline", Date.now());
  }

  isPaused(): boolean {
    return this.paused;
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    const now = Date.now();
    this.paused = paused;
    this.repo.setSetting("paused", paused ? "1" : "0");
    if (paused) {
      this.pausedSince = now;
      this.repo.setSetting("paused_since", String(now));
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.tracker.interrupt("paused", now);
      this.online.clear();
    } else {
      this.pausedSince = null;
      this.repo.setSetting("paused_since", null);
      this.schedule(0);
    }
    this.emitStatus();
    this.emitPlayers(true);
  }

  private schedule(delay: number): void {
    if (!this.running || this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.loop(), delay);
  }

  private async loop(): Promise<void> {
    this.timer = null;
    if (this.paused || this.inCycle || this.stopped) return;
    const started = Date.now();
    this.inCycle = true;
    try {
      await this.cycle();
    } catch (e) {
      this.diag.warn("error", "poll-crash", `Fehler im Abfragezyklus: ${(e as Error).message}`, (e as Error).stack);
    } finally {
      this.inCycle = false;
    }
    if (!this.paused) this.schedule(Math.max(250, this.opts.pollIntervalMs - (Date.now() - started)));
  }

  private async send(kind: string, command: string): Promise<RconResponse> {
    try {
      const r = await this.rcon.send(command, "normal");
      this.diag.recordRaw({ at: r.receivedAt, kind, command, body: r.body, fragments: r.fragments, bytes: r.bytes, durationMs: r.durationMs });
      return r;
    } catch (e) {
      this.diag.recordRaw({ at: Date.now(), kind, command, body: "", fragments: 0, bytes: 0, durationMs: 0, error: (e as Error).message });
      throw e;
    }
  }

  private handleRconError(e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    this.lastError = msg;
    if (!this.paused) this.tracker.interrupt("rcon_error", Date.now());
    if (this.online.size) {
      this.online.clear();
      this.emitPlayers(true);
    }
    this.emitStatus();
  }

  /** Ein Abfragezyklus. */
  async cycle(): Promise<void> {
    if (this.rcon.state !== "connected") {
      // Erster Verbindungsaufbau: abwarten (nach "connected" wird sofort abgefragt)
      if (this.rcon.state === "connecting" && !this.rcon.lastError) return;
      this.handleRconError(new RconError(this.rcon.lastError ?? "Keine RCON-Verbindung", "not_connected"));
      return;
    }
    const at = Date.now();
    let listResp: RconResponse;
    try {
      listResp = await this.send("list", "list uuids");
    } catch (e) {
      this.handleRconError(e);
      return;
    }
    if (this.paused) return;
    const list = parseList(listResp.body, this.diag.warn);
    if (!list) {
      // Ohne lesbare Liste keine Online-Zeiten → als Lücke behandeln
      this.lastError = "Antwort auf /list nicht lesbar (siehe Debug-Seite)";
      this.tracker.interrupt("rcon_error", at);
      this.emitStatus();
      return;
    }
    this.lastError = null;
    this.onlineCount = list.online;
    this.maxPlayers = list.max;
    let listed = list.players;
    if (list.truncated) {
      try {
        listed = await this.completeList(listed);
      } catch (e) {
        this.handleRconError(e);
        return;
      }
      if (this.paused) return;
    }
    const players = listed
      .filter((p) => {
        if (p.uuid && UUID_RE.test(p.uuid)) return true;
        this.diag.warn("warn", `list-no-uuid:${p.name}`, `Spieler "${p.name}" ohne UUID in /list – wird übersprungen`);
        return false;
      })
      .map((p) => ({ uuid: p.uuid!, name: p.name, isBedrock: this.isBedrock(p.name, p.uuid!) }));
    this.tracker.observe(players, at);
    this.online = new Set(players.map((p) => p.uuid));
    this.emitPlayers();

    let degraded = false;
    for (const p of players) {
      if (this.paused || this.rcon.state !== "connected") break;
      try {
        const ok = await this.pollPlayer(p.uuid);
        if (!ok) degraded = true;
      } catch (e) {
        if (e instanceof RconError && e.code !== "too_long") {
          this.handleRconError(e);
          return;
        }
        throw e;
      }
    }
    this.degraded = degraded;

    if (!this.paused && Date.now() - this.lastPerfAt >= this.opts.perfIntervalMs) {
      this.lastPerfAt = Date.now();
      try {
        let tps: number[] | null = null;
        let mspt: { avg: number; min: number; max: number }[] | null = null;
        if (!this.noTps) {
          const body = (await this.send("tps", "tps")).body;
          if (UNKNOWN_COMMAND.test(body)) {
            this.noTps = true;
            this.diag.warn("info", "no-tps", "Der Server kennt /tps nicht (kein Paper?) – TPS wird nicht angezeigt");
          } else tps = parseTps(body, this.diag.warn);
        }
        if (!this.noMspt) {
          const body = (await this.send("mspt", "mspt")).body;
          if (UNKNOWN_COMMAND.test(body)) {
            this.noMspt = true;
            this.diag.warn("info", "no-mspt", "Der Server kennt /mspt nicht (kein Paper?) – MSPT wird nicht angezeigt");
          } else mspt = parseMspt(body, this.diag.warn);
        }
        this.perf = tps || mspt ? { tps, mspt, at: Date.now() } : null;
      } catch (e) {
        if (e instanceof RconError) {
          this.handleRconError(e);
          return;
        }
        throw e;
      }
    }
    this.lastUpdate = Date.now();
    this.emitStatus();
    this.emitPlayers();
  }

  /**
   * Der Server kürzt "list uuids" ab etwa 6 Spielern. Die fehlenden Spieler kommen
   * über einen zweiten Befehl, der pro Spieler eine eigene (kurze) Meldung liefert.
   * Namen aus /list haben Vorrang, danach der gespeicherte Name, zuletzt der Anzeigename.
   */
  private async completeList(listed: { name: string; uuid: string | null }[]): Promise<{ name: string; uuid: string | null }[]> {
    const r = await this.send("list", UUID_QUERY_COMMAND);
    const all = parseUuidQuery(r.body);
    if (!all.length) {
      this.diag.warn("warn", "list-truncated", "/list ist gekürzt und die vollständige Spielerliste konnte nicht gelesen werden", r.body.slice(0, 200));
      return listed;
    }
    const names = new Map(listed.filter((p) => p.uuid).map((p) => [p.uuid!, p.name]));
    return all.map((p) => ({ uuid: p.uuid, name: names.get(p.uuid) ?? this.repo.getPlayer(p.uuid)?.name ?? p.name }));
  }

  /** Liest einen Spieler. Gibt false zurück, wenn nur der Rückfallweg ging. */
  private async pollPlayer(uuid: string): Promise<boolean> {
    const r = await this.send("player", dumpCommand(uuid));
    const dump = parseEntityDump(r.body, this.diag.warn);
    if (dump.kind === "not_found") return true; // gerade ausgeloggt
    let data: PlayerData;
    let raw: string | null = r.body;
    let complete = true;
    if (dump.kind === "ok") {
      data = parsePlayer(dump.nbt, { warn: this.diag.warn, translate: this.translate });
      if (dump.truncated) {
        data.complete = false;
        complete = false;
      }
    } else {
      // Rückfallweg: Einzelwerte
      this.diag.warn("error", "dump-failed", "Spielerdaten konnten nicht vollständig gelesen werden – nur Basiswerte (Rückfallweg)", r.body.slice(0, 200));
      data = await this.pollPlayerBasic(uuid);
      raw = null;
      complete = false;
    }
    this.storeSnapshot(uuid, data, raw);
    return complete;
  }

  private async pollPlayerBasic(uuid: string): Promise<PlayerData> {
    const get = async (p: string) => parsePathValue((await this.send("player-fallback", `data get entity ${uuid} ${p}`)).body);
    const pos = await get("Pos");
    const dim = await get("Dimension");
    const health = await get("Health");
    const food = await get("foodLevel");
    const xp = await get("XpLevel");
    const gm = await get("playerGameType");
    const prev = this.snapshots.get(uuid)?.data;
    const posArr = Array.isArray(pos) && pos.length >= 3 ? (pos as number[]) : null;
    return {
      dimension: typeof dim === "string" ? dim : prev?.dimension ?? "unknown",
      pos: posArr ? { x: posArr[0]!, y: posArr[1]!, z: posArr[2]! } : prev?.pos ?? { x: 0, y: 0, z: 0 },
      health: typeof health === "number" ? health : 0,
      maxHealth: prev?.maxHealth ?? 20,
      food: typeof food === "number" ? food : 0,
      saturation: 0,
      xpLevel: typeof xp === "number" ? xp : 0,
      xpProgress: 0,
      gameMode: typeof gm === "number" ? (["survival", "creative", "adventure", "spectator"][gm] as PlayerData["gameMode"]) ?? "unknown" : "unknown",
      selectedSlot: 0,
      inventory: [],
      armor: { head: null, chest: null, legs: null, feet: null },
      offhand: null,
      enderChest: null,
      effects: [],
      complete: false,
    };
  }

  private storeSnapshot(uuid: string, data: PlayerData, raw: string | null): void {
    const now = Date.now();
    const json = JSON.stringify(data);
    const prev = this.snapshots.get(uuid);
    const changed = !prev || prev.json !== json;
    const due = !prev || now - prev.savedAt >= SNAPSHOT_SAVE_INTERVAL_MS;
    const entry: CachedSnapshot = { takenAt: now, data, json, savedAt: prev?.savedAt ?? 0 };
    if (changed || due) {
      this.repo.saveSnapshot(uuid, now, data, raw, PARSER_VERSION);
      entry.savedAt = now;
    }
    this.snapshots.set(uuid, entry);
  }

  isBedrock(name: string, uuid: string): boolean {
    // Floodgate-UUIDs: 00000000-0000-0000-0009-xxxxxxxxxxxx
    return (this.opts.floodgatePrefix !== "" && name.startsWith(this.opts.floodgatePrefix)) || uuid.startsWith("00000000-0000-0000-0009-");
  }

  // --- Ausgabe -------------------------------------------------------------

  connectionState(): ConnectionState {
    if (this.paused) return "paused";
    switch (this.rcon.state) {
      case "connected":
        return this.lastError ? "error" : "connected";
      case "connecting":
        return this.lastUpdate === null && !this.rcon.lastError ? "connecting" : "error";
      case "auth_failed":
        return "auth_failed";
      default:
        return "error";
    }
  }

  status(): ServerStatus {
    const conn = this.connectionState();
    return {
      connection: conn,
      message: conn === "error" || conn === "auth_failed" ? (this.lastError ?? this.rcon.lastError ?? "Keine Verbindung") : null,
      paused: this.paused,
      pausedSince: this.pausedSince,
      lastUpdate: this.lastUpdate,
      online: this.paused ? null : this.onlineCount,
      maxPlayers: this.maxPlayers,
      perf: this.perf,
      pollIntervalMs: this.opts.pollIntervalMs,
      mock: this.opts.mock,
      degraded: this.degraded,
      version: this.opts.version,
    };
  }

  summaries(): PlayerSummary[] {
    const out: PlayerSummary[] = [];
    for (const p of this.repo.listPlayers()) {
      const snap = this.snapshots.get(p.uuid);
      const d = snap?.data;
      out.push({
        uuid: p.uuid,
        name: p.name,
        isBedrock: p.is_bedrock === 1,
        online: this.online.has(p.uuid),
        lastSeen: p.last_seen,
        firstSeen: p.first_seen,
        snapshotAt: snap?.takenAt ?? null,
        dimension: d?.dimension ?? null,
        pos: d?.pos ?? null,
        health: d?.health ?? null,
        maxHealth: d?.maxHealth ?? null,
        food: d?.food ?? null,
        xpLevel: d?.xpLevel ?? null,
        gameMode: d?.gameMode ?? null,
      });
    }
    out.sort((a, b) => Number(b.online) - Number(a.online) || (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
    return out;
  }

  detail(uuid: string): PlayerDetail | null {
    const s = this.summaries().find((p) => p.uuid === uuid);
    if (!s) return null;
    return { ...s, data: this.snapshots.get(uuid)?.data ?? null };
  }

  private emitStatus(): void {
    const status = this.status();
    const json = JSON.stringify(status);
    if (json === this.lastStatusJson) return;
    this.lastStatusJson = json;
    this.emit("event", { type: "status", status } satisfies LiveEvent);
  }

  private emitPlayers(force = false): void {
    const players = this.summaries();
    const json = JSON.stringify(players);
    if (!force && json === this.lastSummariesJson) return;
    this.lastSummariesJson = json;
    this.emit("event", { type: "players", players } satisfies LiveEvent);
  }
}

