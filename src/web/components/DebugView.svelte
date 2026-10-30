<script lang="ts">
  import { formatDiagnostic } from "../../shared/diagnostic-messages";
  import { t as tr, language } from "../lib/i18n.svelte";
  import { api } from "../lib/api";
  import { dateTime, time } from "../lib/format";

  type Debug = Awaited<ReturnType<typeof api.debug>>;
  let data = $state<Debug | null>(null);
  let error = $state<string | null>(null);
  let auto = $state(true);
  let copied = $state<string | null>(null);

  async function load() {
    try {
      data = await api.debug();
      error = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  $effect(() => {
    load();
    if (!auto) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  });

  async function clearWarnings() {
    await api.clearWarnings();
    await load();
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = key;
      setTimeout(() => (copied = null), 1500);
    } catch {
      copied = null;
    }
  }

  const KIND_LABEL: Record<string, string> = {
    list: "Online-Liste (list uuids)",
    player: "Spielerdaten",
    "player-fallback": "Spielerdaten (Rückfallweg)",
    tps: "TPS",
    mspt: "MSPT",
    console: "Konsole",
  };
</script>

<div class="debug">
  <div class="panel">
    <div class="head">
      <h2>{tr("Selbstdiagnose")}</h2>
      <div class="actions">
        <label class="small"><input type="checkbox" bind:checked={auto} /> {tr("automatisch aktualisieren")}</label>
        <a class="btn small" href="/api/debug/export" download>{tr("Als JSON herunterladen")}</a>
        <button class="btn small" onclick={load}>{tr("Aktualisieren")}</button>
      </div>
    </div>
    <p class="muted small">
      {tr("Diese Seite zeigt die letzten Rohantworten des Servers und alle Hinweise des Parsers. Wenn etwas nicht stimmt, lade die JSON-Datei herunter und schick sie zur Analyse – Passwörter und Serveradresse sind nicht enthalten.")}
    </p>
    {#if error}<div class="err">{error}</div>{/if}
    {#if data}
      <div class="grid">
        <div><span class="k">Version</span> {data.version}</div>
        <div><span class="k">{tr("Gestartet")}</span> {dateTime(data.startedAt)}</div>
        <div><span class="k">{tr("RCON-Status")}</span> {data.rcon.state}{data.rcon.lastError ? ` – ${data.rcon.lastError}` : ""}</div>
        <div><span class="k">{tr("Befehle gesendet")}</span> {data.rcon.commandsSent}</div>
        <div><span class="k">{tr("Warteschlange")}</span> {data.rcon.queueLength}</div>
        <div><span class="k">{tr("Intervall")}</span> {data.status.pollIntervalMs / 1000} s</div>
        <div><span class="k">{tr("Texturen")}</span> {data.assets.textures ? `${data.assets.textures} (${data.assets.textureSource})` : tr("keine (Ersatz-Kacheln)")}</div>
        <div><span class="k">{tr("Sprachdatei")}</span> {data.assets.language ? `${data.assets.language} (${data.assets.translations})` : tr("keine")}</div>
        <div>
          <span class="k">{tr("Lizenzen")}</span>
          <a href="https://github.com/irgendeinjohan/mcrcondocker/blob/main/LICENSE" target="_blank" rel="noopener">MIT</a>
          · <a href="/third-party-licenses.md" target="_blank" rel="noopener">{tr("Drittanbieter")}</a>
        </div>
        {#if data.status.degraded}<div class="warnc">{tr("Rückfallweg aktiv: Spielerdaten nur eingeschränkt lesbar")}</div>{/if}
      </div>
    {/if}
  </div>

  {#if data}
    <div class="panel">
      <div class="head">
        <h2>{tr("Hinweise und Warnungen (")}{data.warnings.length})</h2>
        {#if data.warnings.length}<button class="btn small" onclick={clearWarnings}>{tr("Liste leeren")}</button>{/if}
      </div>
      {#if data.warnings.length === 0}
        <div class="ok">{tr("Keine Warnungen – alle Antworten konnten gelesen werden.")}</div>
      {:else}
        <div class="scroll-x">
          <table>
            <thead><tr><th>{tr("Stufe")}</th><th>{tr("Meldung")}</th><th>{tr("Anzahl")}</th><th>{tr("Zuletzt")}</th></tr></thead>
            <tbody>
              {#each data.warnings as w (w.key)}
                <tr>
                  <td><span class="lvl {w.level}">{w.level === "error" ? tr("Fehler") : w.level === "warn" ? tr("Warnung") : tr("Hinweis")}</span></td>
                  <td>
                    {w.messageData ? formatDiagnostic(language.locale, w.messageData) : w.message}
                    {#if w.context}<div class="ctx mono">{w.contextData ? formatDiagnostic(language.locale, w.contextData) : w.context}</div>{/if}
                  </td>
                  <td class="num">{w.count}</td>
                  <td class="num" title={dateTime(w.firstAt)}>{time(w.lastAt)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <div class="panel">
      <h2>{tr("Letzte Rohantworten")}</h2>
      {#each Object.entries(data.raw) as [kind, list] (kind)}
        <details open={kind === "list"}>
          <summary><b>{tr(KIND_LABEL[kind] ?? kind)}</b> <span class="faint">({list.length})</span></summary>
          {#each list as r, i (r.at + "-" + i)}
            <div class="raw">
              <div class="meta small">
                <span class="mono">{time(r.at)}</span>
                <span class="mono cmd">{r.command}</span>
                <span class="faint">{r.fragments} {tr("Paket(e),")} {r.bytes} Bytes, {r.durationMs} ms</span>
                {#if r.error}<span class="lvl error">{r.error}</span>{/if}
                {#if r.truncatedForDisplay}<span class="lvl warn">{tr("gekürzt")}</span>{/if}
                <button class="btn small" onclick={() => copy(r.body, kind + i)}>{copied === kind + i ? tr("kopiert ✓") : tr("kopieren")}</button>
              </div>
              <pre class="mono">{r.body || tr("(leer)")}</pre>
            </div>
          {/each}
        </details>
      {:else}
        <div class="muted">{tr("Noch keine Antworten.")}</div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .debug {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .head h2 {
    margin: 0;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .small {
    font-size: 13px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 6px 16px;
    font-size: 14px;
  }
  .k {
    color: var(--text-faint);
    margin-right: 6px;
  }
  .lvl {
    font-size: 12px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .lvl.error {
    background: #4a1714;
    color: #ff8a80;
  }
  .lvl.warn {
    background: #4a3510;
    color: #ffd27a;
  }
  .lvl.info {
    background: #12304a;
    color: #9ccfff;
  }
  .ctx {
    font-size: 12px;
    color: var(--text-faint);
    word-break: break-all;
    margin-top: 2px;
  }
  .num {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  details {
    margin: 8px 0;
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }
  summary {
    cursor: pointer;
  }
  .raw {
    margin: 8px 0 12px;
  }
  .meta {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }
  .cmd {
    color: #9ad1ff;
    word-break: break-all;
  }
  pre {
    background: #0b0c0e;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
    max-height: 260px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 12px;
    margin: 0;
  }
  .ok {
    color: var(--accent);
  }
  .warnc {
    color: var(--warn);
    font-weight: 600;
  }
  .err {
    color: var(--error);
  }
</style>
