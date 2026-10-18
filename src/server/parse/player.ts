// Spieler-NBT → PlayerData. Verträgt das neue Format (equipment, ab 1.21.5)
// und das alte (Rüstung in Inventar-Slots 100–103, Offhand -106).
import type { ArmorSlot, Effect, GameMode, Item, PlayerData } from "../../shared/types.js";
import { parseItem, parseItemList, translateId, type MapContext } from "./items.js";
import { isCompound, type SnbtCompound, type SnbtValue } from "./snbt.js";

/** Felder, die wir lesen oder bewusst ignorieren (aus echten 26.3-Daten). */
const KNOWN_FIELDS = new Set([
  // gelesen
  "Pos", "Dimension", "Health", "attributes", "Attributes", "foodLevel", "foodSaturationLevel", "XpLevel", "XpP",
  "playerGameType", "SelectedItemSlot", "Inventory", "equipment", "EnderItems", "active_effects", "ActiveEffects",
  // ignoriert
  "AbsorptionAmount", "Air", "Brain", "Bukkit.updateLevel", "DataVersion", "DeathTime", "FallFlying", "Fire",
  "HurtTime", "Invulnerable", "LastDeathLocation", "Motion", "OnGround", "Paper", "Paper.Origin",
  "Paper.OriginWorld", "Paper.SpawnReason", "PortalCooldown", "Rotation", "Score", "SelectedItem", "SleepTimer",
  "Spigot.ticksLived", "UUID", "WorldUUIDLeast", "WorldUUIDMost", "XpSeed", "XpTotal", "abilities", "bukkit",
  "current_impulse_context_reset_grace_time", "fall_distance", "foodExhaustionLevel", "foodTickTimer",
  "last_explosion_impact_pos", "last_hurt_by_mob", "post_effects", "recipeBook", "seenCredits",
  "spawn_extra_particles_on_fall", "ticks_since_last_hurt_by_mob", "warden_spawn_tracker", "respawn",
  "ShoulderEntityLeft", "ShoulderEntityRight", "RootVehicle", "enteredNetherPosition", "ender_pearls",
  "HurtByTimestamp", "FallDistance", "SpawnX", "SpawnY", "SpawnZ", "SpawnDimension", "SpawnForced", "SpawnAngle",
  "Tags", "CustomName", "CustomNameVisible", "Silent", "NoGravity", "Glowing", "TicksFrozen", "HasVisualFire",
  "Passengers", "UUIDMost", "UUIDLeast", "Leashed", "LeftHanded", "PersistenceRequired", "CanPickUpLoot",
  "drop_chances", "Paper.FreezeLock", "Paper.ShouldBurnInDay", "last_death_location", "invulnerable_time",
  "entered_nether_pos", "current_explosion_impact_pos", "ignore_fall_damage_from_current_explosion",
  "Spigot.KeepInventory", "Paper.PreviousGameMode", "previousPlayerGameType",
]);

const GAME_MODES: GameMode[] = ["survival", "creative", "adventure", "spectator"];
const OLD_DIMENSIONS: Record<number, string> = { [-1]: "minecraft:the_nether", 0: "minecraft:overworld", 1: "minecraft:the_end" };
const OLD_ARMOR_SLOTS: Record<number, ArmorSlot> = { 100: "feet", 101: "legs", 102: "chest", 103: "head" };
const OLD_OFFHAND_SLOT = -106;

