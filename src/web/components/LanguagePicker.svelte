<script lang="ts">
  import { language, LOCALES, t } from "../lib/i18n.svelte";
</script>
<label class="language">
  <span>{t("Sprache")}</span>
  <select aria-label={t("Sprache")} value={language.locale} onchange={(e) => language.set(e.currentTarget.value)}>
    {#each Object.entries(LOCALES) as [value, label] (value)}
      <option {value}>{label}</option>
    {/each}
  </select>
</label>
<style>
  .language { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; }
  select { padding: 4px 6px; }
  @media (max-width: 720px) { .language span { display: none; } }
</style>
