import { EventEmitter } from "node:events";
import net from "node:net";
import {
  encodePacket,
  MAX_OUTGOING_BODY_BYTES,
  PacketDecoder,
  PacketType,
  type RconPacket,
} from "./protocol.js";

export type RconState = "disconnected" | "connecting" | "connected" | "auth_failed" | "stopped";

export interface RconOptions {
  host: string;
  port: number;
  password: string;
  /** Maximale Wartezeit auf eine vollständige Antwort */
  commandTimeoutMs?: number;
  connectTimeoutMs?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface RconResponse {
  command: string;
  body: string;
  /** Anzahl der RCON-Pakete, aus denen die Antwort zusammengesetzt wurde */
  fragments: number;
  bytes: number;
  durationMs: number;
  receivedAt: number;
}

export type Priority = "high" | "normal";

interface Job {
  command: string;
  timeoutMs: number;
  resolve: (r: RconResponse) => void;
  reject: (e: Error) => void;
}

interface InFlight {
  job: Job;
  commandId: number;
  markerId: number;
  markerSent: boolean;
  fragments: Buffer[];
  startedAt: number;
  timer: NodeJS.Timeout;
}

export class RconError extends Error {
  constructor(
    message: string,
    readonly code: "not_connected" | "timeout" | "connection_lost" | "too_long" | "stopped",
  ) {
    super(message);
  }
}

/**
 * Genau eine RCON-Verbindung; alle Befehle laufen nacheinander über eine
 * Warteschlange (Konsole = "high" vor Poller = "normal").
 *
 * Mehrteilige Antworten: Minecraft teilt lange Antworten in mehrere Pakete mit
 * derselben ID auf, ohne das Ende zu markieren. Daher wird nach dem ersten
 * Antwortfragment ein Marker-Paket mit unbekanntem Typ gesendet. Der Server
 * schreibt alle Fragmente, bevor er das nächste Paket liest, also kommt dessen
 * Antwort ("Unknown request 0") erst nach dem letzten Fragment.
 *
 * Wichtig: Der Server liest pro read() genau ein Paket und trennt die Verbindung,
 * wenn mehrere Pakete in einem Lesevorgang ankommen (am Testserver mit Paper 26.3
 * nachgewiesen). Deshalb ist vom Client immer höchstens ein Paket unterwegs.
 */
export class RconClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private decoder = new PacketDecoder();
  private queueHigh: Job[] = [];
  private queueNormal: Job[] = [];
  private inFlight: InFlight | null = null;
  private nextId = 1;
  private authId = 0;
  private backoffMs: number;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectTimer: NodeJS.Timeout | null = null;
  private _state: RconState = "disconnected";
  private _lastError: string | null = null;
  private readonly opts: Required<RconOptions>;

  constructor(options: RconOptions) {
    super();
    this.opts = {
      commandTimeoutMs: 10_000,
      connectTimeoutMs: 5_000,
      minBackoffMs: 1_000,
      maxBackoffMs: 60_000,
      ...options,
    };
    this.backoffMs = this.opts.minBackoffMs;
  }

