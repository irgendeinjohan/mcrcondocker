<script lang="ts">
  import { session } from "../lib/session.svelte";
  import { normalizeBlueMapUrl } from "../../shared/bluemap";
  import { api } from "../lib/api";
  import { t } from "../lib/i18n.svelte";

  let url = $state<string | null>(null);
  let draft = $state("");
  let mode = $state<"coordinates" | "bluemap">("coordinates");
  let editing = $state(false);
  let loaded = $state(false);
  let busy = $state(false);
  let error = $state("");
  let revision = $state(0);

  $effect(() => {
    void api.blueMap().then((settings) => {
      url = settings.url;
      draft = url ?? "";
      let preferred = "bluemap";
      try { preferred = localStorage.getItem("mcdash.map.provider") ?? preferred; } catch { /* optional */ }
      mode = url && preferred === "bluemap" ? "bluemap" : "coordinates";
      loaded = true;
    }).catch((e: Error) => { error = e.message; });
  });

  function choose(next: "coordinates" | "bluemap") {
    mode = next;
    try { localStorage.setItem("mcdash.map.provider", next); } catch { /* optional */ }
  }

  async function save(remove = false) {
    busy = true;
    error = "";
    try {
      const next = normalizeBlueMapUrl(remove ? null : draft.trim());
      if (next && location.protocol === "https:" && new URL(next).protocol !== "https:") {
        throw new Error(t("Bitte für BlueMap HTTPS verwenden."));
      }
      const result = await api.setBlueMap(next);
      url = result.url;
      draft = url ?? "";
      revision++;
      choose(url ? "bluemap" : "coordinates");
      editing = false;
    } catch (e) { error = t((e as Error).message); }
    finally { busy = false; }
  }
</script>

<section class="bluemap" class:active={mode === "bluemap" && !!url}>
  <div class="providers">
    <button class="btn small" class:primary={mode === "coordinates"} aria-pressed={mode === "coordinates"} onclick={() => choose("coordinates")}>{t("Koordinatenkarte")}</button>
    {#if url}<button class="btn small" class:primary={mode === "bluemap"} aria-pressed={mode === "bluemap"} onclick={() => choose("bluemap")}>BlueMap</button>{/if}
    {#if session.operator}<button class="btn small" disabled={!loaded} aria-expanded={editing} onclick={() => { editing = !editing; draft = url ?? ""; }}>{t("BlueMap einrichten")}</button>{/if}
    {#if url}<a class="btn small" href={url} target="_blank" rel="noopener noreferrer">{t("BlueMap öffnen")} ↗</a>{/if}
  </div>
  {#if editing}
    <form class="panel" onsubmit={(e) => { e.preventDefault(); void save(); }}>
      <p class="muted">{t("BlueMap zeigt eine separat gehostete Karte. Trage die im Browser erreichbare URL ein.")}</p>
      <label for="bluemap-url">{t("BlueMap-URL")}</label>
      <div class="fields">
        <input id="bluemap-url" type="url" placeholder="https://map.example.com/" bind:value={draft} required maxlength="2048" />
        <button class="btn primary" type="submit" disabled={busy}>{t("Speichern")}</button>
        {#if url}<button class="btn danger" type="button" disabled={busy} onclick={() => save(true)}>{t("BlueMap entfernen")}</button>{/if}
      </div>
      <p class="faint">{t("BlueMap muss Einbettung erlauben. Bei HTTPS muss auch BlueMap HTTPS verwenden.")}</p>
    </form>
  {/if}
  {#if error}<p role="alert" class="error">{t(error)}</p>{/if}
  {#if mode === "bluemap" && url}
    <iframe src={`/api/bluemap/view?v=${revision}`} title="BlueMap" referrerpolicy="no-referrer" allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-downloads"></iframe>
    <p class="faint">{t("BlueMap konnte nicht geladen werden? In neuem Tab öffnen oder URL prüfen.")}</p>
  {/if}
</section>

<style>
  .providers, .fields { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .bluemap { margin-bottom: 12px; }
  .bluemap.active + :global(.map-view) { display: none; }
  .panel { margin-top: 12px; }
  input { flex: 1; min-width: min(100%, 240px); }
  iframe { width: 100%; height: max(420px, calc(100dvh - 260px)); border: 1px solid var(--border); border-radius: var(--radius); margin-top: 12px; background: #131813; }
  p { margin: 8px 0; font-size: 13px; }
  .error { color: var(--error); }
</style>
