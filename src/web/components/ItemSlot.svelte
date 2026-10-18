<script lang="ts">
  import type { Item } from "../../shared/types";
  import { live } from "../lib/live.svelte";
  import { durabilityColor, materialColor, shortName } from "../lib/items";
  import { tooltip } from "../lib/tooltip.svelte";

  let {
    item,
    selected = false,
    placeholder = "",
  }: { item: Item | null | undefined; selected?: boolean; placeholder?: string } = $props();

  let imgFailed = $state(false);
  const showImg = $derived(!!item && !!live.assets?.textures && !imgFailed);
  const dur = $derived(
    item && item.maxDamage && item.damage && item.damage > 0 ? (item.maxDamage - item.damage) / item.maxDamage : null,
  );

  $effect(() => {
    // bei Itemwechsel erneut versuchen
    void item?.id;
    imgFailed = false;
  });

  function onEnter(e: PointerEvent) {
    if (item && e.pointerType === "mouse") tooltip.hover(item, e.clientX, e.clientY);
  }
  function onMove(e: PointerEvent) {
    if (e.pointerType === "mouse") tooltip.move(e.clientX, e.clientY);
  }
  function onLeave(e: PointerEvent) {
    if (e.pointerType === "mouse") tooltip.leave();
  }
  function onClick(e: MouseEvent) {
    if (!item) return;
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tooltip.pin(item, r.left + r.width / 2, r.bottom);
  }
</script>

<button
  type="button"
  class="slot"
  class:selected
  class:empty={!item}
  aria-label={item ? `${item.name.map((s) => s.text).join("")}${item.count > 1 ? `, ${item.count} Stück` : ""}` : placeholder || "leer"}
  onpointerenter={onEnter}
  onpointermove={onMove}
  onpointerleave={onLeave}
  onclick={onClick}
>
  {#if item}
    {#if showImg}
      <img src={`/api/icon/${encodeURIComponent(item.id)}`} alt="" draggable="false" onerror={() => (imgFailed = true)} />
    {:else}
      <span class="tile" style:--c={materialColor(item.id)}>{shortName(item.id)}</span>
    {/if}
    {#if item.glint}<span class="glint"></span>{/if}
    {#if item.count > 1}<span class="count">{item.count}</span>{/if}
    {#if dur !== null}
      <span class="dur"><span style:width={`${Math.max(4, dur * 100)}%`} style:background={durabilityColor(dur)}></span></span>
    {/if}
  {:else if placeholder}
    <span class="ph">{placeholder}</span>
  {/if}
</button>

<style>
  .slot {
    --s: var(--slot-size, 40px);
    position: relative;
    width: var(--s);
    height: var(--s);
    padding: 0;
    margin: 0;
    border: none;
    background: #8b8b8b;
    box-shadow:
      inset 2px 2px 0 #373737,
      inset -2px -2px 0 #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    cursor: default;
  }
  .slot:not(.empty) {
    cursor: pointer;
  }
  .slot:not(.empty):hover {
    background: #a5a5a5;
  }
  .slot.selected {
    outline: 3px solid #fff;
    outline-offset: -3px;
    z-index: 1;
  }
  img {
    width: 80%;
    height: 80%;
    object-fit: cover;
    object-position: top;
    image-rendering: pixelated;
    pointer-events: none;
  }
  .tile {
    width: 84%;
    height: 84%;
    border-radius: 4px;
    background: var(--c);
    color: #fff;
    font-size: calc(var(--s) * 0.27);
    font-weight: 800;
    letter-spacing: -0.02em;
    display: flex;
    align-items: center;
    justify-content: center;
    text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.7);
    box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.25);
    pointer-events: none;
    overflow: hidden;
  }
  .count {
    position: absolute;
    right: 2px;
    bottom: 0;
    color: #fff;
    font-weight: 700;
    font-size: calc(var(--s) * 0.34);
    text-shadow: 2px 2px 0 #3f3f3f;
    pointer-events: none;
    line-height: 1.1;
  }
  .dur {
    position: absolute;
    left: 12%;
    right: 12%;
    bottom: 9%;
    height: 3px;
    background: #000;
    pointer-events: none;
  }
  .dur span {
    display: block;
    height: 2px;
  }
  .glint {
    position: absolute;
    inset: 3px;
    pointer-events: none;
    background: linear-gradient(115deg, transparent 30%, rgba(200, 140, 255, 0.55) 45%, transparent 60%);
    background-size: 250% 250%;
    mix-blend-mode: screen;
    animation: glint 3s linear infinite;
  }
  .ph {
    color: #5e5e5e;
    font-size: calc(var(--s) * 0.24);
    font-weight: 700;
    pointer-events: none;
  }
  @keyframes glint {
    from {
      background-position: 120% 0;
    }
    to {
      background-position: -120% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .glint {
      animation: none;
    }
  }
</style>
