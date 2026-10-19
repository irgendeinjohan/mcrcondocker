<script lang="ts">
  import { router } from "../lib/router.svelte";
  import AuditLog from "./world/AuditLog.svelte";
  import BansPanel from "./world/BansPanel.svelte";
  import MessagesPanel from "./world/MessagesPanel.svelte";
  import WorldSettings from "./world/WorldSettings.svelte";

  const tabs = [
    { id: "welt", label: "Welt" },
    { id: "nachrichten", label: "Nachrichten" },
    { id: "banns", label: "Bann-Liste" },
    { id: "protokoll", label: "Protokoll" },
  ];
  const tab = $derived(tabs.some((t) => t.id === router.param) ? router.param! : "welt");
</script>

<div class="world">
  <div class="tabs" role="tablist">
    {#each tabs as t (t.id)}
      <button role="tab" class="tab" class:active={tab === t.id} aria-selected={tab === t.id} onclick={() => router.go("world", t.id)}>
        {t.label}
      </button>
    {/each}
  </div>
  {#if tab === "welt"}
    <WorldSettings />
  {:else if tab === "nachrichten"}
    <MessagesPanel />
  {:else if tab === "banns"}
    <BansPanel />
  {:else}
    <AuditLog />
  {/if}
</div>

<style>
  .world {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 1000px;
  }
  .tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .tab {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 12px;
  }
  .tab.active {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
