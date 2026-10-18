<script lang="ts">
  import type { TextSegment } from "../../shared/mctext";

  let { segments, fallbackColor }: { segments: TextSegment[]; fallbackColor?: string } = $props();
</script>

{#each segments as s, i (i)}<span
    class:b={s.bold}
    class:i={s.italic}
    class:u={s.underlined}
    class:st={s.strikethrough}
    class:ob={s.obfuscated}
    style:color={s.color ?? fallbackColor}>{s.text}</span
  >{/each}

<style>
  .b {
    font-weight: 700;
  }
  .i {
    font-style: italic;
  }
  .u {
    text-decoration: underline;
  }
  .st {
    text-decoration: line-through;
  }
  .u.st {
    text-decoration: underline line-through;
  }
  .ob {
    filter: blur(2px);
  }
</style>
