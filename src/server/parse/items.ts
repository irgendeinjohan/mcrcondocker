// Item-NBT (neu: components, alt: tag) → einheitliches Item.
import { componentToSegments, prettifyId, type TextSegment } from "../../shared/mctext.js";
import type { Enchantment, Item } from "../../shared/types.js";
import { defaultMaxDamage } from "./durability.js";
import type { Warn } from "./diagnostics.js";
import { isCompound, type SnbtCompound, type SnbtValue } from "./snbt.js";

export type Translate = (key: string) => string | undefined;

export interface MapContext {
  warn: Warn;
  translate?: Translate;
}

/** Komponenten, die ausgewertet werden */
const HANDLED = new Set([
  "custom_name", "item_name", "lore", "enchantments", "stored_enchantments", "damage", "max_damage",
  "unbreakable", "container", "bundle_contents", "charged_projectiles", "potion_contents",
  "written_book_content", "writable_book_content", "dyed_color", "trim", "enchantment_glint_override",
  "profile", "fireworks", "map_id", "ominous_bottle_amplifier", "instrument", "max_stack_size",
]);

/** Bekannte Vanilla-Komponenten, die für die Anzeige keine Rolle spielen */
const IGNORED = new Set([
  "custom_data", "repair_cost", "attribute_modifiers", "tooltip_display", "hide_tooltip",
  "hide_additional_tooltip", "rarity", "custom_model_data", "item_model", "food", "consumable",
  "use_remainder", "use_cooldown", "damage_resistant", "tool", "weapon", "enchantable", "equippable",
  "repairable", "glider", "tooltip_style", "death_protection", "blocks_attacks", "break_sound",
  "map_color", "map_decorations", "map_post_processing", "banner_patterns", "base_color", "pot_decorations",
  "block_entity_data", "block_state", "entity_data", "bucket_entity_data", "firework_explosion",
  "suspicious_stew_effects", "debug_stick_state", "recipes", "lodestone_tracker", "jukebox_playable",
  "note_block_sound", "bees", "lock", "container_loot", "provides_banner_patterns", "provides_trim_material",
  "trim_material", "can_place_on", "can_break", "creative_slot_lock", "intangible_projectile",
  "potion_duration_scale", "painting/variant", "villager/variant", "wolf/variant", "wolf/collar",
  "wolf/sound_variant", "fox/variant", "salmon/size", "parrot/variant", "tropical_fish/pattern",
  "tropical_fish/base_color", "tropical_fish/pattern_color", "mooshroom/variant", "rabbit/variant",
  "pig/variant", "cow/variant", "chicken/variant", "frog/variant", "horse/variant", "llama/variant",
  "axolotl/variant", "cat/variant", "cat/collar", "sheep/color", "shulker/color", "minimum_attack_charge",
  "kinetic_weapon", "piercing_weapon", "attack_range", "swing_animation", "use_effects", "damage_type",
  "attack_animation", "interact_animation", "block_transformer", "brewing_fuel", "compostable",
  "cooking_fuel", "cushion/color", "mob_visibility", "provides_pottery_pattern", "sign_text_front",
  "sign_text_back", "villager_food", "waxed", "zombie_nautilus/variant", "additional_trade_cost",
]);

const MAX_DEPTH = 6;

function stripNs(key: string): string {
  return key.startsWith("minecraft:") ? key.slice(10) : key;
}

