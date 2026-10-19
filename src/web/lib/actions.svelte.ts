// Führt Dashboard-Aktionen aus: Sicherheitsabfrage bei gefährlichen Aktionen,
// kurze Rückmeldung (Toast) mit der Antwort des Servers.
import type { ActionRequest, ActionResult } from "../../shared/types";
import { api, ApiError } from "./api";

export interface Toast {
  id: number;
  ok: boolean;
  title: string;
  detail: string;
}

interface PendingConfirm {
  label: string;
  reason: string;
  resolve: (yes: boolean) => void;
}

class Actions {
  toasts = $state<Toast[]>([]);
  confirm = $state<PendingConfirm | null>(null);
  /** Anzahl laufender Aktionen (Buttons sperren) */
  busy = $state(0);
  private nextId = 1;

  toast(ok: boolean, title: string, detail = ""): void {
    const t = { id: this.nextId++, ok, title, detail };
    this.toasts = [...this.toasts, t].slice(-4);
    setTimeout(() => (this.toasts = this.toasts.filter((x) => x.id !== t.id)), ok ? 4000 : 8000);
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((x) => x.id !== id);
  }

  private ask(label: string, reason: string): Promise<boolean> {
    return new Promise((resolve) => (this.confirm = { label, reason, resolve }));
  }

  answer(yes: boolean): void {
    const c = this.confirm;
    this.confirm = null;
    c?.resolve(yes);
  }

  /** Gibt das Ergebnis zurück, oder null bei Abbruch/Fehler. */
  async run(action: ActionRequest, opts: { quiet?: boolean } = {}): Promise<ActionResult | null> {
    this.busy++;
    try {
      let result: ActionResult;
      try {
        result = await api.action(action);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 409 && e.body.needsConfirmation)) throw e;
        const yes = await this.ask(String(e.body.label ?? ""), String(e.body.reason ?? ""));
        if (!yes) return null;
        result = await api.action(action, true);
      }
      if (!result.ok) this.toast(false, `Fehlgeschlagen: ${result.label}`, result.output);
      else if (!opts.quiet) this.toast(true, result.label, result.output);
      return result;
    } catch (e) {
      this.toast(false, "Aktion fehlgeschlagen", (e as Error).message);
      return null;
    } finally {
      this.busy--;
    }
  }
}

export const actions = new Actions();
