<script lang="ts">
  import { t as tr } from "../lib/i18n.svelte";
  import MinecraftIcon from "./MinecraftIcon.svelte";
  // Herzen bzw. Hunger als 10 Symbole (je 2 Punkte), wie im Spiel
  let { value, max = 20, kind }: { value: number; max?: number; kind: "health" | "food" } = $props();
  const icons = $derived(Math.max(1, Math.ceil(max / 2)));
  const label = $derived(kind === "health" ? tr("Leben") : tr("Hunger"));
  function fill(i: number): "full" | "half" | "empty" {
    const v = value - i * 2;
    return v >= 2 ? "full" : v >= 1 ? "half" : "empty";
  }
</script>

<div class="bar" title={`${label}: ${Math.round(value * 10) / 10} / ${max}`} aria-label={`${label} ${tr("{value} von {max}", { value: Math.round(value * 10) / 10, max })}`}>
  {#each Array.from({ length: Math.min(icons, 20) }) as _, i (i)}
    <span class="ic">
      {#if kind === "health" && fill(i) !== "empty"}
        <span class="background"><MinecraftIcon gui="health_empty" size={18} /></span>
      {/if}
      <MinecraftIcon gui={`${kind}_${fill(i)}`} size={18} />
    </span>
  {/each}
  <span class="num">{Math.round(value * 10) / 10}</span>
</div>

<style>
  .bar {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1px;
    line-height: 1;
  }
  .ic { position: relative; width: 18px; height: 18px; display: inline-flex; }
  .background { position: absolute; inset: 0; }
  .ic > :global(.minecraft-icon) { position: relative; }
  .num {
    margin-left: 6px;
    font-size: 12px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
</style>
