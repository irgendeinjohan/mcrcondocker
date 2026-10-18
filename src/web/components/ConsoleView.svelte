<script lang="ts">
  import { parseLegacy } from "../../shared/mctext";
  import { dangerousReason } from "../../shared/dangerous";
  import { api, ApiError } from "../lib/api";
  import { time } from "../lib/format";
  import { live } from "../lib/live.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import McText from "./McText.svelte";

  const HISTORY_KEY = "mcdash.console.history";
  let input = $state("");
  let busy = $state(false);
  let history = $state<string[]>(loadHistory());
  let histIndex = $state(-1);
  let draft = "";
  let confirm = $state<{ command: string; reason: string } | null>(null);
  let out = $state<HTMLDivElement | undefined>();
  let inputEl = $state<HTMLInputElement | undefined>();
  let stripColors = $state(false);

  function loadHistory(): string[] {
    try {
      const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(-100) : [];
    } catch {
      return [];
    }
  }
  function saveHistory(): void {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-100)));
    } catch {
      /* ignorieren */
    }
  }

  // automatisch nach unten scrollen
  $effect(() => {
    void live.console.length;
    queueMicrotask(() => out && (out.scrollTop = out.scrollHeight));
  });

  async function run(command: string, confirmed: boolean) {
    busy = true;
    try {
      const entry = await api.console(command, confirmed);
      live.addConsole(entry);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body.needsConfirmation) {
        confirm = { command, reason: String(e.body.reason ?? "") };
      } else {
        live.addConsole({ id: -Date.now(), at: Date.now(), command, output: `Fehler: ${(e as Error).message}`, ok: false, durationMs: 0 });
      }
    } finally {
      busy = false;
      inputEl?.focus();
    }
  }

  function submit(e: Event) {
    e.preventDefault();
    const command = input.trim().replace(/^\/+/, "");
    if (!command || busy) return;
    if (history[history.length - 1] !== command) history = [...history, command].slice(-100);
    saveHistory();
    histIndex = -1;
    input = "";
    const reason = dangerousReason(command);
    if (reason) {
      confirm = { command, reason };
      return;
    }
    void run(command, false);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowUp") {
      if (!history.length) return;
      e.preventDefault();
      if (histIndex === -1) {
        draft = input;
        histIndex = history.length - 1;
      } else if (histIndex > 0) histIndex--;
      input = history[histIndex] ?? "";
    } else if (e.key === "ArrowDown") {
      if (histIndex === -1) return;
      e.preventDefault();
      if (histIndex < history.length - 1) {
        histIndex++;
        input = history[histIndex] ?? "";
      } else {
        histIndex = -1;
        input = draft;
      }
    }
  }

  function quick(cmd: string) {
    void run(cmd, false);
  }
</script>

<div class="console">
  <div class="bar">
    <div class="quick">
      {#each ["list", "tps", "mspt", "seed", "time query daytime"] as c (c)}
        <button class="btn small" onclick={() => quick(c)} disabled={busy}>{c}</button>
      {/each}
    </div>
    <label class="chk"><input type="checkbox" bind:checked={stripColors} /> Farben ausblenden</label>
  </div>
  {#if live.status?.paused}
    <div class="note">Automatische Abfragen sind pausiert – manuelle Befehle funktionieren trotzdem.</div>
  {/if}
  <div class="out mono" bind:this={out} aria-live="polite">
    {#if live.console.length === 0}
      <div class="faint">Noch keine Befehle. Ausgaben erscheinen hier.</div>
    {/if}
    {#each live.console as e (e.id)}
      <div class="entry">
        <div class="cmd"><span class="faint">{time(e.at)}</span> <span class="prompt">&gt;</span> {e.command}</div>
        <div class="res" class:err={!e.ok}>
          {#if e.output === ""}
            <span class="faint">(keine Ausgabe)</span>
          {:else if stripColors}
            {e.output.replace(/§x(§[0-9a-fA-F]){6}|§./g, "")}
          {:else}
            <McText segments={parseLegacy(e.output)} />
          {/if}
        </div>
      </div>
    {/each}
  </div>
  <form class="input" onsubmit={submit}>
    <span class="prompt mono">/</span>
    <input
      bind:this={inputEl}
      bind:value={input}
      onkeydown={onKey}
      class="mono"
      placeholder="Befehl eingeben (↑/↓ Verlauf)"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="send"
      aria-label="Befehl"
    />
    <button class="btn primary" type="submit" disabled={busy || !input.trim()}>Senden</button>
  </form>
</div>

<ConfirmDialog
  open={!!confirm}
  title="Befehl bestätigen"
  message={confirm ? `Dieser Befehl ist potenziell gefährlich: ${confirm.reason}. Wirklich ausführen?` : ""}
  detail={confirm ? "/" + confirm.command : ""}
  onconfirm={() => {
    const c = confirm;
    confirm = null;
    if (c) void run(c.command, true);
  }}
  oncancel={() => {
    confirm = null;
    inputEl?.focus();
  }}
/>

<style>
  .console {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: calc(100vh - 150px - var(--safe-bottom));
    height: calc(100dvh - 150px - var(--safe-bottom));
    min-height: 340px;
  }
  .bar {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }
  .quick {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chk {
    display: flex;
    gap: 4px;
    align-items: center;
    font-size: 13px;
  }
  .note {
    color: var(--warn);
    font-size: 13px;
  }
  .out {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: #0b0c0e;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 12px;
    font-size: 13px;
    color: #dcdcdc;
  }
  .entry {
    margin-bottom: 10px;
  }
  .cmd {
    color: #9ad1ff;
  }
  .prompt {
    color: var(--accent);
  }
  .res {
    white-space: pre-wrap;
    word-break: break-word;
    padding-left: 14px;
  }
  .res.err {
    color: var(--error);
  }
  .input {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .input input {
    flex: 1;
    min-width: 0;
    font-size: 16px; /* verhindert Zoom auf iOS */
  }
  @media (max-width: 720px) {
    .console {
      height: calc(100dvh - 175px - var(--safe-top) - var(--safe-bottom));
      min-height: 300px;
    }
  }
</style>
