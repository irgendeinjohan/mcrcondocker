<script lang="ts">
  import { actions } from "../../lib/actions.svelte";
  import { live } from "../../lib/live.svelte";

  let say = $state("");
  let title = $state("");
  let subtitle = $state("");
  let target = $state("");
  let msg = $state("");

  const busy = $derived(actions.busy > 0);
  const online = $derived(live.players.filter((p) => p.online));
</script>

<div class="grid">
  <section class="panel">
    <h3>Chat-Nachricht an alle</h3>
    <p class="faint small">Erscheint im Chat als „[Rcon] …“ bzw. „[Server] …“.</p>
    <form
      class="row"
      onsubmit={async (e) => {
        e.preventDefault();
        if (say.trim() && (await actions.run({ type: "say", text: say }))?.ok) say = "";
      }}
    >
      <input class="grow" maxlength="256" placeholder="Nachricht …" bind:value={say} />
      <button class="btn primary" type="submit" disabled={busy || !say.trim()}>Senden</button>
    </form>
  </section>

  <section class="panel">
    <h3>Titel auf dem Bildschirm</h3>
    <p class="faint small">Große Einblendung in der Bildschirmmitte bei allen Spielern (ca. 5 Sekunden).</p>
    <form
      class="col"
      onsubmit={async (e) => {
        e.preventDefault();
        if (title.trim() && (await actions.run({ type: "title", text: title, subtitle: subtitle || undefined }))?.ok) {
          title = "";
          subtitle = "";
        }
      }}
    >
      <input maxlength="256" placeholder="Titel, z. B. Neustart in 5 Minuten" bind:value={title} />
      <input maxlength="256" placeholder="Untertitel (optional)" bind:value={subtitle} />
      <div><button class="btn primary" type="submit" disabled={busy || !title.trim()}>Anzeigen</button></div>
    </form>
  </section>

  <section class="panel">
    <h3>Private Nachricht</h3>
    <form
      class="col"
      onsubmit={async (e) => {
        e.preventDefault();
        if (target && msg.trim() && (await actions.run({ type: "msg", uuid: target, text: msg }))?.ok) msg = "";
      }}
    >
      <select bind:value={target} aria-label="Spieler">
        <option value="">Spieler wählen …</option>
        {#each online as p (p.uuid)}
          <option value={p.uuid}>{p.name}</option>
        {/each}
      </select>
      <input maxlength="256" placeholder="Nachricht …" bind:value={msg} />
      <div><button class="btn primary" type="submit" disabled={busy || !target || !msg.trim()}>Senden</button></div>
    </form>
    {#if !online.length}<div class="faint small">Niemand online.</div>{/if}
  </section>
</div>

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
  .row {
    display: flex;
    gap: 6px;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .small {
    font-size: 12px;
    margin: 0;
  }
</style>