function num(v: SnbtValue | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function parsePlayer(nbt: SnbtCompound, ctx: MapContext): PlayerData {
  const w = ctx.warn;
  for (const key of Object.keys(nbt)) {
    if (!KNOWN_FIELDS.has(key)) w("info", `unknown-player-field:${key}`, `Unbekanntes Spielerfeld "${key}" wird ignoriert`);
  }

  // Position
  const pos = { x: 0, y: 0, z: 0 };
  const p = nbt.Pos;
  if (Array.isArray(p) && p.length >= 3 && p.every((v) => typeof v === "number")) {
    pos.x = p[0] as number;
    pos.y = p[1] as number;
    pos.z = p[2] as number;
  } else {
    w("warn", "player-no-pos", "Spielerdaten ohne lesbare Position (Pos)");
  }

  let dimension = "unknown";
  if (typeof nbt.Dimension === "string") dimension = nbt.Dimension;
  else if (typeof nbt.Dimension === "number") dimension = OLD_DIMENSIONS[nbt.Dimension] ?? `dim:${nbt.Dimension}`;
  else w("warn", "player-no-dimension", "Spielerdaten ohne Dimension");

  // Lebensenergie
  const health = num(nbt.Health) ?? 0;
  if (num(nbt.Health) === undefined) w("warn", "player-no-health", "Spielerdaten ohne Health");
  let maxHealth = 20;
  const attrs = Array.isArray(nbt.attributes) ? nbt.attributes : Array.isArray(nbt.Attributes) ? nbt.Attributes : [];
  for (const a of attrs) {
    if (!isCompound(a)) continue;
    const id = a.id ?? a.Name;
    if (id === "minecraft:max_health" || id === "minecraft:generic.max_health" || id === "generic.maxHealth" || id === "generic.max_health") {
      maxHealth = num(a.base) ?? num(a.Base) ?? 20;
      const mods = Array.isArray(a.modifiers) ? a.modifiers : Array.isArray(a.Modifiers) ? a.Modifiers : [];
      for (const m of mods) {
        if (!isCompound(m)) continue;
        const op = m.operation ?? m.Operation;
        const amount = num(m.amount) ?? num(m.Amount) ?? 0;
        if (op === "add_value" || op === 0) maxHealth += amount;
      }
    }
  }

  // Inventar
  const inventory: Item[] = [];
  const armor: Record<ArmorSlot, Item | null> = { head: null, chest: null, legs: null, feet: null };
  let offhand: Item | null = null;
  for (const it of parseItemList(nbt.Inventory, ctx, "Inventory")) {
    const armorSlot = OLD_ARMOR_SLOTS[it.slot];
    if (armorSlot) armor[armorSlot] = it;
    else if (it.slot === OLD_OFFHAND_SLOT) offhand = it;
    else if (it.slot >= 0 && it.slot <= 35) inventory.push(it);
    else w("info", `inventory-slot:${it.slot}`, `Inventar-Slot ${it.slot} unbekannt (Item ${it.id})`);
  }
  if (nbt.Inventory === undefined) w("warn", "player-no-inventory", "Spielerdaten ohne Inventory");

  const eq = nbt.equipment;
  if (isCompound(eq)) {
    for (const s of ["head", "chest", "legs", "feet"] as ArmorSlot[]) {
      if (eq[s] !== undefined) armor[s] = parseItem(eq[s], ctx, `equipment.${s}`);
    }
    if (eq.offhand !== undefined) offhand = parseItem(eq.offhand, ctx, "equipment.offhand");
    for (const k of Object.keys(eq)) {
      if (!["head", "chest", "legs", "feet", "offhand", "mainhand", "body", "saddle"].includes(k)) {
        w("info", `unknown-equipment:${k}`, `Unbekannter Ausrüstungsplatz "${k}"`);
      }
    }
  }

  const enderChest = nbt.EnderItems === undefined ? null : parseItemList(nbt.EnderItems, ctx, "EnderItems");

  // Effekte (neu: active_effects mit ids, alt: ActiveEffects mit numerischen Ids)
  const effects: Effect[] = [];
  const effRaw = Array.isArray(nbt.active_effects) ? nbt.active_effects : Array.isArray(nbt.ActiveEffects) ? nbt.ActiveEffects : [];
  for (const e of effRaw) {
    if (!isCompound(e)) continue;
    const id = typeof e.id === "string" ? e.id : typeof e.Id === "number" ? `effect#${e.Id}` : undefined;
    if (!id) continue;
    effects.push({
      id,
      name: translateId(id, "effect", ctx.translate),
      amplifier: num(e.amplifier) ?? num(e.Amplifier) ?? 0,
      duration: num(e.duration) ?? num(e.Duration) ?? 0,
    });
  }

  const gm = num(nbt.playerGameType);
  return {
    dimension,
    pos,
    health,
    maxHealth,
    food: num(nbt.foodLevel) ?? 0,
    saturation: num(nbt.foodSaturationLevel) ?? 0,
    xpLevel: num(nbt.XpLevel) ?? 0,
    xpProgress: num(nbt.XpP) ?? 0,
    gameMode: gm !== undefined ? (GAME_MODES[gm] ?? "unknown") : "unknown",
    selectedSlot: num(nbt.SelectedItemSlot) ?? 0,
    inventory,
    armor,
    offhand,
    enderChest,
    effects,
    complete: true,
  };
}
