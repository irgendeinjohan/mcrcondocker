<script lang="ts">
  let {
    open,
    title,
    message,
    detail = "",
    confirmLabel = "Ausführen",
    onconfirm,
    oncancel,
  }: {
    open: boolean;
    title: string;
    message: string;
    detail?: string;
    confirmLabel?: string;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  let dlg = $state<HTMLDialogElement | undefined>();
  $effect(() => {
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  });
</script>

<dialog bind:this={dlg} oncancel={(e) => { e.preventDefault(); oncancel(); }}>
  <h2>{title}</h2>
  <p>{message}</p>
  {#if detail}<pre class="mono">{detail}</pre>{/if}
  <div class="actions">
    <button class="btn" onclick={oncancel}>Abbrechen</button>
    <button class="btn danger" onclick={onconfirm}>{confirmLabel}</button>
  </div>
</dialog>

<style>
  dialog {
    background: var(--panel);
    color: var(--text);
    border: 1px solid var(--error);
    border-radius: 12px;
    max-width: min(480px, calc(100vw - 32px));
    padding: 18px;
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.6);
  }
  pre {
    background: var(--bg);
    padding: 8px 10px;
    border-radius: 8px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
  }
</style>
