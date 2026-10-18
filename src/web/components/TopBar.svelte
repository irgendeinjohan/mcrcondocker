<script lang="ts">
  import { api } from "../lib/api";
  import { ago, time } from "../lib/format";
  import { live } from "../lib/live.svelte";

  let { onlogout }: { onlogout: () => void } = $props();
  let busy = $state(false);

  const s = $derived(live.status);
  const conn = $derived.by(() => {
    if (!live.liveConnected) return { cls: "error", label: "Dashboard nicht erreichbar" };
    if (!s) return { cls: "connecting", label: "Verbinde …" };
    switch (s.connection) {
      case "connected":
        return { cls: "ok", label: "Verbunden" };
      case "paused":
        return { cls: "paused", label: "Pausiert" };
      case "connecting":
        return { cls: "connecting", label: "Verbinde …" };
      case "auth_failed":
        return { cls: "error", label: "RCON-Passwort falsch" };
      default:
        return { cls: "error", label: "Verbindungsfehler" };
    }
  });
  // Aktualisierung ist "alt", wenn sie mehr als 3 Intervalle zurückliegt
  const stale = $derived(!!s?.lastUpdate && !s.paused && live.now - s.lastUpdate > s.pollIntervalMs * 3 + 2000);
  const tps = $derived(s?.perf?.tps?.[0] ?? null);
  const mspt = $derived(s?.perf?.mspt?.[0]?.avg ?? null);

  async function togglePause() {
    if (!s) return;
    busy = true;
    try {
      live.status = await api.setPaused(!s.paused);
    } finally {
      busy = false;
    }
  }

  async function logout() {
    await api.logout().catch(() => {});
    onlogout();
  }

  function tpsColor(v: number) {
    return v >= 19 ? "var(--accent)" : v >= 15 ? "var(--warn)" : "var(--error)";
  }
  function msptColor(v: number) {
    return v <= 40 ? "var(--accent)" : v <= 50 ? "var(--warn)" : "var(--error)";
  }
</script>

<header class="top">
  <div class="brand">
    <img src="/icons/icon.svg" alt="" width="26" height="26" />
    <span class="title">MC-Dashboard</span>
    {#if s?.mock}<span class="badge mock">Mock</span>{/if}
  </div>

  <div class="status {conn.cls}" role="status" aria-live="polite">
    <span class="light"></span>
    <span class="label">{conn.label}</span>
    {#if s?.message && (conn.cls === "error")}<span class="msg">{s.message}</span>{/if}
  </div>

  <div class="meta">
    <span class:stale title={s?.lastUpdate ? `Letzte Aktualisierung ${time(s.lastUpdate)}` : ""}>
      {#if s?.paused}
        pausiert {s.pausedSince ? ago(s.pausedSince, live.now) : ""}
      {:else}
        Stand {s?.lastUpdate ? time(s.lastUpdate) : "–"}
      {/if}
    </span>
    {#if s?.online !== null && s?.online !== undefined}
      <span title="Spieler online">👤 {s.online}/{s.maxPlayers ?? "?"}</span>
    {/if}
    {#if tps !== null}<span title="TPS (letzte Minute)">TPS <b style:color={tpsColor(tps)}>{tps.toFixed(1)}</b></span>{/if}
    {#if mspt !== null}<span title="MSPT (Durchschnitt 5 s)">MSPT <b style:color={msptColor(mspt)}>{mspt.toFixed(1)}</b></span>{/if}
  </div>

  <div class="actions">
    <button
      class="btn pause"
      class:paused={s?.paused}
      onclick={togglePause}
      disabled={busy || !s}
      aria-pressed={s?.paused ?? false}
      title={s?.paused ? "Automatische Abfragen fortsetzen" : "Alle automatischen RCON-Abfragen pausieren"}
    >
      {s?.paused ? "▶ Fortsetzen" : "⏸ Pausieren"}
    </button>
    <button class="btn small ghost" onclick={logout} title="Abmelden">Abmelden</button>
  </div>
</header>
{#if s?.paused}
  <div class="banner paused">
    Automatische Abfragen sind pausiert. Online-Zeiten werden in dieser Zeit als „unbekannt“ gespeichert. Die Konsole funktioniert weiter.
  </div>
{:else if conn.cls === "error"}
  <div class="banner error">
    {conn.label}{s?.message ? `: ${s.message}` : ""}. Es wird automatisch neu verbunden. Angezeigt wird der letzte bekannte Stand.
  </div>
{:else if stale}
  <div class="banner warn">Die letzte erfolgreiche Aktualisierung ist {ago(s?.lastUpdate, live.now)} her.</div>
{/if}

<style>
  .top {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 10px 18px;
    flex-wrap: wrap;
    padding: calc(8px + var(--safe-top)) calc(16px + var(--safe-right)) 8px calc(16px + var(--safe-left));
    background: rgba(18, 20, 24, 0.92);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
  }
  .badge.mock {
    color: var(--warn);
    border-color: var(--warn);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 14px;
    border: 1px solid;
    max-width: 100%;
  }
  .status .light {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: currentColor;
    flex: none;
  }
  .status.ok {
    color: var(--accent);
    background: rgba(91, 191, 91, 0.1);
  }
  .status.ok .light {
    box-shadow: 0 0 8px currentColor;
  }
  .status.paused {
    color: var(--warn);
    background: rgba(224, 165, 38, 0.12);
  }
  .status.error {
    color: var(--error);
    background: rgba(229, 83, 75, 0.12);
  }
  .status.connecting {
    color: var(--info);
    background: rgba(78, 161, 255, 0.1);
  }
  .status.connecting .light {
    animation: pulse 1s ease-in-out infinite alternate;
  }
  .msg {
    font-weight: 400;
    font-size: 12px;
    opacity: 0.9;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 260px;
  }
  .meta {
    display: flex;
    gap: 14px;
    color: var(--text-dim);
    font-size: 13px;
    flex-wrap: wrap;
    font-variant-numeric: tabular-nums;
  }
  .meta .stale {
    color: var(--warn);
  }
  .actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .pause {
    font-weight: 700;
  }
  .pause.paused {
    background: #4a3510;
    border-color: var(--warn);
    color: #ffd27a;
  }
  .ghost {
    background: transparent;
  }
  .banner {
    padding: 8px 16px;
    font-size: 13px;
    border-bottom: 1px solid var(--border);
  }
  .banner.paused {
    background: #2e2410;
    color: #ffd27a;
  }
  .banner.error {
    background: #2e1414;
    color: #ff9a92;
  }
  .banner.warn {
    background: #2a2412;
    color: var(--warn);
  }
  @keyframes pulse {
    from {
      opacity: 0.3;
    }
    to {
      opacity: 1;
    }
  }
  @media (max-width: 720px) {
    .title {
      display: none;
    }
    .msg {
      display: none;
    }
    .meta {
      order: 4;
      width: 100%;
      gap: 12px;
    }
    .actions .ghost {
      display: none;
    }
  }
</style>