function num(v: SnbtValue | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: SnbtValue | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function translateId(id: string, kind: "item" | "block" | "enchantment" | "effect", t?: Translate): string {
  const [ns, path] = id.includes(":") ? [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)] : ["minecraft", id];
  if (t) {
    const keys = kind === "item" ? [`item.${ns}.${path}`, `block.${ns}.${path}`] : [`${kind}.${ns}.${path}`];
    for (const k of keys) {
      const v = t(k);
      if (v) return v;
    }
  }
  return prettifyId(path);
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
export function roman(n: number): string {
  return n > 0 && n < ROMAN.length ? ROMAN[n]! : String(n);
}

function parseEnchantments(v: SnbtValue | undefined, ctx: MapContext): Enchantment[] {
  const out: Enchantment[] = [];
  const push = (id: string, level: number) => {
    const full = id.includes(":") ? id : `minecraft:${id}`;
    out.push({ id: full, level, name: translateId(full, "enchantment", ctx.translate) });
  };
  if (Array.isArray(v)) {
    // alt: [{id:"minecraft:sharpness",lvl:5s}]
    for (const e of v) {
      if (isCompound(e) && typeof e.id === "string") push(e.id, num(e.lvl) ?? num(e.level) ?? 1);
    }
  } else if (isCompound(v)) {
    // 1.20.5–1.21.4: {levels:{…},show_in_tooltip:…}; ab 1.21.5: direkt {id:level}
    const map = isCompound(v.levels) ? v.levels : v;
    for (const [id, lvl] of Object.entries(map)) {
      if (id === "show_in_tooltip") continue;
      const level = num(lvl);
      if (level !== undefined) push(id, level);
    }
  }
  return out;
}

function textOf(v: SnbtValue | undefined, ctx: MapContext, base: Omit<TextSegment, "text"> = {}): TextSegment[] | undefined {
  if (v === undefined) return undefined;
  const segs = componentToSegments(v, ctx.translate, base);
  return segs.length ? segs : undefined;
}

/** Items, die ohne Komponente glänzen (Standardwert von enchantment_glint_override) */
const DEFAULT_GLINT = new Set([
  "minecraft:nether_star", "minecraft:enchanted_golden_apple", "minecraft:experience_bottle",
  "minecraft:written_book", "minecraft:enchanted_book", "minecraft:debug_stick", "minecraft:end_crystal",
]);

function filterableText(v: SnbtValue | undefined): string | undefined {
  // Buchtitel: {raw:"…",filtered:"…"} oder einfacher String
  if (typeof v === "string") return v;
  if (isCompound(v) && typeof v.raw === "string") return v.raw;
  return undefined;
}

function colorHex(n: number): string {
  return "#" + (n >>> 0 & 0xffffff).toString(16).padStart(6, "0");
}

/** Liest ein Item. Gibt null zurück für leere Slots / Luft. */
export function parseItem(raw: SnbtValue | undefined, ctx: MapContext, path = "item", depth = 0): Item | null {
  if (!isCompound(raw)) {
    if (raw !== undefined) ctx.warn("warn", `item-not-compound:${path}`, `Item an ${path} hat ein unerwartetes Format`);
    return null;
  }
  // Container-Einträge {slot, item:{…}} entpacken
  if (isCompound(raw.item) && raw.id === undefined) {
    const inner = parseItem(raw.item, ctx, path, depth);
    if (inner) inner.slot = num(raw.slot) ?? inner.slot;
    return inner;
  }
  const idRaw = str(raw.id) ?? (typeof raw.id === "number" ? String(raw.id) : undefined);
  if (!idRaw) {
    ctx.warn("warn", `item-no-id:${path}`, `Item ohne "id" an ${path} wird übersprungen`);
    return null;
  }
  const id = idRaw.includes(":") ? idRaw : `minecraft:${idRaw}`;
  if (id === "minecraft:air") return null;
  const count = num(raw.count) ?? num(raw.Count) ?? 1;
  if (count <= 0) return null;
  const slot = num(raw.Slot) ?? num(raw.slot) ?? 0;

  const item: Item = {
    slot,
    id,
    count,
    name: [],
    hasCustomName: false,
    enchantments: [],
    storedEnchantments: [],
    details: [],
  };

  // Komponenten normalisieren (Namespace weg, entfernte "!x" ignorieren)
  const comps: Record<string, SnbtValue> = Object.create(null);
  if (isCompound(raw.components)) {
    for (const [k, v] of Object.entries(raw.components)) {
      if (k.startsWith("!")) continue;
      const key = stripNs(k);
      comps[key] = v;
      if (!HANDLED.has(key) && !IGNORED.has(key)) {
        ctx.warn("info", `unknown-component:${key}`, `Unbekannte Item-Komponente "${k}" wird ignoriert`, `z. B. an ${id}`);
      }
    }
  }
  const tag = isCompound(raw.tag) ? raw.tag : undefined;
  const display = tag && isCompound(tag.display) ? tag.display : undefined;

  // Name
  // eigene Namen sind im Spiel kursiv, sofern die Komponente nichts anderes sagt
  const customName = textOf(comps.custom_name, ctx, { italic: true }) ?? textOf(display?.Name, ctx, { italic: true });
  if (customName) {
    item.hasCustomName = true;
    item.name = customName;
  } else {
    const itemName = textOf(comps.item_name, ctx);
    const bookTitle = filterableText(isCompound(comps.written_book_content) ? comps.written_book_content.title : undefined) ?? str(tag?.title);
    const profile = comps.profile;
    const profileName = isCompound(profile) ? str(profile.name) : typeof profile === "string" ? profile : undefined;
    const skullOwner = tag && (isCompound(tag.SkullOwner) ? str(tag.SkullOwner.Name) : str(tag.SkullOwner));
    if (itemName) item.name = itemName;
    else if (bookTitle) item.name = [{ text: bookTitle }];
    else if ((profileName || skullOwner) && id === "minecraft:player_head") item.name = [{ text: `${profileName ?? skullOwner}'s Head` }];
    else item.name = [{ text: translateId(id, "item", ctx.translate) }];
  }

  // Lore
  const loreRaw = Array.isArray(comps.lore) ? comps.lore : display && Array.isArray(display.Lore) ? display.Lore : undefined;
  if (loreRaw) {
    item.lore = loreRaw.map((l) => componentToSegments(l, ctx.translate, { italic: true, color: "#aa00aa" }));
  }

  // Verzauberungen
  item.enchantments = parseEnchantments(comps.enchantments ?? tag?.Enchantments ?? tag?.ench, ctx);
  item.storedEnchantments = parseEnchantments(comps.stored_enchantments ?? tag?.StoredEnchantments, ctx);
  const glint = comps.enchantment_glint_override;
  item.glint =
    glint !== undefined
      ? glint === true || glint === 1
      : item.enchantments.length > 0 || item.storedEnchantments.length > 0 || DEFAULT_GLINT.has(id);

  // Haltbarkeit
  const damage = num(comps.damage) ?? num(tag?.Damage);
  const maxDamage = num(comps.max_damage) ?? defaultMaxDamage(id);
  if (comps.unbreakable !== undefined || tag?.Unbreakable === 1 || tag?.Unbreakable === true) item.unbreakable = true;
  if (maxDamage !== undefined) {
    item.maxDamage = maxDamage;
    item.damage = damage ?? 0;
  } else if (damage !== undefined && damage > 0) {
    item.damage = damage;
  }

  // Behälter
  if (depth < MAX_DEPTH) {
    const containerRaw = Array.isArray(comps.container)
      ? comps.container
      : tag && isCompound(tag.BlockEntityTag) && Array.isArray(tag.BlockEntityTag.Items)
        ? tag.BlockEntityTag.Items
        : undefined;
    if (containerRaw) {
      item.contents = parseItemList(containerRaw, ctx, `${path}.container`, depth + 1);
      item.containerSize = /shulker_box$/.test(id) ? 27 : Math.max(27, ...item.contents.map((i) => i.slot + 1));
    } else if (/shulker_box$/.test(id)) {
      item.contents = [];
      item.containerSize = 27;
    }
    const bundleRaw = Array.isArray(comps.bundle_contents) ? comps.bundle_contents : /bundle$/.test(id) && tag && Array.isArray(tag.Items) ? tag.Items : undefined;
    if (bundleRaw) {
      item.contents = bundleRaw
        .map((e, i) => {
          const it = parseItem(e, ctx, `${path}.bundle[${i}]`, depth + 1);
          if (it) it.slot = i;
          return it;
        })
        .filter((x): x is Item => x !== null);
    }
    const projectiles = comps.charged_projectiles;
    if (Array.isArray(projectiles) && projectiles.length) {
      const names = projectiles.map((p) => parseItem(p, ctx, `${path}.projectile`, depth + 1)).filter(Boolean).map((p) => p!.name.map((s) => s.text).join(""));
      item.details.push(`Geladen: ${names.join(", ")}`);
    }
  }

  // Zusätzliche Details
  const potion = isCompound(comps.potion_contents) ? comps.potion_contents : undefined;
  const potionId = potion ? str(potion.potion) : typeof comps.potion_contents === "string" ? comps.potion_contents : str(tag?.Potion);
  if (potionId) item.details.push(`Trank: ${translateId(potionId, "effect", undefined)}`);
  if (potion && Array.isArray(potion.custom_effects)) {
    for (const e of potion.custom_effects) {
      if (!isCompound(e) || typeof e.id !== "string") continue;
      const amp = num(e.amplifier) ?? 0;
      const dur = num(e.duration);
      item.details.push(`${translateId(e.id, "effect", ctx.translate)} ${roman(amp + 1)}${dur !== undefined ? ` (${formatTicks(dur)})` : ""}`);
    }
  }
  const book = isCompound(comps.written_book_content) ? comps.written_book_content : undefined;
  const author = str(book?.author) ?? str(tag?.author);
  if (author) item.details.push(`von ${author}`);
  const pages = Array.isArray(book?.pages) ? book.pages.length : Array.isArray(tag?.pages) ? tag.pages.length : undefined;
  if (pages !== undefined) item.details.push(`${pages} Seite${pages === 1 ? "" : "n"}`);
  const dyed = comps.dyed_color ?? display?.color;
  const dyedNum = num(dyed) ?? (isCompound(dyed) ? num(dyed.rgb) : undefined);
  if (dyedNum !== undefined) item.details.push(`Gefärbt: ${colorHex(dyedNum)}`);
  const trim = isCompound(comps.trim) ? comps.trim : tag && isCompound(tag.Trim) ? tag.Trim : undefined;
  if (trim) {
    const pattern = str(trim.pattern);
    const material = str(trim.material);
    if (pattern) item.details.push(`Rüstungsbesatz: ${prettifyId(pattern)}${material ? ` (${prettifyId(material)})` : ""}`);
  }
  const fireworks = isCompound(comps.fireworks) ? comps.fireworks : tag && isCompound(tag.Fireworks) ? tag.Fireworks : undefined;
  const flight = fireworks ? num(fireworks.flight_duration) ?? num(fireworks.Flight) : undefined;
  if (flight !== undefined) item.details.push(`Flugdauer: ${flight}`);
  const mapId = num(comps.map_id) ?? num(tag?.map);
  if (mapId !== undefined) item.details.push(`Karte #${mapId}`);
  const instrument = str(comps.instrument);
  if (instrument) item.details.push(prettifyId(instrument));
  const ominous = num(comps.ominous_bottle_amplifier);
  if (ominous !== undefined) item.details.push(`Stufe ${roman(ominous + 1)}`);

  return item;
}

export function formatTicks(ticks: number): string {
  if (ticks < 0) return "∞";
  const s = Math.floor(ticks / 20);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function parseItemList(list: SnbtValue | undefined, ctx: MapContext, path: string, depth = 0): Item[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    ctx.warn("warn", `itemlist-not-list:${path}`, `${path} ist keine Liste`);
    return [];
  }
  const out: Item[] = [];
  list.forEach((e, i) => {
    const it = parseItem(e, ctx, `${path}[${i}]`, depth);
    if (it) out.push(it);
  });
  return out;
}

export type { SnbtCompound };
