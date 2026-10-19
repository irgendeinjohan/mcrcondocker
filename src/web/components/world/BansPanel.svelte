<script lang="ts">
  import type { BanLists } from "../../../shared/types";
  import { actions } from "../../lib/actions.svelte";
  import { api } from "../../lib/api";

  let bans = $state<BanLists | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  const busy = $derived(actions.busy > 0);

  async function load() {
    loading = true;
    try {
      bans = await api.bans();
      error = null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load();
  });

  async function pardon(name: string, ip: boolean) {
    const r = await actions.run(ip ? { type: "pardon_ip", ip: name } : { type: "pardon", name });
    if (r) await load();
  }
</script>

<section class="panel">
  <div class="head">
    <h3>Gebannte Spieler</h3>
    <button class="btn small" onclick={load} disabled={loading}>{loading ? "Lade …" : "Aktualisieren"}</button>
  </div>
  {#if error}
    <div class="err">Bann-Liste konnte nicht gelesen werden: {error}</div>
  {:else if !bans}
    <div class="faint">Lade …</div>
  {:else}
    {#each [{ title: null, list: bans.players, ip: false }, { title: "Gebannte IP-Adressen", list: bans.ips, ip: true }] as part (part.ip)}
      {#if part.title}<h3 class="sub">{part.title}</h3>{/if}
      {#if part.list.length === 0}
        <div class="faint">Keine Einträge.</div>
      {:else}
        <div class="scroll-x">
          <table>
            <thead><tr><th>{part.ip ? "IP" : "Name"}</th><th>Gebannt von</th><th>Grund</th><th></th></tr></thead>
            <tbody>
              {#each part.list as b (b.target)}
                <tr>
                  <td class="mono">{b.target}</td>
                  <td>{b.source}</td>
                  <td>{b.reason}</td>
                  <td class="act"><button class="btn small" disabled={busy} onclick={() => pardon(b.target, part.ip)}>Entbannen</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/each}
    <p class="faint small">Spieler bannen: auf der Spielerseite unter „Verwaltung“.</p>
  {/if}
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h3 {
    margin: 0;
  }
  .sub {
    margin-top: 10px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .act {
    text-align: right;
  }
  .err {
    color: var(--error);
  }
  .small {
    font-size: 12px;
    margin: 0;
  }
</style>
