<script lang="ts">
  import type { Item } from "../../shared/types";
  import { roman } from "../lib/format";
  import { tooltip } from "../lib/tooltip.svelte";
  import McText from "./McText.svelte";
  import ItemSlot from "./ItemSlot.svelte";

  let el = $state<HTMLDivElement | undefined>();
  let pos = $state({ left: 0, top: 0 });

  // Position am Bildschirmrand halten
  $effect(() => {
    if (!tooltip.item || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = tooltip.pinned ? tooltip.x - w / 2 : tooltip.x + 16;
    let top = tooltip.pinned ? tooltip.y + 8 : tooltip.y + 16;
    if (left + w > vw - 8) left = tooltip.pinned ? vw - w - 8 : tooltip.x - w - 16;
    if (left < 8) left = 8;
    if (top + h > vh - 8) top = Math.max(8, (tooltip.pinned ? tooltip.y - 48 : tooltip.y) - h - 8);
    pos = { left, top };
  });

  function rows(item: Item): (Item | null)[] {
    const size = item.containerSize ?? Math.max(item.contents?.length ?? 0, 1);
    const out: (Item | null)[] = Array.from({ length: size }, () => null);
    for (const c of item.contents ?? []) if (c.slot >= 0 && c.slot < size) out[c.slot] = c;
    return out;
  }

  function onWindowClick(e: MouseEvent) {
    if (tooltip.pinned && el && !el.contains(e.target as Node)) tooltip.close();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") tooltip.close();
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKey} />

{#if tooltip.item}
  {@const it = tooltip.item}
  <div
    class="tt"
    class:pinned={tooltip.pinned}
    bind:this={el}
    style:left={`${pos.left}px`}
    style:top={`${pos.top}px`}
    role="tooltip"
  >
    <div class="name" class:custom={it.hasCustomName}>
      <McText segments={it.name} fallbackColor={it.glint ? "#55ffff" : "#ffffff"} />
      {#if it.count > 1}<span class="cnt">× {it.count}</span>{/if}
    </div>
    {#each it.enchantments as e (e.id)}
      <div class="ench">{e.name} {roman(e.level)}</div>
    {/each}
    {#each it.storedEnchantments as e (e.id)}
      <div class="ench stored">{e.name} {roman(e.level)}</div>
    {/each}
    {#each it.details as d, i (i)}
      <div class="detail">{d}</div>
    {/each}
    {#if it.lore}
      {#each it.lore as line, i (i)}
        <div class="lore"><McText segments={line} /></div>
      {/each}
    {/if}
    {#if it.contents && it.contents.length > 0}
      <div class="contents" style:--slot-size="26px">
        {#each rows(it) as c, i (i)}
          <div class="c-slot"><ItemSlot item={c} /></div>
        {/each}
      </div>
    {:else if it.containerSize}
      <div class="detail">leer</div>
    {/if}
    {#if it.unbreakable}<div class="info">Unzerbrechlich</div>{/if}
    {#if it.maxDamage}
      <div class="info">Haltbarkeit: {it.maxDamage - (it.damage ?? 0)} / {it.maxDamage}</div>
    {:else if it.damage}
      <div class="info">Schaden: {it.damage}</div>
    {/if}
    <div class="id">{it.id}</div>
    {#if tooltip.pinned}
      <button class="close" onclick={() => tooltip.close()} aria-label="Schließen">×</button>
    {/if}
  </div>
{/if}

<style>
  .tt {
    position: fixed;
    z-index: 1000;
    max-width: min(340px, calc(100vw - 16px));
    background: rgba(16, 0, 16, 0.94);
    border: 2px solid #2b0a5c;
    outline: 1px solid #120018;
    border-radius: 4px;
    padding: 6px 9px 7px;
    color: #fff;
    font-size: 14px;
    line-height: 1.35;
    pointer-events: none;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  }
  .tt.pinned {
    pointer-events: auto;
    padding-right: 28px;
  }
  .name {
    font-weight: 600;
    word-break: break-word;
  }
  .cnt {
    color: #aaa;
    font-weight: 400;
    margin-left: 4px;
  }
  .ench {
    color: #aaaaaa;
  }
  .ench.stored {
    color: #ffff55;
  }
  .detail {
    color: #aaaaaa;
  }
  .lore {
    color: #aa00aa;
  }
  .info {
    color: #e0e0e0;
    margin-top: 2px;
  }
  .id {
    color: #555555;
    font-size: 12px;
    margin-top: 3px;
    font-family: var(--mono);
  }
  .contents {
    display: grid;
    grid-template-columns: repeat(9, 26px);
    margin: 6px 0 2px;
    background: #c6c6c6;
    padding: 3px;
    width: max-content;
  }
  .close {
    position: absolute;
    right: 4px;
    top: 2px;
    background: none;
    border: none;
    color: #bbb;
    font-size: 20px;
    line-height: 1;
    padding: 2px 6px;
  }
</style>
