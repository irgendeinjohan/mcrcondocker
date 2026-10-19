<script lang="ts">
  import type { GameMode, PlayerData, PlayerDetail, Vec3 } from "../../shared/types";
  import { actions } from "../lib/actions.svelte";
  import { api } from "../lib/api";
  import { coord, DIMENSIONS, dimLabel, GAME_MODES } from "../lib/format";
  import { live } from "../lib/live.svelte";
  import ItemPicker from "./ItemPicker.svelte";

  let { detail, data }: { detail: PlayerDetail; data: PlayerData | null } = $props();

  const uuid = $derived(detail.uuid);
  const online = $derived(detail.online);
  const busy = $derived(actions.busy > 0);
  const others = $derived(live.players.filter((p) => p.online && p.uuid !== uuid));
  const modes: Exclude<GameMode, "unknown">[] = ["survival", "creative", "adventure", "spectator"];

  let target = $state("");
  let tp = $state<{ x: string; y: string; z: string; dim: string }>({ x: "", y: "", z: "", dim: "minecraft:overworld" });
  let item = $state<string | null>(null);
  let count = $state(1);
  let message = $state("");
  let reason = $state("");
  let worldSpawn = $state<Vec3 | null>(null);

  $effect(() => {
    void uuid;
    api.worldSpawn().then((r) => (worldSpawn = r.worldSpawn)).catch(() => {});
  });

  // Koordinatenfelder mit der aktuellen Position vorbelegen (einmal pro Spieler)
  let prefilledFor = "";
  $effect(() => {
    if (!data || prefilledFor === uuid) return;
    prefilledFor = uuid;
    tp = { x: String(Math.floor(data.pos.x)), y: String(Math.floor(data.pos.y)), z: String(Math.floor(data.pos.z)), dim: data.dimension };
  });

  const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
  const tpValid = $derived([tp.x, tp.y, tp.z].every((v) => Number.isFinite(num(v))));

  function tpTo(dimension: string, pos: Vec3) {
    void actions.run({ type: "tp_coords", uuid, dimension, x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 });
  }
</script>

