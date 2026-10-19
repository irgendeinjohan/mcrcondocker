<script lang="ts">
  import type { PlayerDetail } from "../../shared/types";
  import { api } from "../lib/api";
  import { ago, coord, dateTime, dimColor, dimLabel, duration, GAME_MODES, roman } from "../lib/format";
  import { live } from "../lib/live.svelte";
  import { router } from "../lib/router.svelte";
  import Inventory from "./Inventory.svelte";
  import PlayerActions from "./PlayerActions.svelte";
  import StatBar from "./StatBar.svelte";

  let { uuid, onback }: { uuid: string; onback?: () => void } = $props();

  let detail = $state<PlayerDetail | null>(null);
  let error = $state<string | null>(null);
  let sessionTotal = $state<number | null>(null);

  const summary = $derived(live.players.find((p) => p.uuid === uuid));

  async function load() {
    try {
      detail = await api.player(uuid);
      error = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  // neu laden, wenn sich der Datenstand ändert
  $effect(() => {
    void uuid;
    void summary?.snapshotAt;
    void summary?.online;
    load();
  });

  $effect(() => {
    void uuid;
    api
      .sessions(uuid)
      .then((r) => (sessionTotal = r.stats.find((s) => s.uuid === uuid)?.totalMs ?? 0))
      .catch(() => {});
  });

  const d = $derived(detail?.data ?? null);
</script>

<div class="detail">
  {#if onback}
    <button class="btn small back" onclick={onback}>← Spieler</button>
  {/if}
  {#if error}
    <div class="panel err">{error}</div>
  {:else if detail}
    <div class="head">
      <span class="dot" class:on={detail.online}></span>
      <h2>{detail.name}</h2>
      {#if detail.isBedrock}<span class="badge bedrock">Bedrock</span>{/if}
      <span class="badge">{detail.online ? "online" : "offline"}</span>
    </div>
    <div class="stand" class:old={!detail.online}>
      {#if detail.snapshotAt}
        Stand: {dateTime(detail.snapshotAt)} ({ago(detail.snapshotAt, live.now)})
      {:else}
        Noch keine Daten gespeichert.
      {/if}
      {#if !detail.online && detail.lastSeen}· zuletzt gesehen {dateTime(detail.lastSeen)}{/if}
    </div>
    <div class="faint uuid mono">{detail.uuid}</div>

    {#if d}
      {#if !d.complete}
        <div class="panel warn">
          Die Spielerdaten konnten nicht vollständig gelesen werden. Inventare fehlen eventuell.
          <a href="#/debug">Debug-Seite</a> zeigt Details.
        </div>
      {/if}
      <div class="stats panel">
        <div class="stat">
          <div class="k">Position</div>
          <div class="v mono">
            {coord(d.pos.x)} / {coord(d.pos.y)} / {coord(d.pos.z)}
          </div>
          <div class="sub">
            <span class="badge" style:color={dimColor(d.dimension)} style:border-color={dimColor(d.dimension)}>{dimLabel(d.dimension)}</span>
            <button class="btn small" onclick={() => router.go("map", d.dimension)}>auf Karte</button>
          </div>
          {#if d.dimension === "minecraft:the_nether"}
            <div class="sub faint">entspricht Oberwelt {coord(d.pos.x * 8)} / {coord(d.pos.z * 8)}</div>
          {:else if d.dimension === "minecraft:overworld"}
            <div class="sub faint">entspricht Nether {coord(d.pos.x / 8)} / {coord(d.pos.z / 8)}</div>
          {/if}
        </div>
        <div class="stat">
          <div class="k">Leben</div>
          <StatBar kind="health" value={d.health} max={d.maxHealth} />
        </div>
        <div class="stat">
          <div class="k">Hunger</div>
          <StatBar kind="food" value={d.food} />
          <div class="sub faint">Sättigung {Math.round(d.saturation * 10) / 10}</div>
        </div>
        <div class="stat">
          <div class="k">Erfahrung</div>
          <div class="v">Level {d.xpLevel}</div>
          <div class="xp"><span style:width={`${Math.round(d.xpProgress * 100)}%`}></span></div>
        </div>
        <div class="stat">
          <div class="k">Spielmodus</div>
          <div class="v">{GAME_MODES[d.gameMode] ?? d.gameMode}</div>
        </div>
        {#if sessionTotal !== null}
          <div class="stat">
            <div class="k">Online-Zeit gesamt</div>
            <div class="v">{duration(sessionTotal)}</div>
            <div class="sub"><a href="#/sessions/{detail.uuid}">Sessions ansehen</a></div>
          </div>
        {/if}
      </div>

      {#if d.effects.length}
        <div class="effects">
          {#each d.effects as e (e.id)}
            <span class="badge">{e.name} {roman(e.amplifier + 1)} · {e.duration < 0 ? "∞" : duration((e.duration / 20) * 1000)}</span>
          {/each}
        </div>
      {/if}

      <PlayerActions {detail} data={d} />
      <Inventory data={d} />
    {:else}
      <div class="panel muted">Für diesen Spieler liegen noch keine Inventardaten vor.</div>
      <PlayerActions {detail} data={null} />
    {/if}
  {:else}
    <div class="muted">Lade …</div>
  {/if}
</div>

<style>
  .detail {
    min-width: 0;
  }
  .back {
    margin-bottom: 10px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .head h2 {
    margin: 0;
    font-size: 22px;
    word-break: break-all;
  }
  .stand {
    margin-top: 4px;
    color: var(--text-dim);
    font-size: 13px;
  }
  .stand.old {
    color: var(--warn);
    font-weight: 600;
  }
  .uuid {
    font-size: 11px;
    margin: 2px 0 12px;
    word-break: break-all;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 14px 18px;
    margin-bottom: 12px;
  }
  .k {
    color: var(--text-faint);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 3px;
  }
  .v {
    font-weight: 600;
  }
  .sub {
    margin-top: 5px;
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
    flex-wrap: wrap;
  }
  .xp {
    margin-top: 5px;
    height: 6px;
    background: #2a2f37;
    border-radius: 3px;
    overflow: hidden;
  }
  .xp span {
    display: block;
    height: 100%;
    background: #80ff20;
  }
  .effects {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .panel.muted {
    margin-bottom: 12px;
  }
  .panel.warn {
    border-color: var(--warn);
    color: var(--warn);
    margin-bottom: 12px;
  }
  .panel.err {
    border-color: var(--error);
    color: var(--error);
  }
</style>
