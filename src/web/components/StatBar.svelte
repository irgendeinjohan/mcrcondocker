<script lang="ts">
  // Herzen bzw. Hunger als 10 Symbole (je 2 Punkte), wie im Spiel
  let { value, max = 20, kind }: { value: number; max?: number; kind: "health" | "food" } = $props();
  const icons = $derived(Math.max(1, Math.ceil(max / 2)));
  const label = $derived(kind === "health" ? "Leben" : "Hunger");
  function fill(i: number): "full" | "half" | "empty" {
    const v = value - i * 2;
    return v >= 2 ? "full" : v >= 1 ? "half" : "empty";
  }
</script>

<div class="bar" title={`${label}: ${Math.round(value * 10) / 10} / ${max}`} aria-label={`${label} ${Math.round(value * 10) / 10} von ${max}`}>
  {#each Array.from({ length: Math.min(icons, 20) }) as _, i (i)}
    <span class="ic {kind} {fill(i)}">{kind === "health" ? "♥" : "🍗"}</span>
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
  .ic {
    font-size: 15px;
    width: 15px;
    text-align: center;
  }
  .health.full {
    color: #e5332a;
  }
  .health.half {
    background: linear-gradient(90deg, #e5332a 50%, #4a1d1d 50%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .health.empty {
    color: #4a1d1d;
  }
  .food.empty {
    filter: grayscale(1) brightness(0.4);
  }
  .food.half {
    filter: saturate(0.6) brightness(0.8);
  }
  .food {
    font-size: 12px;
  }
  .num {
    margin-left: 6px;
    font-size: 12px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
</style>
