<script lang="ts">
  let { item, gui, size = 20 }: { item?: string; gui?: string; size?: number } = $props();
  let failed = $state(false);
  const src = $derived(gui ? `/api/gui/${encodeURIComponent(gui)}` : `/api/icon/${encodeURIComponent(item ?? "minecraft:barrier")}`);
  $effect(() => { void src; failed = false; });
</script>
<span class="minecraft-icon" style:width={`${size}px`} style:height={`${size}px`} aria-hidden="true">
  {#if !failed}<img {src} alt="" draggable="false" onerror={() => (failed = true)} />{:else}<span class="missing">?</span>{/if}
</span>
<style>
  .minecraft-icon { display: inline-flex; flex: none; align-items: center; justify-content: center; vertical-align: middle; }
  img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
  .missing { color: var(--text-faint); font-size: 10px; }
</style>
