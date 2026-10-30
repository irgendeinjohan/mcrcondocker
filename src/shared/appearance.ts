export interface ItemAppearance { components: Record<string, unknown>; skin?: string }
export interface RenderIndex { enabled: boolean; version: string; revision: string; files: string[]; custom: boolean; skins: string[] }
const APPEARANCE_KEYS = new Set(["dyed_color", "trim", "base_color", "banner_patterns", "potion_contents", "custom_model_data", "item_model", "block_state", "damage", "max_damage", "charged_projectiles", "firework_explosion", "enchantment_glint_override"]);
const DYES = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
const PATTERNS: Record<string, string> = { b: "base", bl: "square_bottom_left", br: "square_bottom_right", tl: "square_top_left", tr: "square_top_right", bs: "stripe_bottom", ts: "stripe_top", ls: "stripe_left", rs: "stripe_right", cs: "stripe_center", ms: "stripe_middle", drs: "stripe_downright", dls: "stripe_downleft", ss: "small_stripes", cr: "cross", sc: "straight_cross", bt: "triangle_bottom", tt: "triangle_top", bts: "triangles_bottom", tts: "triangles_top", ld: "diagonal_left", rd: "diagonal_up_right", lud: "diagonal_up_left", rud: "diagonal_right", mc: "circle", mr: "rhombus", vh: "half_vertical", hh: "half_horizontal", vhr: "half_vertical_right", hhb: "half_horizontal_bottom", bo: "border", cbo: "curly_border", gra: "gradient", gru: "gradient_up", bri: "bricks", glb: "globe", cre: "creeper", sku: "skull", flo: "flower", moj: "mojang", pig: "piglin" };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function bounded(value: unknown, depth = 0): unknown {
  if (depth > 6) return undefined;
  if (typeof value === "string") return value.length <= 8192 ? value : undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 128).map((entry) => bounded(entry, depth + 1));
  if (object(value)) return Object.fromEntries(Object.entries(value).slice(0, 64).filter(([key]) => !["__proto__", "constructor", "prototype"].includes(key)).map(([key, entry]) => [key, bounded(entry, depth + 1)]));
  return undefined;
}

/** Appearance is bounded data, never executable code or an arbitrary URL. */
export function itemAppearance(components: Record<string, unknown>, tag?: Record<string, unknown>): ItemAppearance | undefined {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(components)) if (APPEARANCE_KEYS.has(key)) data[key] = bounded(value);
  if (tag) {
    const display = object(tag.display) ? tag.display : undefined;
    if (display?.color !== undefined) data.dyed_color ??= display.color;
    if (tag.Trim !== undefined) data.trim ??= bounded(tag.Trim);
    if (tag.CustomModelData !== undefined) data.custom_model_data ??= bounded(tag.CustomModelData);
    if (tag.Potion || tag.CustomPotionColor !== undefined) data.potion_contents ??= { potion: tag.Potion, custom_color: tag.CustomPotionColor };
    const entity = object(tag.BlockEntityTag) ? tag.BlockEntityTag : undefined;
    if (entity) {
      if (typeof entity.Base === "number") data.base_color ??= DYES[entity.Base];
      if (Array.isArray(entity.Patterns)) data.banner_patterns ??= entity.Patterns.slice(0, 32).filter(object).map((entry) => ({ pattern: `minecraft:${PATTERNS[String(entry.Pattern)] ?? String(entry.Pattern)}`, color: DYES[Number(entry.Color)] ?? "white" }));
    }
  }
  let skin: string | undefined;
  const profile = components.profile ?? tag?.SkullOwner;
  if (object(profile)) {
    const properties = profile.properties ?? profile.Properties;
    const values = Array.isArray(properties) ? properties.filter(object).filter((property) => property.name === "textures").map((property) => property.value) : object(properties) && Array.isArray(properties.textures) ? properties.textures.filter(object).map((property) => property.Value) : [];
    for (const value of values) {
      if (typeof value !== "string" || value.length > 8192) continue;
      try {
        const encoded = atob(value);
        const texture = JSON.parse(encoded)?.textures?.SKIN?.url;
        if (typeof texture === "string") skin = /^https?:\/\/textures\.minecraft\.net\/texture\/([a-f0-9]{64})$/.exec(texture)?.[1];
      } catch { /* Invalid profile data must not break an inventory. */ }
      if (skin) break;
    }
  }
  if (!Object.keys(data).length && !skin) return undefined;
  if (JSON.stringify(data).length > 32768) return undefined;
  return { components: data, ...(skin ? { skin } : {}) };
}
