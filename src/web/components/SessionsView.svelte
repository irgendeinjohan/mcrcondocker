<script lang="ts">
  import type { GapEntry, PlayerSessionStats, SessionEntry } from "../../shared/types";
  import { api } from "../lib/api";
  import { ago, dateTime, duration, shortDate } from "../lib/format";
  import { live } from "../lib/live.svelte";
  import { router } from "../lib/router.svelte";

  let stats = $state<PlayerSessionStats[]>([]);
  let sessions = $state<SessionEntry[] | null>(null);
  let gaps = $state<GapEntry[]>([]);
  let error = $state<string | null>(null);
  let sort = $state<"total" | "last" | "name">("total");

  const selected = $derived(router.param);
  const selectedStats = $derived(stats.find((s) => s.uuid === selected));

  async function load() {
    try {
      const r = await api.sessions(selected ?? undefined);
      stats = r.stats;
      gaps = r.gaps;
      sessions = r.sessions ?? null;
      error = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  // neu laden bei Auswahl und alle 30 s (laufende Sessions)
  $effect(() => {
    void selected;
    void live.players.filter((p) => p.online).length;
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  });

  const sorted = $derived(
    [...stats].sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "last" ? (b.lastSeen ?? 0) - (a.lastSeen ?? 0) : b.totalMs - a.totalMs,
    ),
  );

  const REASON: Record<GapEntry["reason"], string> = {
    paused: "Abfragen pausiert",
    rcon_error: "RCON nicht erreichbar",
    dashboard_offline: "Dashboard lief nicht",
  };

  /** Lücken, die eine Session-Lücke erklären (Ende "unknown") */
  function gapAfter(s: SessionEntry): GapEntry | undefined {
    return gaps.find((g) => s.end !== null && Math.abs(g.start - s.end) < 1000);
  }
</script>

{#if error}<div class="panel err">{error}</div>{/if}

<div class="wrap">
  <section class="panel">
    <div class="head">
      <h2>Online-Zeiten</h2>
      <label class="muted small">
        Sortierung
        <select bind:value={sort}>
          <option value="total">Gesamtzeit</option>
          <option value="last">Zuletzt gesehen</option>
          <option value="name">Name</option>
        </select>
      </label>
    </div>
    <div class="scroll-x">
      <table>
        <thead>
          <tr><th>Spieler</th><th>Gesamt</th><th>Sessions</th><th>Zuletzt gesehen</th></tr>
        </thead>
        <tbody>
          {#each sorted as s (s.uuid)}
            <tr class:active={s.uuid === selected} onclick={() => router.go("sessions", s.uuid)}>
              <td>
                <span class="dot" class:on={s.online}></span>
                <a href="#/sessions/{s.uuid}">{s.name}</a>
                {#if s.isBedrock}<span class="badge bedrock">Bedrock</span>{/if}
              </td>
              <td class="num">{duration(s.totalMs)}</td>
              <td class="num">{s.sessionCount}</td>
              <td title={dateTime(s.lastSeen)}>{s.online ? "jetzt online" : ago(s.lastSeen, live.now)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="faint small">
      Gezählt wird, solange ein Spieler bei den /list-Abfragen online ist. Zeiten, in denen nicht abgefragt wurde
      (Pause, Verbindungsfehler, Dashboard aus), gelten als <b>unbekannt</b> und werden weder als online noch als offline gezählt.
    </p>
  </section>

  {#if selected && sessions}
    <section class="panel">
      <div class="head">
        <h2>{selectedStats?.name ?? "Spieler"} – letzte Sessions</h2>
        <a class="btn small" href="#/players/{selected}">Spieler ansehen</a>
      </div>
      {#if sessions.length === 0}
        <div class="muted">Keine Sessions.</div>
      {:else}
        <div class="scroll-x">
          <table>
            <thead><tr><th>Beginn</th><th>Ende</th><th>Dauer</th><th>Ende erkannt durch</th></tr></thead>
            <tbody>
              {#each sessions as s (s.id)}
                <tr>
                  <td>{shortDate(s.start)}</td>
                  <td>{s.end ? shortDate(s.end) : "läuft"}</td>
                  <td class="num">{duration((s.end ?? live.now) - s.start)}</td>
                  <td>
                    {#if s.end === null}
                      <span class="badge" style="color: var(--accent)">online</span>
                    {:else if s.endReason === "logout"}
                      Logout
                    {:else}
                      <span class="unknown">unbekannt</span>
                      {#if gapAfter(s)}<span class="faint">({REASON[gapAfter(s)!.reason]})</span>{/if}
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}

  <section class="panel">
    <h2>Lücken in der Erfassung (30 Tage)</h2>
    {#if gaps.length === 0}
      <div class="muted">Keine Lücken.</div>
    {:else}
      <div class="scroll-x">
        <table>
          <thead><tr><th>Von</th><th>Bis</th><th>Dauer</th><th>Grund</th></tr></thead>
          <tbody>
            {#each gaps as g (g.id)}
              <tr class="gap">
                <td>{shortDate(g.start)}</td>
                <td>{g.end ? shortDate(g.end) : "andauernd"}</td>
                <td class="num">{duration((g.end ?? live.now) - g.start)}</td>
                <td>{REASON[g.reason] ?? g.reason}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>

<style>
  .wrap {
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
    margin-bottom: 8px;
  }
  .head h2 {
    margin: 0;
  }
  .small {
    font-size: 13px;
  }
  tbody tr {
    cursor: pointer;
  }
  tbody tr:hover,
  tr.active {
    background: var(--panel-2);
  }
  td .dot {
    margin-right: 6px;
  }
  .num {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .unknown {
    color: var(--warn);
  }
  tr.gap td {
    background: repeating-linear-gradient(135deg, transparent 0 8px, rgba(224, 165, 38, 0.05) 8px 16px);
  }
  .err {
    border-color: var(--error);
    color: var(--error);
    margin-bottom: 10px;
  }
</style>
