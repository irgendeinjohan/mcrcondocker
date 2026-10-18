<script lang="ts">
  import type { Item, PlayerData } from "../../shared/types";
  import ItemSlot from "./ItemSlot.svelte";

  let { data }: { data: PlayerData } = $props();

  function bySlot(list: Item[] | null, from: number, count: number): (Item | null)[] {
    const out: (Item | null)[] = Array.from({ length: count }, () => null);
    for (const it of list ?? []) {
      const i = it.slot - from;
      if (i >= 0 && i < count) out[i] = it;
    }
    return out;
  }

  const main = $derived(bySlot(data.inventory, 9, 27));
  const hotbar = $derived(bySlot(data.inventory, 0, 9));
  const ender = $derived(data.enderChest ? bySlot(data.enderChest, 0, 27) : null);
</script>

<div class="inv">
  <div class="mc-grid top">
    <div class="armor">
      <div class="mc-label">Rüstung</div>
      <ItemSlot item={data.armor.head} placeholder="Kopf" />
      <ItemSlot item={data.armor.chest} placeholder="Brust" />
      <ItemSlot item={data.armor.legs} placeholder="Beine" />
      <ItemSlot item={data.armor.feet} placeholder="Füße" />
    </div>
    <div class="offhand">
      <div class="mc-label">Offhand</div>
      <ItemSlot item={data.offhand} placeholder="Off" />
    </div>
  </div>

  <div class="mc-grid">
    <div class="mc-label">Inventar</div>
    <div class="rows">
      {#each main as it, i (i)}<ItemSlot item={it} />{/each}
    </div>
    <div class="gap"></div>
    <div class="rows">
      {#each hotbar as it, i (i)}<ItemSlot item={it} selected={i === data.selectedSlot} />{/each}
    </div>
  </div>

  <div class="mc-grid">
    <div class="mc-label">Enderkiste</div>
    {#if ender}
      <div class="rows">
        {#each ender as it, i (i)}<ItemSlot item={it} />{/each}
      </div>
    {:else}
      <div class="mc-label" style="font-weight:400">nicht verfügbar</div>
    {/if}
  </div>
</div>

<style>
  .inv {
    --slot-size: clamp(30px, calc((100vw - 64px) / 9), 42px);
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-start;
  }
  .rows {
    display: grid;
    grid-template-columns: repeat(9, var(--slot-size));
  }
  .gap {
    height: 8px;
  }
  .top {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .armor,
  .offhand {
    display: flex;
    flex-direction: column;
  }
</style>
