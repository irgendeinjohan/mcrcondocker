<script lang="ts">
  import type { PlayerSummary } from "../../shared/types";
  import { actions } from "../lib/actions.svelte";
  import { coord, DIMENSIONS, dimColor, dimLabel } from "../lib/format";
  import { live } from "../lib/live.svelte";
  import { router } from "../lib/router.svelte";

  const STORAGE_KEY = "mcdash.map.showOffline";
  let canvas = $state<HTMLCanvasElement | undefined>();
  let wrap = $state<HTMLDivElement | undefined>();
  let showOffline = $state(readBool(STORAGE_KEY, true));
  let cursor = $state<{ x: number; z: number } | null>(null);
  /** Teleport-Menü nach Rechtsklick / langem Tippen */
  let tpMenu = $state<{ x: number; z: number } | null>(null);
  let tpPlayer = $state("");
  let tpY = $state("");
  const onlinePlayers = $derived(live.players.filter((p) => p.online));

  // Ansicht pro Dimension merken
  const views = new Map<string, { cx: number; cz: number; scale: number }>();
  let cx = $state(0);
  let cz = $state(0);
  let scale = $state(1); // Pixel pro Block
  let size = $state({ w: 600, h: 400 });
  /** true, sobald der Nutzer verschoben/gezoomt hat – dann nicht mehr automatisch einpassen */
  let userMoved = false;

  const dims = $derived.by(() => {
    const set = new Set(Object.keys(DIMENSIONS));
    for (const p of live.players) if (p.dimension) set.add(p.dimension);
    return [...set];
  });
  const dim = $derived(router.param && dims.includes(router.param) ? router.param : "minecraft:overworld");
  const visible = $derived(live.players.filter((p) => p.dimension === dim && p.pos && (p.online || showOffline)));

  function readBool(key: string, def: boolean): boolean {
    try {
      const v = localStorage.getItem(key);
      return v === null ? def : v === "1";
    } catch {
      return def;
    }
  }
  $effect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, showOffline ? "1" : "0");
    } catch {
      /* ignorieren */
    }
  });

  // beim Dimensionswechsel Ansicht laden oder passend einpassen
  let lastDim = "";
  $effect(() => {
    if (dim === lastDim) return;
    if (lastDim) views.set(lastDim, { cx, cz, scale });
    lastDim = dim;
    const v = views.get(dim);
    if (v) ({ cx, cz, scale } = v);
    else {
      userMoved = false;
      fit();
    }
  });

  function fit(): void {
    const pts = live.players.filter((p) => p.dimension === dim && p.pos && (p.online || showOffline));
    if (!pts.length) {
      cx = 0;
      cz = 0;
      scale = 1;
      return;
    }
    const xs = pts.map((p) => p.pos!.x);
    const zs = pts.map((p) => p.pos!.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    cx = (minX + maxX) / 2;
    cz = (minZ + maxZ) / 2;
    const spanX = Math.max(64, maxX - minX), spanZ = Math.max(64, maxZ - minZ);
    scale = clampScale(Math.min((size.w * 0.8) / spanX, (size.h * 0.8) / spanZ));
  }

  function clampScale(s: number): number {
    return Math.min(64, Math.max(1 / 64, s));
  }

  const toScreen = (x: number, z: number) => ({ sx: (x - cx) * scale + size.w / 2, sy: (z - cz) * scale + size.h / 2 });
  const toWorld = (sx: number, sy: number) => ({ x: (sx - size.w / 2) / scale + cx, z: (sy - size.h / 2) / scale + cz });

  function zoomAt(factor: number, sx: number, sy: number): void {
    userMoved = true;
    const before = toWorld(sx, sy);
    scale = clampScale(scale * factor);
    const after = toWorld(sx, sy);
    cx += before.x - after.x;
    cz += before.z - after.z;
  }

  function gridStep(): number {
    const minPx = 70;
    const raw = minPx / scale;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return Math.max(1, m * pow);
    return 10 * pow;
  }

  // --- Zeichnen ------------------------------------------------------------
  $effect(() => {
    if (!canvas) return;
    // Abhängigkeiten
    void [cx, cz, scale, size.w, size.h, visible, dim, tpMenu];
    draw();
  });

  function draw(): void {
    const c = canvas!;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(size.w * dpr) || c.height !== Math.round(size.h * dpr)) {
      c.width = Math.round(size.w * dpr);
      c.height = Math.round(size.h * dpr);
    }
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = dim === "minecraft:the_nether" ? "#1b1212" : dim === "minecraft:the_end" ? "#16131d" : "#131813";
    g.fillRect(0, 0, size.w, size.h);

    const step = gridStep();
    const tl = toWorld(0, 0);
    const br = toWorld(size.w, size.h);
    g.lineWidth = 1;
    g.font = "11px system-ui, sans-serif";
    // Feinraster (Chunks), wenn nah genug
    if (scale * 16 >= 14 && step > 16) drawLines(16, "rgba(255,255,255,0.035)", tl, br, g);
    drawLines(step, "rgba(255,255,255,0.09)", tl, br, g);
    // Achsen
    g.strokeStyle = "rgba(255,255,255,0.28)";
    const o = toScreen(0, 0);
    g.beginPath();
    g.moveTo(o.sx + 0.5, 0);
    g.lineTo(o.sx + 0.5, size.h);
    g.moveTo(0, o.sy + 0.5);
    g.lineTo(size.w, o.sy + 0.5);
    g.stroke();
    // Beschriftung
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.textBaseline = "top";
    for (let x = Math.ceil(tl.x / step) * step; x <= br.x; x += step) {
      const { sx } = toScreen(x, 0);
      g.fillText(String(x), sx + 3, 4);
    }
    g.textBaseline = "middle";
    for (let z = Math.ceil(tl.z / step) * step; z <= br.z; z += step) {
      const { sy } = toScreen(0, z);
      g.fillText(String(z), 4, sy - 7);
    }
    // Ursprung
    g.fillStyle = "rgba(255,255,255,0.5)";
    g.beginPath();
    g.arc(o.sx, o.sy, 3, 0, Math.PI * 2);
    g.fill();

    // Ziel des Teleport-Menüs
    if (tpMenu) {
      const t = toScreen(tpMenu.x, tpMenu.z);
      g.strokeStyle = "#ffd54a";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(t.sx, t.sy, 9, 0, Math.PI * 2);
      g.moveTo(t.sx - 14, t.sy);
      g.lineTo(t.sx + 14, t.sy);
      g.moveTo(t.sx, t.sy - 14);
      g.lineTo(t.sx, t.sy + 14);
      g.stroke();
    }

    // Spieler
    g.textBaseline = "middle";
    g.font = "600 12px system-ui, sans-serif";
    const sorted = [...visible].sort((a, b) => Number(a.online) - Number(b.online));
    for (const p of sorted) {
      const { sx, sy } = toScreen(p.pos!.x, p.pos!.z);
      if (sx < -50 || sy < -50 || sx > size.w + 50 || sy > size.h + 50) continue;
      const col = p.online ? (p.isBedrock ? "#7dd3fc" : "#5bff5b") : "#9aa1ad";
      g.globalAlpha = p.online ? 1 : 0.75;
      g.beginPath();
      g.arc(sx, sy, 6, 0, Math.PI * 2);
      if (p.online) {
        g.fillStyle = col;
        g.fill();
        g.strokeStyle = "#000";
        g.lineWidth = 2;
        g.stroke();
      } else {
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.stroke();
      }
      const label = p.name;
      const w = g.measureText(label).width;
      // Namensschild links vom Punkt, wenn es rechts nicht mehr passt
      const lx = sx + 13 + w + 4 > size.w ? sx - 13 - w : sx + 13;
      g.fillStyle = "rgba(0,0,0,0.65)";
      g.fillRect(lx - 4, sy - 9, w + 8, 18);
      g.fillStyle = p.online ? "#fff" : "#c3c7cf";
      g.fillText(label, lx, sy);
      g.globalAlpha = 1;
    }
  }

  function drawLines(step: number, color: string, tl: { x: number; z: number }, br: { x: number; z: number }, g: CanvasRenderingContext2D) {
    g.strokeStyle = color;
    g.beginPath();
    for (let x = Math.ceil(tl.x / step) * step; x <= br.x; x += step) {
      const sx = Math.round(toScreen(x, 0).sx) + 0.5;
      g.moveTo(sx, 0);
      g.lineTo(sx, size.h);
    }
    for (let z = Math.ceil(tl.z / step) * step; z <= br.z; z += step) {
      const sy = Math.round(toScreen(0, z).sy) + 0.5;
      g.moveTo(0, sy);
      g.lineTo(size.w, sy);
    }
    g.stroke();
  }

  // --- Größe ---------------------------------------------------------------
  $effect(() => {
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      size = { w: wrap!.clientWidth, h: wrap!.clientHeight };
      if (!userMoved) fit();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  });

  // --- Eingabe -------------------------------------------------------------
  const pointers = new Map<number, { x: number; y: number }>();
  let downAt: { x: number; y: number; t: number } | null = null;
  let moved = false;
  let pinchDist = 0;
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressed = false;

  function cancelPress(): void {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  }

  function openTpMenu(sx: number, sy: number): void {
    const w = toWorld(sx, sy);
    tpMenu = { x: Math.floor(w.x), z: Math.floor(w.z) };
    if (!onlinePlayers.some((p) => p.uuid === tpPlayer)) tpPlayer = onlinePlayers[0]?.uuid ?? "";
  }

  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const r = canvas!.getBoundingClientRect();
    openTpMenu(e.clientX - r.left, e.clientY - r.top);
  }

  async function teleport(): Promise<void> {
    if (!tpMenu || !tpPlayer) return;
    const y = tpY.trim() === "" ? null : Number(tpY.replace(",", "."));
    if (y !== null && !Number.isFinite(y)) return;
    const target = tpMenu;
    const r = await actions.run(
      y === null
        ? { type: "tp_surface", uuid: tpPlayer, dimension: dim, x: target.x, z: target.z, maxY: dim === "minecraft:the_nether" ? 120 : undefined }
        : { type: "tp_coords", uuid: tpPlayer, dimension: dim, x: target.x + 0.5, y, z: target.z + 0.5 },
    );
    if (r?.ok) tpMenu = null;
  }

  function local(e: PointerEvent | WheelEvent) {
    const r = canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e: PointerEvent) {
    canvas!.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      downAt = { ...p, t: Date.now() };
      moved = false;
      longPressed = false;
      cancelPress();
      // langes Tippen (Touch) öffnet das Teleport-Menü; Maus nutzt Rechtsklick
      if (e.pointerType !== "mouse") {
        pressTimer = setTimeout(() => {
          pressTimer = null;
          if (!moved && downAt) {
            longPressed = true;
            openTpMenu(downAt.x, downAt.y);
          }
        }, 550);
      }
    } else if (pointers.size === 2) {
      cancelPress();
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      moved = true;
    }
  }

  function onMove(e: PointerEvent) {
    const p = local(e);
    cursor = toWorld(p.x, p.y);
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      const dx = p.x - prev.x, dy = p.y - prev.y;
      if (downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 5) {
        moved = true;
        cancelPress();
      }
      cx -= dx / scale;
      cz -= dy / scale;
      if (dx || dy) userMoved = true;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchDist > 0) zoomAt(dist / pinchDist, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      pinchDist = dist;
    }
  }

  function onUp(e: PointerEvent) {
    const p = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    cancelPress();
    if (pointers.size === 0 && !moved && !longPressed && downAt && e.button !== 2) {
      if (tpMenu) tpMenu = null;
      else hit(p.x, p.y);
    }
    if (pointers.size === 0) downAt = null;
  }

  function hit(x: number, y: number): void {
    let best: PlayerSummary | null = null;
    let bestD = 18;
    for (const p of visible) {
      const s = toScreen(p.pos!.x, p.pos!.z);
      const d = Math.hypot(s.sx - x, s.sy - y);
      // Namensschild ebenfalls klickbar
      const lw = p.name.length * 7.5;
      const left = s.sx + 13 + lw + 4 > size.w;
      const onLabel = (left ? x < s.sx - 8 && x > s.sx - 14 - lw : x > s.sx + 8 && x < s.sx + 14 + lw) && Math.abs(y - s.sy) < 10;
      if (d < bestD || onLabel) {
        best = p;
        bestD = onLabel ? 0 : d;
      }
    }
    if (best) router.go("players", best.uuid);
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = local(e);
    zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }
</script>

<div class="map-view">
  <div class="toolbar">
    <div class="tabs" role="tablist">
      {#each dims as d (d)}
        <button
          role="tab"
          aria-selected={d === dim}
          class="tab"
          class:active={d === dim}
          style:--c={dimColor(d)}
          onclick={() => router.go("map", d)}
        >
          {dimLabel(d)}
          <span class="cnt">{live.players.filter((p) => p.dimension === d && p.online).length}</span>
        </button>
      {/each}
    </div>
    <div class="tools">
      <label class="chk"><input type="checkbox" bind:checked={showOffline} /> Offline</label>
      <button class="btn small" onclick={() => zoomAt(1.5, size.w / 2, size.h / 2)} aria-label="Hineinzoomen">+</button>
      <button class="btn small" onclick={() => zoomAt(1 / 1.5, size.w / 2, size.h / 2)} aria-label="Herauszoomen">−</button>
      <button class="btn small" onclick={fit}>Einpassen</button>
    </div>
  </div>
  <div class="canvas-wrap" bind:this={wrap}>
    <canvas
      bind:this={canvas}
      style:width={`${size.w}px`}
      style:height={`${size.h}px`}
      onpointerdown={onDown}
      onpointermove={onMove}
      onpointerup={onUp}
      onpointercancel={onUp}
      onpointerleave={() => (cursor = null)}
      onwheel={onWheel}
      oncontextmenu={onContextMenu}
    ></canvas>
    {#if tpMenu}
      {@const pos = toScreen(tpMenu.x, tpMenu.z)}
      <form
        class="tp-menu panel"
        style:left={`${Math.max(8, Math.min(pos.sx + 16, size.w - 268))}px`}
        style:top={`${Math.max(8, Math.min(pos.sy + 16, size.h - 190))}px`}
        onsubmit={(e) => {
          e.preventDefault();
          void teleport();
        }}
      >
        <div class="tp-title">Teleport nach X {coord(tpMenu.x)} · Z {coord(tpMenu.z)}</div>
        {#if onlinePlayers.length}
          <select bind:value={tpPlayer} aria-label="Spieler">
            {#each onlinePlayers as p (p.uuid)}
              <option value={p.uuid}>{p.name}{p.dimension && p.dimension !== dim ? ` (${dimLabel(p.dimension)})` : ""}</option>
            {/each}
          </select>
          <input inputmode="decimal" placeholder="Y (leer = auf den Boden)" aria-label="Y" bind:value={tpY} />
          {#if dim === "minecraft:the_nether" && !tpY.trim()}
            <div class="faint tp-hint">Im Nether wird unterhalb von Y 120 gesucht.</div>
          {/if}
          <div class="tp-btns">
            <button class="btn small" type="button" onclick={() => (tpMenu = null)}>Abbrechen</button>
            <button class="btn small primary" type="submit" disabled={!tpPlayer || actions.busy > 0}>Teleportieren</button>
          </div>
        {:else}
          <div class="faint">Niemand online.</div>
          <div class="tp-btns"><button class="btn small" type="button" onclick={() => (tpMenu = null)}>Schließen</button></div>
        {/if}
      </form>
    {/if}
    <div class="hud mono">
      {#if cursor}X {coord(Math.floor(cursor.x))} · Z {coord(Math.floor(cursor.z))}{:else}Mitte X {coord(Math.round(cx))} · Z {coord(Math.round(cz))}{/if}
      · {scale >= 1 ? `${Math.round(scale * 10) / 10} px/Block` : `1 px = ${Math.round(1 / scale)} Blöcke`}
    </div>
    {#if visible.length === 0}
      <div class="empty muted">Keine Spieler in {dimLabel(dim)}.</div>
    {/if}
  </div>
  <div class="legend faint">
    <span><span class="lg on"></span>online</span>
    <span><span class="lg br"></span>Bedrock</span>
    <span><span class="lg off"></span>offline (letzte Position)</span>
    <span>Norden ist oben (−Z)</span>
    <span>Rechtsklick / lange tippen: Spieler dorthin teleportieren</span>
  </div>
</div>

<style>
  .map-view {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: calc(100vh - 150px - var(--safe-bottom));
    height: calc(100dvh - 150px - var(--safe-bottom));
    min-height: 360px;
  }
  .toolbar {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .tab {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 12px;
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .tab.active {
    border-color: var(--c);
    color: var(--c);
    background: color-mix(in srgb, var(--c) 12%, var(--panel));
  }
  .cnt {
    font-size: 12px;
    background: var(--panel-2);
    border-radius: 999px;
    padding: 0 6px;
    color: var(--text-dim);
  }
  .tools {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .chk {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-right: 6px;
    font-size: 13px;
  }
  .canvas-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  canvas {
    display: block;
    touch-action: none;
    cursor: grab;
  }
  canvas:active {
    cursor: grabbing;
  }
  .hud {
    position: absolute;
    right: 8px;
    bottom: 8px;
    background: rgba(0, 0, 0, 0.6);
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 12px;
    pointer-events: none;
  }
  .tp-menu {
    position: absolute;
    width: 260px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 5;
  }
  .tp-menu select,
  .tp-menu input {
    padding: 4px 8px;
    font-size: 16px;
  }
  .tp-title {
    font-weight: 600;
    font-size: 13px;
  }
  .tp-hint {
    font-size: 12px;
  }
  .tp-btns {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .empty {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .legend {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 12px;
  }
  .lg {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 4px;
    vertical-align: -1px;
  }
  .lg.on {
    background: #5bff5b;
  }
  .lg.br {
    background: #7dd3fc;
  }
  .lg.off {
    border: 2px solid #9aa1ad;
  }
  @media (max-width: 720px) {
    .map-view {
      height: calc(100dvh - 175px - var(--safe-top) - var(--safe-bottom));
      min-height: 300px;
    }
  }
</style>
