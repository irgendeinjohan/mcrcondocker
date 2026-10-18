<script lang="ts">
  import { api } from "../lib/api";

  let { onlogin, mock = false }: { onlogin: () => void; mock?: boolean } = $props();
  let password = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    if (!password || busy) return;
    busy = true;
    error = null;
    try {
      await api.login(password);
      password = "";
      onlogin();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="login">
  <form class="panel" onsubmit={submit}>
    <img src="/icons/icon.svg" alt="" width="56" height="56" />
    <h1>MC-Dashboard</h1>
    <label for="pw" class="muted">Passwort</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="pw" type="password" bind:value={password} autocomplete="current-password" autofocus required />
    {#if error}<div class="err" role="alert">{error}</div>{/if}
    <button class="btn primary" type="submit" disabled={busy || !password}>{busy ? "Prüfe …" : "Anmelden"}</button>
    {#if mock}<div class="faint hint">Mock-Modus: Passwort „mock“ (falls nicht anders gesetzt)</div>{/if}
  </form>
</div>

<style>
  .login {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  form {
    width: min(360px, 100%);
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
    text-align: center;
    padding: 28px 24px;
  }
  img {
    align-self: center;
  }
  h1 {
    font-size: 22px;
    margin-bottom: 8px;
  }
  label {
    text-align: left;
    font-size: 13px;
  }
  input {
    font-size: 16px;
  }
  .err {
    color: var(--error);
    font-size: 14px;
  }
  .btn {
    justify-content: center;
    margin-top: 6px;
  }
  .hint {
    font-size: 12px;
  }
</style>
