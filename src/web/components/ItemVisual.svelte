<script lang="ts">
  import type { Item } from "../../shared/types";
  import { live } from "../lib/live.svelte";
  import { needsRendering, renderIcon } from "../lib/rendering";
  let { item, onerror = () => {} }: { item: Pick<Item, "id" | "appearance" | "glint">; onerror?: () => void } = $props();
  const fallback = $derived(`/api/icon/${encodeURIComponent(item.id)}`);
  let rendered = $state("");
  $effect(() => {
    const current = item;
    const index = live.renderer;
    let cancelled = false;
    rendered = "";
    if (index && needsRendering(current, index)) {
      void renderIcon(current, index).then((url) => { if (!cancelled) rendered = url; }).catch(() => { /* Keep the base icon if WebGL or a model is unavailable. */ });
    }
    return () => { cancelled = true; };
  });
</script>
<img class="stack-icon" src={rendered || fallback} data-rendered={rendered ? "true" : undefined} alt="" draggable="false" onerror={() => { if (rendered) rendered = ""; else onerror(); }} />
<style>
  img { width: 80%; height: 80%; object-fit: contain; image-rendering: pixelated; pointer-events: none; }
</style>
