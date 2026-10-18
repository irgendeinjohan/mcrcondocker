<script lang="ts">
  import { live } from "../lib/live.svelte";
  import { router } from "../lib/router.svelte";
  import PlayerCard from "./PlayerCard.svelte";
  import PlayerDetail from "./PlayerDetail.svelte";

  let filter = $state("");
  const selected = $derived(router.param);
  const list = $derived(
    live.players.filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()) || p.uuid.startsWith(filter.toLowerCase())),
  );
  const online = $derived(list.filter((p) => p.online));
  const offline = $derived(list.filter((p) => !p.online));
</script>

<div class="layout" class:has-detail={!!selected}>
  <aside class="list">
    <input class="search" type="search" placeholder="Spieler suchen …" bind:value={filter} />
    {#if live.players.length === 0}
      <div class="panel muted">Noch keine Spieler gesehen.</div>
    {/if}
    {#if online.length}
      <h3>Online ({online.length})</h3>
      {#each online as p (p.uuid)}
        <PlayerCard {p} active={p.uuid === selected} onselect={() => router.go("players", p.uuid)} />
      {/each}
    {/if}
    {#if offline.length}
      <h3>Offline ({offline.length})</h3>
      {#each offline as p (p.uuid)}
        <PlayerCard {p} active={p.uuid === selected} onselect={() => router.go("players", p.uuid)} />
      {/each}
    {/if}
  </aside>
  <section class="main">
    {#if selected}
      {#key selected}
        <PlayerDetail uuid={selected} onback={() => router.go("players")} />
      {/key}
    {:else}
      <div class="panel muted hint">Wähle links einen Spieler aus, um Position, Werte und Inventar zu sehen.</div>
    {/if}
  </section>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }
  .search {
    width: 100%;
    margin-bottom: 10px;
  }
  h3 {
    margin: 10px 2px 8px;
  }
  @media (max-width: 860px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .layout.has-detail .list {
      display: none;
    }
    .layout:not(.has-detail) .main {
      display: none;
    }
  }
  @media (min-width: 861px) {
    :global(.detail .back) {
      display: none;
    }
    .list {
      position: sticky;
      top: 76px;
      max-height: calc(100vh - 96px);
      overflow-y: auto;
    }
  }
</style>
