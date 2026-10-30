<script lang="ts">
  import { api } from "../lib/api";
  import { dateTime } from "../lib/format";
  import { t } from "../lib/i18n.svelte";
  let backups = $state<Awaited<ReturnType<typeof api.backups>>>([]);
  let busy = $state(false);
  let error = $state("");
  async function load() { try { backups = await api.backups(); } catch (e) { error = (e as Error).message; } }
  $effect(() => { void load(); });
  async function create() {
    busy = true; error = "";
    try { await api.createBackup(); await load(); } catch (e) { error = (e as Error).message; } finally { busy = false; }
  }
</script>
<section class="panel">
  <h2>{t("Datenbanksicherungen")}</h2>
  <p class="muted">{t("Sicherungen werden mit SQLite erstellt und geprüft. Sie enthalten auch Benutzer und Einstellungen.")}</p>
  <button class="btn" disabled={busy} onclick={create}>{busy ? t("Sicherung läuft …") : t("Sicherung erstellen")}</button>
  {#if error}<p class="error" role="alert">{t(error)}</p>{/if}
  <ul>
    {#each backups as backup (backup.name)}
      <li><span>{dateTime(backup.createdAt)} · {Math.ceil(backup.bytes / 1024)} KiB</span> <a href={`/api/backups/${backup.name}`} download>{t("Herunterladen")}</a></li>
    {:else}<li class="muted">{t("Noch keine Sicherungen.")}</li>{/each}
  </ul>
  <p class="faint">{t("Die Wiederherstellung erfolgt bei gestopptem Dashboard über das Backup-Werkzeug. Sie ersetzt niemals eine vorhandene Datei.")}</p>
</section>
<style>
  section { max-width: 1050px; margin-top: 16px; }
  li { display: flex; flex-wrap: wrap; gap: 12px; padding: 5px 0; }
  ul { list-style: none; padding: 0; }
  .error { color: var(--error); }
</style>
