// Online-Zeiten aus dem Vergleich aufeinanderfolgender /list-Abfragen.
//
// Regeln:
// - Spieler taucht in /list auf → Session beginnt zum Zeitpunkt der Abfrage.
// - Spieler fehlt in /list → Session endet zum Zeitpunkt der Abfrage ("logout").
// - Erfassung unterbrochen (Pause, RCON-Fehler, Dashboard aus) → offene Sessions
//   enden zum Zeitpunkt der letzten erfolgreichen Abfrage ("unknown"), und eine
//   Lücke wird gespeichert. Die Lücke zählt weder als online noch als offline.
//   Mit der nächsten erfolgreichen Abfrage endet die Lücke; wer dann online ist,
//   bekommt eine neue Session.
import type { GapEntry } from "../shared/types.js";
import { tx } from "./db/db.js";
import type { Repo } from "./db/repo.js";

export interface ObservedPlayer {
  uuid: string;
  name: string;
  isBedrock: boolean;
}

const LAST_POLL = "last_poll_at";

export class SessionTracker {
  constructor(private readonly repo: Repo) {}

  get lastObservedAt(): number | null {
    const v = this.repo.getSetting(LAST_POLL);
    return v === null ? null : Number(v);
  }

  /** Beim Start: Zeit, in der das Dashboard nicht lief, als Lücke markieren. */
  recoverOnStartup(now: number): void {
    tx(this.repo.db, () => {
      if (this.repo.openGap()) return; // z. B. war pausiert – Lücke läuft weiter
      const last = this.lastObservedAt;
      if (last === null) return; // Erststart
      this.closeOpenSessions(last);
      this.repo.startGap(last, "dashboard_offline");
    });
    void now;
  }

  /** Erfolgreiche Abfrage der Online-Liste. */
  observe(players: ObservedPlayer[], at: number): { joined: string[]; left: string[] } {
    return tx(this.repo.db, () => {
      const gap = this.repo.openGap();
      if (gap) this.repo.endGap(gap.id, Math.max(at, gap.start));
      const open = new Map(this.repo.openSessions().map((s) => [s.uuid, s]));
      const online = new Set(players.map((p) => p.uuid));
      const joined: string[] = [];
      const left: string[] = [];
      for (const p of players) {
        this.repo.upsertPlayer(p.uuid, p.name, p.isBedrock, at);
        if (!open.has(p.uuid)) {
          this.repo.startSession(p.uuid, at);
          joined.push(p.uuid);
        }
      }
      for (const [uuid, s] of open) {
        if (!online.has(uuid)) {
          this.repo.endSession(s.id, Math.max(at, s.start), "logout");
          left.push(uuid);
        }
      }
      this.repo.setSetting(LAST_POLL, String(at));
      return { joined, left };
    });
  }

  /** Erfassung unterbrochen (Pause oder Verbindungsfehler). */
  interrupt(reason: GapEntry["reason"], at: number): void {
    tx(this.repo.db, () => {
      if (this.repo.openGap()) return;
      const last = this.lastObservedAt ?? at;
      this.closeOpenSessions(last);
      this.repo.startGap(Math.min(last, at), reason);
    });
  }

  private closeOpenSessions(at: number): void {
    for (const s of this.repo.openSessions()) this.repo.endSession(s.id, Math.max(at, s.start), "unknown");
  }
}
