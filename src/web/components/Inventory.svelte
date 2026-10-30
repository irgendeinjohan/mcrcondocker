<script lang="ts">
  import { t as tr } from "../lib/i18n.svelte";
  import { live } from "../lib/live.svelte";
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

{#if live.assets && !live.assets.textures}
  <p class="muted">{tr("Keine Texturen installiert. Für korrekte Inventarsymbole: npm run assets:download.")}</p>
{/if}
<div class="inv">
  <div class="mc-grid top">
    <div class="armor">
      <div class="mc-label">{tr("Rüstung")}</div>
      <ItemSlot item={data.armor.head} equipment="head" placeholder={tr("Kopf")} />
      <ItemSlot item={data.armor.chest} equipment="chest" placeholder={tr("Brust")} />
      <ItemSlot item={data.armor.legs} equipment="legs" placeholder={tr("Beine")} />
      <ItemSlot item={data.armor.feet} equipment="feet" placeholder={tr("Füße")} />
    </div>
    <div class="offhand">
      <div class="mc-label">Offhand</div>
      <ItemSlot item={data.offhand} equipment="offhand" placeholder={tr("Off")} />
    </div>
  </div>

  <div class="mc-grid">
    <div class="mc-label">{tr("Inventar")}</div>
    <div class="rows">
      {#each main as it, i (i)}<ItemSlot item={it} />{/each}
    </div>
    <div class="gap"></div>
    <div class="mc-label">{tr("Hotbar")}</div>
    <div class="rows">
      {#each hotbar as it, i (i)}<ItemSlot item={it} selected={i === data.selectedSlot} />{/each}
    </div>
  </div>

  <div class="mc-grid">
    <div class="mc-label">{tr("Enderkiste")}</div>
    {#if ender}
      <div class="rows">
        {#each ender as it, i (i)}<ItemSlot item={it} />{/each}
      </div>
    {:else}
      <div class="mc-label" style="font-weight:400">{tr("nicht verfügbar")}</div>
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