  get state(): RconState {
    return this._state;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  get queueLength(): number {
    return this.queueHigh.length + this.queueNormal.length + (this.inFlight ? 1 : 0);
  }

  start(): void {
    if (this._state !== "stopped" && this.socket) return;
    this._state = "disconnected";
    this.connect();
  }

  stop(): void {
    this.clearTimers();
    this.setState("stopped");
    this.failAll(new RconError("RCON-Client wurde beendet", "stopped"));
    this.socket?.destroy();
    this.socket = null;
  }

  /** Wartet, bis die Verbindung steht (oder bricht nach timeoutMs ab). */
  waitForConnected(timeoutMs = 10_000): Promise<void> {
    if (this._state === "connected") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off("state", onState);
        reject(new RconError(this._lastError ?? "Keine Verbindung", "not_connected"));
      }, timeoutMs);
      const onState = (s: RconState) => {
        if (s === "connected") {
          clearTimeout(timer);
          this.off("state", onState);
          resolve();
        }
      };
      this.on("state", onState);
    });
  }

  send(command: string, priority: Priority = "normal", timeoutMs?: number): Promise<RconResponse> {
    if (this._state === "stopped") {
      return Promise.reject(new RconError("RCON-Client wurde beendet", "stopped"));
    }
    if (this._state !== "connected") {
      return Promise.reject(
        new RconError(this._lastError ?? "Keine RCON-Verbindung", "not_connected"),
      );
    }
    if (Buffer.byteLength(command, "utf8") > MAX_OUTGOING_BODY_BYTES) {
      return Promise.reject(
        new RconError(`Befehl zu lang (max. ${MAX_OUTGOING_BODY_BYTES} Bytes)`, "too_long"),
      );
    }
    return new Promise((resolve, reject) => {
      const job: Job = {
        command,
        timeoutMs: timeoutMs ?? this.opts.commandTimeoutMs,
        resolve,
        reject,
      };
      (priority === "high" ? this.queueHigh : this.queueNormal).push(job);
      this.pump();
    });
  }

  // --- intern -------------------------------------------------------------

  private setState(state: RconState, error?: string): void {
    if (error !== undefined) this._lastError = error;
    if (state === "connected") this._lastError = null;
    const changed = state !== this._state;
    this._state = state;
    if (changed) this.emit("state", state, this._lastError);
  }

  private allocId(): number {
    const id = this.nextId;
    this.nextId = this.nextId >= 0x7fff_fff0 ? 1 : this.nextId + 1;
    return id;
  }

  private connect(): void {
    if (this._state === "stopped") return;
    this.clearTimers();
    this.decoder.reset();
    this.setState("connecting");
    const socket = net.connect({ host: this.opts.host, port: this.opts.port });
    this.socket = socket;
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30_000);

    this.connectTimer = setTimeout(() => {
      this.handleDisconnect(socket, "Zeitüberschreitung beim Verbinden");
    }, this.opts.connectTimeoutMs);

    socket.on("connect", () => {
      this.authId = this.allocId();
      socket.write(encodePacket(this.authId, PacketType.AUTH, this.opts.password));
    });
    socket.on("data", (chunk) => {
      let packets: RconPacket[];
      try {
        packets = this.decoder.push(chunk);
      } catch (e) {
        this.handleDisconnect(socket, `Protokollfehler: ${(e as Error).message}`);
        return;
      }
      for (const p of packets) this.handlePacket(socket, p);
    });
    socket.on("error", (err: NodeJS.ErrnoException) => {
      this.handleDisconnect(socket, describeSocketError(err));
    });
    socket.on("close", () => {
      this.handleDisconnect(socket, this._lastError ?? "Verbindung geschlossen");
    });
  }

  private handlePacket(socket: net.Socket, p: RconPacket): void {
    if (this._state === "connecting") {
      // Minecraft antwortet auf Auth mit Typ 2 und ID = Anfrage-ID bzw. -1 bei falschem Passwort.
      // Manche Server senden vorher ein leeres Typ-0-Paket; das wird ignoriert.
      if (p.type !== PacketType.AUTH_RESPONSE) return;
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.connectTimer = null;
      if (p.id === -1) {
        this.handleDisconnect(socket, "RCON-Passwort falsch", "auth_failed");
        return;
      }
      if (p.id !== this.authId) return;
      this.backoffMs = this.opts.minBackoffMs;
      this.setState("connected");
      this.pump();
      return;
    }

    const f = this.inFlight;
    if (!f) return; // unaufgeforderte Pakete ignorieren
    if (p.id === f.commandId) {
      f.fragments.push(p.body);
      if (!f.markerSent) {
        f.markerSent = true;
        socket.write(encodePacket(f.markerId, PacketType.RESPONSE_VALUE, ""));
      }
    } else if (p.id === f.markerId) {
      clearTimeout(f.timer);
      this.inFlight = null;
      const body = Buffer.concat(f.fragments);
      f.job.resolve({
        command: f.job.command,
        // Erst nach dem Zusammensetzen dekodieren, damit Mehrbyte-Zeichen an
        // Paketgrenzen nicht zerbrechen.
        body: body.toString("utf8"),
        fragments: f.fragments.length,
        bytes: body.length,
        durationMs: Date.now() - f.startedAt,
        receivedAt: Date.now(),
      });
      this.pump();
    } else if (p.id === -1) {
      // Server hält uns für nicht authentifiziert
      this.handleDisconnect(socket, "Server meldet: nicht authentifiziert", "auth_failed");
    }
  }

  private pump(): void {
    if (this.inFlight || this._state !== "connected" || !this.socket) return;
    const job = this.queueHigh.shift() ?? this.queueNormal.shift();
    if (!job) return;
    const commandId = this.allocId();
    const markerId = this.allocId();
    const socket = this.socket;
    const timer = setTimeout(() => {
      // Ohne vollständige Antwort ist die Zuordnung der folgenden Pakete
      // unsicher, deshalb Verbindung neu aufbauen.
      this.handleDisconnect(socket, `Zeitüberschreitung bei Befehl (${job.timeoutMs} ms)`, "disconnected", "timeout");
    }, job.timeoutMs);
    this.inFlight = {
      job,
      commandId,
      markerId,
      markerSent: false,
      fragments: [],
      startedAt: Date.now(),
      timer,
    };
    // Der Marker folgt erst nach dem ersten Antwortfragment (siehe handlePacket).
    socket.write(encodePacket(commandId, PacketType.EXEC_COMMAND, job.command));
  }

  private handleDisconnect(
    socket: net.Socket,
    reason: string,
    state: RconState = "disconnected",
    code: RconError["code"] = "connection_lost",
  ): void {
    if (socket !== this.socket) return; // alte Verbindung
    this.socket = null;
    socket.removeAllListeners();
    socket.on("error", () => {});
    socket.destroy();
    this.clearTimers();
    if (this._state === "stopped") return;

    if (this.inFlight) {
      clearTimeout(this.inFlight.timer);
      this.inFlight.job.reject(new RconError(reason, code));
      this.inFlight = null;
    }
    // Wartende Befehle nicht über eine neue Verbindung nachholen: Konsolenbefehle
    // könnten sonst unerwartet später ausgeführt werden.
    this.failAll(new RconError(reason, "connection_lost"));

    this.setState(state, reason);
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, this.opts.maxBackoffMs);
    this.emit("reconnect_scheduled", delay);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private failAll(err: Error): void {
    const jobs = [...this.queueHigh, ...this.queueNormal];
    this.queueHigh = [];
    this.queueNormal = [];
    if (this.inFlight) {
      clearTimeout(this.inFlight.timer);
      jobs.push(this.inFlight.job);
      this.inFlight = null;
    }
    for (const j of jobs) j.reject(err);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.reconnectTimer = null;
    this.connectTimer = null;
  }
}

function describeSocketError(err: NodeJS.ErrnoException): string {
  switch (err.code) {
    case "ECONNREFUSED":
      return "Verbindung abgelehnt (RCON aktiv? Port richtig?)";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "RCON-Host nicht gefunden";
    case "ETIMEDOUT":
      return "Zeitüberschreitung beim Verbinden";
    case "ECONNRESET":
      return "Verbindung vom Server getrennt";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "Host nicht erreichbar";
    default:
      return `Verbindungsfehler (${err.code ?? err.message})`;
  }
}
