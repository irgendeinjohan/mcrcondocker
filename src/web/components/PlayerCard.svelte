<script lang="ts">
  import type { PlayerSummary } from "../../shared/types";
  import { ago, coord, dateTime, dimColor, dimLabel } from "../lib/format";
  import { live } from "../lib/live.svelte";

  let { p, active = false, onselect }: { p: PlayerSummary; active?: boolean; onselect: () => void } = $props();
</script>

<button class="card" class:active class:offline={!p.online} onclick={onselect}>
  <div class="row1">
    <span class="dot" class:on={p.online}></span>
    <span class="name">{p.name}</span>
    {#if p.isBedrock}<span class="badge bedrock">Bedrock</span>{/if}
  </div>
  <div class="row2">
    {#if p.dimension}
      <span class="badge" style:color={dimColor(p.dimension)} style:border-color={dimColor(p.dimension)}>{dimLabel(p.dimension)}</span>
    {/if}
    {#if p.pos}
      <span class="mono coords">{coord(p.pos.x)} / {coord(p.pos.y)} / {coord(p.pos.z)}</span>
    {/if}
  </div>
  <div class="row3 muted">
    {#if p.online}
      {#if p.health !== null}<span>♥ {Math.round(p.health * 10) / 10}</span>{/if}
      {#if p.food !== null}<span>🍗 {p.food}</span>{/if}
      {#if p.xpLevel !== null}<span>Lvl {p.xpLevel}</span>{/if}
    {:else}
      <span title={dateTime(p.lastSeen)}>zuletzt gesehen {ago(p.lastSeen, live.now)}</span>
    {/if}
  </div>
</button>

<style>
  .card {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 12px;
    margin: 0 0 8px;
  }
  .card:hover {
    background: var(--panel-2);
  }
  .card.active {
    border-color: var(--accent);
    background: #1f2a22;
  }
  .card.offline .name {
    color: var(--text-dim);
  }
  .row1 {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 5px;
    flex-wrap: wrap;
  }
  .coords {
    font-size: 13px;
    color: var(--text-dim);
  }
  .row3 {
    display: flex;
    gap: 12px;
    margin-top: 4px;
    font-size: 13px;
  }
</style>
