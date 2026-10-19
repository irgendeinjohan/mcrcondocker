<script lang="ts">
  import { parseLegacy } from "../../shared/mctext";
  import { actions } from "../lib/actions.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import McText from "./McText.svelte";
</script>

<ConfirmDialog
  open={!!actions.confirm}
  title="Aktion bestätigen"
  message={actions.confirm ? `${actions.confirm.reason} Wirklich ausführen?` : ""}
  detail={actions.confirm?.label ?? ""}
  onconfirm={() => actions.answer(true)}
  oncancel={() => actions.answer(false)}
/>

<div class="toasts" aria-live="polite">
  {#each actions.toasts as t (t.id)}
    <button class="toast" class:err={!t.ok} onclick={() => actions.dismiss(t.id)} title="Schließen">
      <div class="t">{t.ok ? "✓" : "✕"} {t.title}</div>
      {#if t.detail}<div class="d mono"><McText segments={parseLegacy(t.detail)} /></div>{/if}
    </button>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: calc(16px + var(--safe-right));
    bottom: calc(16px + var(--safe-bottom));
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: min(420px, calc(100vw - 32px));
  }
  .toast {
    text-align: left;
    background: var(--panel);
    border: 1px solid var(--accent);
    border-left-width: 4px;
    border-radius: 8px;
    padding: 9px 12px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  }
  .toast.err {
    border-color: var(--error);
  }
  .t {
    font-weight: 600;
    word-break: break-word;
  }
  .d {
    margin-top: 3px;
    font-size: 12px;
    color: var(--text-dim);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 120px;
    overflow: hidden;
  }
  @media (max-width: 720px) {
    .toasts {
      bottom: calc(80px + var(--safe-bottom));
      left: calc(10px + var(--safe-left));
      right: calc(10px + var(--safe-right));
      max-width: none;
    }
  }
</style>
