import type { Item } from "../../shared/types";
import type { RenderIndex } from "../../shared/appearance";

type VisualItem = Pick<Item, "id" | "appearance" | "glint">;
interface Renderer {
  configure(options: Record<string, unknown>): void;
  prepareAssets(assets: unknown, options: Record<string, unknown>): Promise<unknown>;
  renderItem(options: Record<string, unknown>): Promise<HTMLCanvasElement>;
  renderModel(options: Record<string, unknown>): Promise<HTMLCanvasElement>;
  disposeCache(assets: unknown): void;
}
let renderer: Promise<Renderer> | undefined;
let active: { revision: string; assets: Promise<unknown> } | undefined;
let queue = Promise.resolve();
const cache = new Map<string, Promise<string>>();

function library(): Promise<Renderer> {
  return renderer ??= (async () => {
    const modulePath = "/renderer/block-model-renderer.min.js";
    const [module, THREE] = await Promise.all([import(/* @vite-ignore */ modulePath), import("three")]);
    const engine = module as Renderer;
    engine.configure({ THREE, assetsUrl: "/renderer/assets.zip" });
    return engine;
  })();
}
export function needsRendering(item: VisualItem, index: RenderIndex): boolean {
  return index.enabled && (index.custom || !!item.appearance?.skin || Object.keys(item.appearance?.components ?? {}).some((key) => !["damage", "max_damage", "enchantment_glint_override"].includes(key)));
}
function assetSource(index: RenderIndex) {
  const files = new Set(index.files);
  const directories = new Map<string, Set<string>>();
  for (const file of index.files) {
    const parts = file.split("/"); let dir = "";
    for (const part of parts) { if (!directories.has(dir)) directories.set(dir, new Set()); directories.get(dir)!.add(part); dir = dir ? `${dir}/${part}` : part; }
  }
  const reads = new Map<string, Promise<Uint8Array | null>>();
  return {
    list: (dir: string) => [...(directories.get(dir.replace(/\/$/, "")) ?? [])],
    read: (file: string): Promise<Uint8Array | null> => {
      if (!files.has(file)) return Promise.resolve(null);
      let result = reads.get(file);
      if (!result) {
        result = fetch(`/api/render/file?path=${encodeURIComponent(file)}`, { credentials: "same-origin" })
          .then(async (response) => response.ok ? new Uint8Array(await response.arrayBuffer()) : null);
        reads.set(file, result);
      }
      return result;
    },
  };
}
async function prepared(index: RenderIndex): Promise<unknown> {
  if (!active || active.revision !== index.revision) {
    const engine = await library();
    if (active) engine.disposeCache(await active.assets);
    active = { revision: index.revision, assets: engine.prepareAssets([assetSource(index)], { cache: true, version: index.version }) };
  }
  return active.assets;
}

export function renderIcon(item: VisualItem, index: RenderIndex): Promise<string> {
  const key = JSON.stringify([index.revision, item.id, item.appearance, item.glint]);
  const hit = cache.get(key);
  if (hit) return hit;
  const work = queue.then(async () => {
    const engine = await library();
    const assets = await prepared(index);
    const components: Record<string, unknown> = { ...item.appearance?.components, enchantment_glint_override: false };
    const options = { assets, version: index.version, width: 64, height: 64, ignoreAtlases: true };
    let canvas: HTMLCanvasElement;
    const skin = item.appearance?.skin;
    if (skin && index.skins.includes(skin)) {
      // Supply head geometry with the profile's LOCAL skin, including its outer hat layer.
      const image = await fetch(`/api/skin/${skin}`).then((response) => response.blob()).then(createImageBitmap);
      const skinTexture = new OffscreenCanvas(64, 64);
      skinTexture.getContext("2d")!.drawImage(image, 0, 0, 64, image.height === image.width ? 64 : 32);
      const handler = { read: (file: string) => file === `assets/mcdash/textures/skin/${skin}.png` ? skinTexture : null, list: () => [] };
      const skinAssets = await engine.prepareAssets([handler, assetSource(index)], { cache: true, version: index.version });
      const faces = (offset: number) => ({
        north: { uv: [2 + offset, 2, 4 + offset, 4], texture: "#head" },
        east: { uv: [0 + offset, 2, 2 + offset, 4], texture: "#head" },
        south: { uv: [6 + offset, 2, 8 + offset, 4], texture: "#head" },
        west: { uv: [4 + offset, 2, 6 + offset, 4], texture: "#head" },
        up: { uv: [4 + offset, 2, 2 + offset, 0], texture: "#head" },
        down: { uv: [6 + offset, 0, 4 + offset, 2], texture: "#head" },
      });
      try {
        canvas = await engine.renderModel({ ...options, assets: skinAssets, model: {
          textures: { head: `mcdash:skin/${skin}` }, texture_size: [64, 64], ambientocclusion: false,
          display: { gui: { rotation: [30, 225, 0], translation: [0, 0, 0], scale: [1, 1, 1] } },
          elements: [{ from: [4, 4, 4], to: [12, 12, 12], faces: faces(0) }, { from: [3.75, 3.75, 3.75], to: [12.25, 12.25, 12.25], faces: faces(8) }],
        } });
      } finally { engine.disposeCache(skinAssets); image.close(); }
    } else if (components.potion_contents && typeof components.potion_contents === "object" && typeof (components.potion_contents as Record<string, unknown>).custom_color === "number") {
      const color = (components.potion_contents as { custom_color: number }).custom_color & 0xffffff;
      const source = assetSource(index);
      const targetId = typeof components.item_model === "string" ? components.item_model : item.id;
      const fullId = targetId.includes(":") ? targetId : `minecraft:${targetId}`;
      const [namespace, name] = fullId.split(":");
      const definition = `assets/${namespace}/items/${name}.json`;
      const original = await source.read(definition);
      if (!original) throw new Error("Missing potion item definition");
      const model = JSON.parse(new TextDecoder().decode(original));
      const replacePotionTints = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) { value.forEach(replacePotionTints); return; }
        const node = value as Record<string, unknown>;
        if (typeof node.type === "string" && node.type.replace("minecraft:", "") === "potion") { node.type = "minecraft:constant"; node.value = color; }
        for (const entry of Object.values(node)) replacePotionTints(entry);
      };
      replacePotionTints(model);
      const override = { read: (file: string) => file === definition ? new TextEncoder().encode(JSON.stringify(model)) : null, list: () => [] };
      const tinted = await engine.prepareAssets([override, source], { version: index.version });
      canvas = await engine.renderItem({ ...options, assets: tinted, id: targetId, components });
    } else {
      // item_model references an item definition supplied by the pack, not an executable URL.
      const id = typeof components.item_model === "string" ? components.item_model : item.id;
      canvas = await engine.renderItem({ ...options, id, components });
    }
    return canvas.toDataURL("image/png");
  });
  queue = work.then(() => {}, () => {});
  cache.set(key, work);
  if (cache.size > 512) cache.delete(cache.keys().next().value!);
  work.catch(() => { cache.delete(key); });
  return work;
}
