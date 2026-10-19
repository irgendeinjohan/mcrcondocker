<script lang="ts" module>
  import type { ItemInfo } from "../../shared/types";
  import { api } from "../lib/api";

  // Item-Liste nur einmal pro Seitenaufruf laden
  let cache: Promise<ItemInfo[]> | null = null;
  function loadItems(): Promise<ItemInfo[]> {
    cache ??= api.items().catch(() => {
      cache = null;
      return [];
    });
    return cache;
  }
</script>

<script lang="ts">
  import { live } from "../lib/live.svelte";
  import { shortName } from "../lib/items";

  let { onpick }: { onpick: (id: string) => void } = $props();

  let items = $state<ItemInfo[]>([]);
  let query = $state("");
  let open = $state(false);
  let failedIcons = $state(new Set<string>());

  $effect(() => {
    void loadItems().then((l) => (items = l));
  });

  const textures = $derived(!!live.assets?.textures);
  const results = $derived.by(() => {
    const q = query.trim().toLowerCase().replace(/^minecraft:/, "");
    if (!q) return [];
    const starts: ItemInfo[] = [];
    const contains: ItemInfo[] = [];
    for (const it of items) {
      const n = it.name.toLowerCase();
      if (n.startsWith(q) || it.id.startsWith(q.replace(/ /g, "_"))) starts.push(it);
      else if (n.includes(q) || it.id.includes(q.replace(/ /g, "_"))) contains.push(it);
      if (starts.length >= 40) break;
    }
    return [...starts, ...contains].slice(0, 40);
  });
  /** freie Eingabe einer ID (ohne Sprachdatei oder für Mod-Items) */
  const rawId = $derived(/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(query.trim()) ? query.trim() : null);

  function pick(id: string) {
    onpick(id);
    query = items.find((i) => i.id === id)?.name ?? id;
    open = false;
  }
</script>

<div class="picker">
  <input
    type="search"
    placeholder={items.length ? "Item suchen (z. B. Fackel, diamond_sword) …" : "Item-ID, z. B. minecraft:torch"}
    bind:value={query}
    onfocus={() => (open = true)}
    oninput={() => (open = true)}
    onkeydown={(e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const first = results[0];
        if (first) pick(first.id);
        else if (rawId) pick(rawId);
      } else if (e.key === "Escape") open = false;
    }}
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    aria-label="Item"
  />
  {#if open && (results.length || rawId)}
    <div class="list" role="listbox">
      {#each results as it (it.id)}
        <button type="button" class="opt" role="option" aria-selected="false" onclick={() => pick(it.id)}>
          {#if textures && !failedIcons.has(it.id)}
            <img src={`/api/icon/${encodeURIComponent(it.id)}`} alt="" onerror={() => (failedIcons = new Set([...failedIcons, it.id]))} />
          {:else}
            <span class="ph"></span>
          {/if}
          <span class="n">{it.name}</span>
          <span class="id faint mono">{it.id}</span>
        </button>
      {/each}
      {#if !results.length && rawId}
        <button type="button" class="opt" onclick={() => pick(rawId)}>
          <span class="ph"></span>
          <span class="n">{shortName(rawId)}</span>
          <span class="id faint mono">{rawId}</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    flex: 1;
    min-width: 200px;
  }
  input {
    width: 100%;
  }
  .list {
    position: absolute;
    z-index: 30;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    max-height: 280px;
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    background: none;
    border: none;
    text-align: left;
  }
  .opt:hover,
  .opt:focus-visible {
    background: var(--panel-2);
  }
  img,
  .ph {
    width: 24px;
    height: 24px;
    image-rendering: pixelated;
    flex: none;
  }
  .ph {
    background: var(--panel-2);
    border-radius: 4px;
  }
  .n {
    flex: 1;
    min-width: 0;
  }
  .id {
    font-size: 11px;
  }
</style>
