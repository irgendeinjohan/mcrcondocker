// Gemeinsamer Live-Zustand, gespeist aus Server-Sent Events.
import type { AuditEntry, ConsoleEntry, LiveEvent, PlayerSummary, ServerStatus } from "../../shared/types";
import { api, type AssetsInfo } from "./api";

class LiveState {
  status = $state<ServerStatus | null>(null);
  players = $state<PlayerSummary[]>([]);
  console = $state<ConsoleEntry[]>([]);
  /** neue Protokolleinträge seit dem Verbinden (neueste zuerst) */
  audit = $state<AuditEntry[]>([]);
  /** SSE-Verbindung zum Dashboard selbst (nicht RCON) */
  liveConnected = $state(false);
  assets = $state<AssetsInfo | null>(null);
  /** sekündlich aktualisiert, für relative Zeitangaben */
  now = $state(Date.now());

  private es: EventSource | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.stop();
    this.clock = setInterval(() => (this.now = Date.now()), 1000);
    api.consoleHistory().then((h) => (this.console = h)).catch(() => {});
    api.assets().then((a) => (this.assets = a)).catch(() => {});
    const es = new EventSource("/api/events");
    this.es = es;
    es.onopen = () => (this.liveConnected = true);
    es.onerror = () => {
      this.liveConnected = false;
      // abgelaufene Anmeldung erkennen (EventSource liefert den Statuscode nicht)
      api.session().then((s) => {
        if (!s.authenticated) {
          this.stop();
          window.dispatchEvent(new CustomEvent("mcdash:logout"));
        }
      }).catch(() => {});
    };
    es.onmessage = (msg) => {
      let ev: LiveEvent;
      try {
        ev = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (ev.type === "status") this.status = ev.status;
      else if (ev.type === "players") this.players = ev.players;
      else if (ev.type === "console") {
        if (!this.console.some((c) => c.id === ev.entry.id)) this.console = [...this.console, ev.entry].slice(-200);
      } else if (ev.type === "audit") {
        if (!this.audit.some((a) => a.id === ev.entry.id)) this.audit = [ev.entry, ...this.audit].slice(0, 200);
      }
    };
  }

  stop(): void {
    this.es?.close();
    this.es = null;
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    this.liveConnected = false;
  }

  addConsole(entry: ConsoleEntry): void {
    if (!this.console.some((c) => c.id === entry.id)) this.console = [...this.console, entry].slice(-200);
  }
}

export const live = new LiveState();
