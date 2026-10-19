<script lang="ts">
  import { GAMERULES } from "../../../shared/gamerules";
  import type { Difficulty, GameruleState, TimePreset, WeatherKind, WorldState } from "../../../shared/types";
  import { actions } from "../../lib/actions.svelte";
  import { api } from "../../lib/api";

  let world = $state<WorldState | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let numbers = $state<Record<string, string>>({});
  let spawn = $state({ x: "", y: "", z: "" });

  const busy = $derived(actions.busy > 0 || loading);

  async function load() {
    loading = true;
    try {
      world = await api.world();
      error = null;
      numbers = Object.fromEntries(world.gamerules.filter((g) => typeof g.value === "number").map((g) => [g.key, String(g.value)]));
      const s = world.worldSpawn;
      spawn = s ? { x: String(s.x), y: String(s.y), z: String(s.z) } : { x: "", y: "", z: "" };
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load();
  });

  /** Aktion ausführen und danach den Zustand neu lesen */
  async function run(a: Parameters<typeof actions.run>[0]) {
    const r = await actions.run(a);
    if (r) await load();
  }

  const times: { id: TimePreset; label: string; icon: string }[] = [
    { id: "morning", label: "Morgen", icon: "🌅" },
    { id: "noon", label: "Mittag", icon: "☀️" },
    { id: "evening", label: "Abend", icon: "🌇" },
    { id: "night", label: "Nacht", icon: "🌙" },
    { id: "midnight", label: "Mitternacht", icon: "🌑" },
  ];
  const weathers: { id: WeatherKind; label: string; icon: string }[] = [
    { id: "clear", label: "Klar", icon: "☀️" },
    { id: "rain", label: "Regen", icon: "🌧️" },
    { id: "thunder", label: "Gewitter", icon: "⛈️" },
  ];
  const difficulties: { id: Difficulty; label: string }[] = [
    { id: "peaceful", label: "Friedlich" },
    { id: "easy", label: "Leicht" },
    { id: "normal", label: "Normal" },
    { id: "hard", label: "Schwer" },
  ];

  /** Ticks → "13:45" (Tick 0 = 6 Uhr morgens) */
  function clock(ticks: number): string {
    const h = (Math.floor(ticks / 1000) + 6) % 24;
    const m = Math.floor(((ticks % 1000) * 60) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const rule = (key: string) => world?.gamerules.find((g) => g.key === key);
  const SPECIAL = new Set(["doDaylightCycle", "doWeatherCycle"]);
  const listed = $derived(
    GAMERULES.filter((d) => !SPECIAL.has(d.key))
      .map((d) => ({ def: d, state: rule(d.key) }))
      .filter((r): r is { def: (typeof GAMERULES)[number]; state: GameruleState } => !!r.state),
  );
  const missing = $derived(world ? GAMERULES.filter((d) => !rule(d.key)).map((d) => d.label) : []);

  const num = (s: string) => Number(s.replace(",", "."));
  const spawnValid = $derived([spawn.x, spawn.y, spawn.z].every((v) => v.trim() !== "" && Number.isFinite(num(v))));

  async function saveSpawn(clear = false) {
    try {
      const r = await api.setWorldSpawn(clear ? null : { x: num(spawn.x), y: num(spawn.y), z: num(spawn.z) });
      if (world) world.worldSpawn = r.worldSpawn;
      actions.toast(true, clear ? "Weltspawn entfernt" : "Weltspawn gespeichert");
    } catch (e) {
      actions.toast(false, "Speichern fehlgeschlagen", (e as Error).message);
    }
  }
</script>

{#if error}
  <div class="panel err">
    Weltdaten konnten nicht gelesen werden: {error}
    <button class="btn small" onclick={load}>Erneut versuchen</button>
  </div>
{/if}

{#snippet toggle(key: string)}
  {@const g = rule(key)}
  {#if g && typeof g.value === "boolean"}
    <label class="sw">
      <input type="checkbox" checked={g.value} disabled={busy} onchange={(e) => {
        const v = (e.currentTarget as HTMLInputElement).checked;
        (e.currentTarget as HTMLInputElement).checked = g.value as boolean;
        void run({ type: "gamerule", rule: g.name, value: v });
      }} />
      <span>{GAMERULES.find((d) => d.key === key)?.label}</span>
    </label>
  {/if}
{/snippet}

<div class="grid">
  <section class="panel">
    <div class="head">
      <h3>Uhrzeit</h3>
      <button class="btn small" onclick={load} disabled={loading}>{loading ? "Lade …" : "Aktualisieren"}</button>
    </div>
    <div class="big">
      {#if world?.daytime != null}
        {clock(world.daytime)} Uhr
        {#if world.day != null}<span class="faint">· Tag {world.day + 1}</span>{/if}
      {:else}
        <span class="faint">–</span>
      {/if}
    </div>
    <div class="row">
      {#each times as t (t.id)}
        <button class="btn small" disabled={busy} onclick={() => run({ type: "time", preset: t.id })}>{t.icon} {t.label}</button>
      {/each}
    </div>
    <div class="row">{@render toggle("doDaylightCycle")}</div>
  </section>

  <section class="panel">
    <h3>Wetter</h3>
    <div class="row">
      {#each weathers as w (w.id)}
        <button class="btn small" class:primary={world?.weather === w.id} disabled={busy} onclick={() => run({ type: "weather", weather: w.id })}>
          {w.icon} {w.label}
        </button>
      {/each}
    </div>
    {#if world && world.weather === null}<div class="faint small">Aktuelles Wetter konnte nicht gelesen werden.</div>{/if}
    <div class="row">{@render toggle("doWeatherCycle")}</div>
  </section>

  <section class="panel">
    <h3>Schwierigkeit</h3>
    <div class="row">
      {#each difficulties as d (d.id)}
        <button
          class="btn small"
          class:primary={world?.difficulty === d.id}
          disabled={busy || world?.difficulty === d.id}
          onclick={() => run({ type: "difficulty", difficulty: d.id })}
        >
          {d.label}
        </button>
      {/each}
    </div>
  </section>

  <section class="panel">
    <h3>Weltspawn</h3>
    <p class="faint small">
      Lässt sich über RCON nicht auslesen. Hier hinterlegt, erscheint auf jeder Spielerseite „Zum Weltspawn“.
    </p>
    <form class="row" onsubmit={(e) => { e.preventDefault(); if (spawnValid) void saveSpawn(); }}>
      <input class="c" inputmode="decimal" placeholder="X" aria-label="X" bind:value={spawn.x} />
      <input class="c" inputmode="decimal" placeholder="Y" aria-label="Y" bind:value={spawn.y} />
      <input class="c" inputmode="decimal" placeholder="Z" aria-label="Z" bind:value={spawn.z} />
      <button class="btn small" type="submit" disabled={!spawnValid}>Speichern</button>
      {#if world?.worldSpawn}<button class="btn small" type="button" onclick={() => saveSpawn(true)}>Entfernen</button>{/if}
    </form>
  </section>
</div>

<section class="panel">
  <h3>Gamerules</h3>
  {#if !world && !error}
    <div class="faint">Lade …</div>
  {/if}
  <div class="rules">
    {#each listed as { def, state } (def.key)}
      <div class="rule">
        <div class="lbl">
          <div>{def.label}</div>
          <div class="faint small">{def.hint ?? ""} <span class="mono">{state.name}</span></div>
        </div>
        {#if typeof state.value === "boolean"}
          <label class="sw">
            <input type="checkbox" checked={state.value} disabled={busy} onchange={(e) => {
              const v = (e.currentTarget as HTMLInputElement).checked;
              (e.currentTarget as HTMLInputElement).checked = state.value as boolean;
              void run({ type: "gamerule", rule: state.name, value: v });
            }} />
            <span>{state.value ? "an" : "aus"}</span>
          </label>
        {:else}
          <form class="row" onsubmit={(e) => {
            e.preventDefault();
            const v = Number(numbers[def.key]);
            if (Number.isInteger(v)) void run({ type: "gamerule", rule: state.name, value: v });
          }}>
            <input class="c" type="number" bind:value={numbers[def.key]} aria-label={def.label} />
            <button class="btn small" type="submit" disabled={busy || Number(numbers[def.key]) === state.value}>Setzen</button>
          </form>
        {/if}
      </div>
    {/each}
  </div>
  {#if missing.length}
    <div class="faint small">Vom Server nicht unterstützt: {missing.join(", ")}</div>
  {/if}
</section>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h3 {
    margin: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .big {
    font-size: 22px;
    font-weight: 600;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .small {
    font-size: 12px;
    margin: 0;
  }
  .c {
    width: 90px;
    padding: 4px 8px;
  }
  .rules {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 4px 18px;
  }
  .rule {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }
  .lbl {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .rule form {
    flex: none;
    flex-wrap: nowrap;
  }
  .sw {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .sw input {
    width: 18px;
    height: 18px;
  }
  .panel.err {
    border-color: var(--error);
    color: var(--error);
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
</style>
