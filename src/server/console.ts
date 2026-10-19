// Manuelle Konsolenbefehle. Funktionieren auch während der Pause.
import { EventEmitter } from "node:events";
import { dangerousReason } from "../shared/dangerous.js";
import type { ConsoleEntry, LiveEvent } from "../shared/types.js";
import type { Diagnostics } from "./parse/diagnostics.js";
import type { RconClient } from "./rcon/client.js";

const MAX_HISTORY = 200;

export type ConsoleResult =
  | { kind: "done"; entry: ConsoleEntry }
  | { kind: "needs_confirmation"; reason: string }
  | { kind: "invalid"; message: string };

export class ConsoleService extends EventEmitter {
  private history: ConsoleEntry[] = [];
  private nextId = 1;

  constructor(
    private readonly rcon: RconClient,
    private readonly diag: Diagnostics,
    private readonly extraDangerous: string[],
    /** schreibt jeden ausgeführten Befehl ins Aktionsprotokoll */
    private readonly audit?: (command: string, ok: boolean, output: string) => void,
  ) {
    super();
  }

  entries(): ConsoleEntry[] {
    return this.history;
  }

  async run(input: string, confirmed: boolean): Promise<ConsoleResult> {
    const command = input.trim().replace(/^\/+/, "");
    if (!command) return { kind: "invalid", message: "Leerer Befehl" };
    if (/[\r\n]/.test(command)) return { kind: "invalid", message: "Befehl darf keine Zeilenumbrüche enthalten" };
    const reason = dangerousReason(command, this.extraDangerous);
    if (reason && !confirmed) return { kind: "needs_confirmation", reason };
    const started = Date.now();
    let entry: ConsoleEntry;
    try {
      const r = await this.rcon.send(command, "high");
      this.diag.recordRaw({ at: r.receivedAt, kind: "console", command, body: r.body, fragments: r.fragments, bytes: r.bytes, durationMs: r.durationMs });
      entry = { id: this.nextId++, at: started, command, output: r.body, ok: true, durationMs: r.durationMs };
    } catch (e) {
      const msg = (e as Error).message;
      this.diag.recordRaw({ at: Date.now(), kind: "console", command, body: "", fragments: 0, bytes: 0, durationMs: Date.now() - started, error: msg });
      entry = { id: this.nextId++, at: started, command, output: `Fehler: ${msg}`, ok: false, durationMs: Date.now() - started };
    }
    this.audit?.(command, entry.ok, entry.output);
    this.history.push(entry);
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);
    this.emit("event", { type: "console", entry } satisfies LiveEvent);
    return { kind: "done", entry };
  }
}