<div class="player-actions panel">
  <h3>Aktionen</h3>
  {#if !online}
    <p class="muted small">Spieler ist offline – nur Bann und Operator-Rechte sind möglich.</p>
  {/if}

  {#if online}
    <section>
      <div class="k">Spielmodus</div>
      <div class="row">
        {#each modes as m (m)}
          <button
            class="btn small"
            class:primary={data?.gameMode === m}
            disabled={busy || data?.gameMode === m}
            onclick={() => actions.run({ type: "gamemode", uuid, mode: m })}
          >
            {GAME_MODES[m]}
          </button>
        {/each}
        <button class="btn small" disabled={busy} onclick={() => actions.run({ type: "heal", uuid })}>❤ Heilen</button>
        <button class="btn small" disabled={busy} onclick={() => actions.run({ type: "feed", uuid })}>🍗 Sättigen</button>
      </div>
    </section>

    <section>
      <div class="k">Teleportieren</div>
      <div class="row">
        <select bind:value={target} aria-label="Anderer Spieler">
          <option value="">Spieler wählen …</option>
          {#each others as p (p.uuid)}
            <option value={p.uuid}>{p.name}</option>
          {/each}
        </select>
        <button class="btn small" disabled={busy || !target} onclick={() => actions.run({ type: "tp_player", uuid, target })}>Hin teleportieren</button>
        <button class="btn small" disabled={busy || !target} onclick={() => actions.run({ type: "tp_player", uuid: target, target: uuid })}>Herholen</button>
      </div>
      <form
        class="row"
        onsubmit={(e) => {
          e.preventDefault();
          if (tpValid) void actions.run({ type: "tp_coords", uuid, dimension: tp.dim, x: num(tp.x), y: num(tp.y), z: num(tp.z) });
        }}
      >
        <input class="c" inputmode="decimal" placeholder="X" aria-label="X" bind:value={tp.x} />
        <input class="c" inputmode="decimal" placeholder="Y" aria-label="Y" bind:value={tp.y} />
        <input class="c" inputmode="decimal" placeholder="Z" aria-label="Z" bind:value={tp.z} />
        <select bind:value={tp.dim} aria-label="Dimension">
          {#each Object.entries(DIMENSIONS) as [id, d] (id)}
            <option value={id}>{d.label}</option>
          {/each}
        </select>
        <button class="btn small" type="submit" disabled={busy || !tpValid}>Teleportieren</button>
      </form>
      <div class="row">
        {#if data?.lastDeath}
          {@const ld = data.lastDeath}
          <button class="btn small" disabled={busy} onclick={() => tpTo(ld.dimension, ld.pos)} title={`${dimLabel(ld.dimension)} ${coord(ld.pos.x)} / ${coord(ld.pos.y)} / ${coord(ld.pos.z)}`}>
            💀 Zum Todespunkt
          </button>
        {/if}
        {#if data?.respawn}
          {@const rs = data.respawn}
          <button class="btn small" disabled={busy} onclick={() => tpTo(rs.dimension, rs.pos)} title={`${dimLabel(rs.dimension)} ${coord(rs.pos.x)} / ${coord(rs.pos.y)} / ${coord(rs.pos.z)}`}>
            🛏 Zum Spawnpunkt
          </button>
        {/if}
        {#if worldSpawn}
          {@const ws = worldSpawn}
          <button class="btn small" disabled={busy} onclick={() => tpTo("minecraft:overworld", ws)}>🏠 Zum Weltspawn</button>
        {:else}
          <span class="faint small">Weltspawn lässt sich auf der <a href="#/world">Welt-Seite</a> hinterlegen.</span>
        {/if}
      </div>
    </section>

    <section>
      <div class="k">Items geben</div>
      <div class="row">
        <ItemPicker onpick={(id) => (item = id)} />
        <input class="cnt" type="number" min="1" max="6400" bind:value={count} aria-label="Anzahl" />
        {#each [1, 16, 64] as n (n)}
          <button class="btn small" class:primary={count === n} onclick={() => (count = n)}>{n}</button>
        {/each}
        <button
          class="btn small primary"
          disabled={busy || !item || !(count >= 1 && count <= 6400)}
          onclick={() => item && actions.run({ type: "give", uuid, item, count: Math.floor(count) })}
        >
          Geben
        </button>
      </div>
      <div class="row">
        <button class="btn small danger" disabled={busy} onclick={() => actions.run({ type: "clear", uuid })}>Inventar leeren</button>
      </div>
    </section>

    <section>
      <div class="k">Private Nachricht</div>
      <form
        class="row"
        onsubmit={async (e) => {
          e.preventDefault();
          if (message.trim() && (await actions.run({ type: "msg", uuid, text: message }))?.ok) message = "";
        }}
      >
        <input class="grow" maxlength="256" placeholder="Nachricht an {detail.name} …" bind:value={message} />
        <button class="btn small" type="submit" disabled={busy || !message.trim()}>Senden</button>
      </form>
    </section>
  {/if}

  <section>
    <div class="k">Verwaltung</div>
    <div class="row">
      <input class="grow" maxlength="256" placeholder="Grund (optional, für Kick/Bann)" bind:value={reason} />
    </div>
    <div class="row">
      {#if online}
        <button class="btn small danger" disabled={busy} onclick={() => actions.run({ type: "kick", uuid, reason })}>Kicken</button>
      {/if}
      <button class="btn small danger" disabled={busy} onclick={() => actions.run({ type: "ban", uuid, reason })}>Bannen</button>
      <button class="btn small" disabled={busy} onclick={() => actions.run({ type: "op", uuid })}>OP geben</button>
      <button class="btn small" disabled={busy} onclick={() => actions.run({ type: "deop", uuid })}>OP entziehen</button>
    </div>
  </section>
</div>

<style>
  .player-actions {
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h3 {
    margin: 0;
  }
  .k {
    color: var(--text-faint);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 5px;
  }
  .row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .row + .row {
    margin-top: 6px;
  }
  input,
  select {
    padding: 4px 8px;
    min-height: 30px;
  }
  .c {
    width: 82px;
  }
  .cnt {
    width: 76px;
  }
  .grow {
    flex: 1;
    min-width: 180px;
  }
  .small {
    font-size: 12px;
    margin: 0;
  }
</style>
