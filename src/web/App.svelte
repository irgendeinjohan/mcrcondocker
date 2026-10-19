<script lang="ts">
  import { onMount } from "svelte";
  import { api, setUnauthorizedHandler } from "./lib/api";
  import { live } from "./lib/live.svelte";
  import { router } from "./lib/router.svelte";
  import { tooltip } from "./lib/tooltip.svelte";
  import ActionHost from "./components/ActionHost.svelte";
  import ConsoleView from "./components/ConsoleView.svelte";
  import DebugView from "./components/DebugView.svelte";
  import ItemTooltip from "./components/ItemTooltip.svelte";
  import Login from "./components/Login.svelte";
  import MapView from "./components/MapView.svelte";
  import Nav from "./components/Nav.svelte";
  import PlayersView from "./components/PlayersView.svelte";
  import SessionsView from "./components/SessionsView.svelte";
  import TopBar from "./components/TopBar.svelte";
  import WorldView from "./components/WorldView.svelte";

  let auth = $state<"unknown" | "in" | "out">("unknown");
  let mock = $state(false);

  function loggedOut() {
    live.stop();
    auth = "out";
  }

  async function check() {
    try {
      const s = await api.session();
      mock = s.mock;
      auth = s.authenticated ? "in" : "out";
    } catch {
      auth = "out";
    }
  }

  async function logout() {
    await api.logout().catch(() => {});
    loggedOut();
  }

  onMount(() => {
    setUnauthorizedHandler(loggedOut);
    window.addEventListener("mcdash:logout", loggedOut);
    void check();
    return () => window.removeEventListener("mcdash:logout", loggedOut);
  });

  $effect(() => {
    if (auth === "in") live.start();
  });

  // Tooltip beim Seitenwechsel schließen
  $effect(() => {
    void router.view;
    void router.param;
    tooltip.close();
  });
</script>

{#if auth === "unknown"}
  <div class="loading muted">Lade …</div>
{:else if auth === "out"}
  <Login {mock} onlogin={() => (auth = "in")} />
{:else}
  <TopBar onlogout={loggedOut} />
  <Nav onlogout={logout} />
  <main class="content">
    {#if router.view === "players"}
      <PlayersView />
    {:else if router.view === "map"}
      <MapView />
    {:else if router.view === "world"}
      <WorldView />
    {:else if router.view === "console"}
      <ConsoleView />
    {:else if router.view === "sessions"}
      <SessionsView />
    {:else if router.view === "debug"}
      <DebugView />
    {/if}
  </main>
  <ItemTooltip />
  <ActionHost />
{/if}

<style>
  .loading {
    padding: 40px;
    text-align: center;
  }
  .content {
    padding: 16px calc(16px + var(--safe-right)) 24px calc(16px + var(--safe-left));
    max-width: 1500px;
    margin: 0 auto;
  }
  @media (max-width: 720px) {
    .content {
      padding: 12px calc(10px + var(--safe-right)) calc(84px + var(--safe-bottom)) calc(10px + var(--safe-left));
    }
  }
</style>
