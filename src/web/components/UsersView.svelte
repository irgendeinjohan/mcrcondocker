<script lang="ts">
  import BackupsPanel from "./BackupsPanel.svelte";
  import { api } from "../lib/api";
  import { t } from "../lib/i18n.svelte";
  import type { DashboardUser, UserRole } from "../../shared/users";
  let users = $state<DashboardUser[]>([]);
  let username = $state("");
  let password = $state("");
  let role = $state<UserRole>("viewer");
  let passwords = $state<Record<number, string>>({});
  let error = $state("");
  let busy = $state(false);
  async function load() { try { users = await api.users(); } catch (e) { error = (e as Error).message; } }
  $effect(() => { void load(); });
  async function create() {
    busy = true; error = "";
    try { await api.createUser(username, password, role); username = ""; password = ""; await load(); }
    catch (e) { error = (e as Error).message; }
    finally { busy = false; }
  }
  async function save(user: DashboardUser) {
    busy = true; error = "";
    try { await api.updateUser(user.id, user.role, user.enabled, passwords[user.id]); passwords[user.id] = ""; await load(); }
    catch (e) { error = (e as Error).message; await load(); }
    finally { busy = false; }
  }
</script>
<section class="panel">
  <h2>{t("Benutzer")}</h2>
  <p class="muted">{t("Betrachter sehen Spieler, Inventare, Karte und Online-Zeiten. Operatoren dürfen den Server verwalten.")}</p>
  {#if error}<p role="alert" class="err">{t(error)}</p>{/if}
  <form onsubmit={(e) => { e.preventDefault(); void create(); }}>
    <label>{t("Benutzername")}<input bind:value={username} autocomplete="off" pattern={"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,39}"} maxlength="40" required /></label>
    <label>{t("Passwort")}<input type="password" bind:value={password} autocomplete="new-password" minlength="8" required /></label>
    <label>{t("Rolle")}<select bind:value={role}><option value="viewer">{t("Betrachter")}</option><option value="operator">{t("Operator")}</option></select></label>
    <button class="btn primary" type="submit" disabled={busy}>{t("Benutzer erstellen")}</button>
  </form>
  <div class="users">
    {#each users as user (user.id)}
      <form class="user" onsubmit={(e) => { e.preventDefault(); void save(user); }}>
        <strong>{user.username}</strong>
        {#if user.bootstrap}
          <span class="muted">{t("Administratorkonto: Passwort über DASHBOARD_PASSWORD ändern")}</span>
        {:else}
          <label>{t("Rolle")}<select bind:value={user.role}><option value="viewer">{t("Betrachter")}</option><option value="operator">{t("Operator")}</option></select></label>
          <label class="enabled"><input type="checkbox" bind:checked={user.enabled} />{t("Aktiv")}</label>
          <label>{t("Neues Passwort (optional)")}<input type="password" bind:value={passwords[user.id]} autocomplete="new-password" minlength="8" /></label>
          <button class="btn small" disabled={busy}>{t("Speichern")}</button>
        {/if}
      </form>
    {/each}
  </div>
  <p class="faint">{t("Änderungen an Passwort, Rolle oder Aktivierung beenden die Sitzungen dieses Benutzers.")}</p>
</section>
<BackupsPanel />
<style>
  section { max-width: 1050px; }
  form { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  input { max-width: 100%; }
  .enabled { flex-direction: row; align-items: center; align-self: center; }
  .users { margin-top: 20px; }
  .user { border-top: 1px solid var(--border); padding: 16px 0; }
  strong { align-self: center; min-width: 100px; }
  .err { color: var(--error); }
</style>
