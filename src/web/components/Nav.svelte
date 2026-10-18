<script lang="ts">
  import { router, type View } from "../lib/router.svelte";

  let { onlogout }: { onlogout: () => void } = $props();

  const items: { view: View; label: string; icon: string }[] = [
    { view: "players", label: "Spieler", icon: "👥" },
    { view: "map", label: "Karte", icon: "🗺️" },
    { view: "console", label: "Konsole", icon: "⌨️" },
    { view: "sessions", label: "Zeiten", icon: "⏱️" },
    { view: "debug", label: "Debug", icon: "🛠️" },
  ];
</script>

<nav class="nav" aria-label="Hauptnavigation">
  {#each items as it (it.view)}
    <a href="#/{it.view}" class:active={router.view === it.view} aria-current={router.view === it.view ? "page" : undefined}>
      <span class="ic" aria-hidden="true">{it.icon}</span><span class="lb">{it.label}</span>
    </a>
  {/each}
  <button class="logout" onclick={onlogout}><span class="ic" aria-hidden="true">🚪</span><span class="lb">Abmelden</span></button>
</nav>

<style>
  .nav {
    display: flex;
    gap: 4px;
    padding: 8px calc(16px + var(--safe-right)) 0 calc(16px + var(--safe-left));
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }
  a,
  .logout {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    color: var(--text-dim);
    text-decoration: none;
    border-bottom: 2px solid transparent;
    font-weight: 600;
    background: none;
    border-top: none;
    border-left: none;
    border-right: none;
  }
  a:hover {
    color: var(--text);
  }
  a.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .logout {
    display: none;
  }
  @media (max-width: 720px) {
    .nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 60;
      border-bottom: none;
      border-top: 1px solid var(--border);
      background: rgba(18, 20, 24, 0.96);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      padding: 4px calc(4px + var(--safe-right)) calc(4px + var(--safe-bottom)) calc(4px + var(--safe-left));
      justify-content: space-around;
      gap: 0;
    }
    a,
    .logout {
      flex-direction: column;
      gap: 1px;
      padding: 6px 4px;
      font-size: 11px;
      border-bottom: none;
      flex: 1;
    }
    a.active {
      color: var(--accent);
    }
    .ic {
      font-size: 19px;
    }
    .logout {
      display: flex;
    }
  }
</style>
