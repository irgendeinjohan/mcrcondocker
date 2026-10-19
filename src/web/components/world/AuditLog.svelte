<script lang="ts">
  import type { AuditEntry } from "../../../shared/types";
  import { api } from "../../lib/api";
  import { dateTime } from "../../lib/format";
  import { live } from "../../lib/live.svelte";

  const PAGE = 100;
  let loaded = $state<AuditEntry[]>([]);
  let more = $state(false);
  let error = $state<string | null>(null);
  let filter = $state<"all" | "action" | "console">("all");
  let openId = $state<number | null>(null);

  async function load(before?: number) {
    try {
      const page = await api.audit(PAGE, before);
      loaded = before ? [...loaded, ...page] : page;
      more = page.length === PAGE;
      error = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  $effect(() => {
    void load();
  });

  // neue Einträge per Live-Verbindung oben einfügen
  const entries = $derived.by(() => {
    const ids = new Set(loaded.map((e) => e.id));
    const all = [...live.audit.filter((e) => !ids.has(e.id)), ...loaded];
    return filter === "all" ? all : all.filter((e) => e.source === filter);
  });
</script>

<section class="panel">
  <div class="head">
    <h3>Aktionsprotokoll</h3>
    <select bind:value={filter} aria-label="Filter">
      <option value="all">Alles</option>
      <option value="action">Nur Aktionen</option>
      <option value="console">Nur Konsole</option>
    </select>
  </div>
  <p class="faint small">Alles, was über das Dashboard am Server ausgeführt wurde (die letzten 5000 Einträge).</p>
  {#if error}
    <div class="err">{error}</div>
  {/if}
  {#if !entries.length && !error}
    <div class="faint">Noch keine Einträge.</div>
  {/if}
  <ul>
    {#each entries as e (e.id)}
      <li class:fail={!e.ok}>
        <button class="line" onclick={() => (openId = openId === e.id ? null : e.id)} aria-expanded={openId === e.id}>
          <span class="t faint">{dateTime(e.at)}</span>
          <span class="badge">{e.source === "console" ? "Konsole" : "Aktion"}</span>
          <span class="lbl">{e.ok ? "" : "✕ "}{e.label}</span>
        </button>
        {#if openId === e.id}
          <div class="more">
            <div class="mono cmd">{e.command.split("\n").map((c) => "/" + c).join("\n")}</div>
            {#if e.output}<div class="mono out">{e.output}</div>{/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  {#if more}
    <button class="btn small" onclick={() => load(loaded[loaded.length - 1]?.id)}>Ältere laden</button>
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h3 {
    margin: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    border-bottom: 1px solid var(--border);
  }
  .line {
    display: flex;
    gap: 8px;
    align-items: baseline;
    width: 100%;
    background: none;
    border: none;
    padding: 6px 2px;
    text-align: left;
    flex-wrap: wrap;
  }
  .t {
    font-size: 12px;
    white-space: nowrap;
  }
  .lbl {
    flex: 1;
    min-width: 0;
    word-break: break-word;
  }
  li.fail .lbl {
    color: var(--error);
  }
  .more {
    padding: 0 2px 8px;
    font-size: 12px;
  }
  .cmd {
    color: #9ad1ff;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .out {
    color: var(--text-dim);
    white-space: pre-wrap;
    word-break: break-word;
    margin-top: 3px;
  }
  .err {
    color: var(--error);
  }
  .small {
    font-size: 12px;
    margin: 0;
  }
</style>
