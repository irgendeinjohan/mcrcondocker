// Vanilla-Haltbarkeitswerte. In den Item-Daten steht `max_damage` nur, wenn er
// vom Standard abweicht – für die Anzeige der Haltbarkeit brauchen wir also den
// Standardwert des Items.

const TOOL_TIERS: Record<string, number> = {
  wooden: 59,
  stone: 131,
  copper: 190,
  iron: 250,
  golden: 32,
  diamond: 1561,
  netherite: 2031,
};

// Haltbarkeit = Basis × Multiplikator des Materials
const ARMOR_BASE: Record<string, number> = { helmet: 11, chestplate: 16, leggings: 15, boots: 13 };
const ARMOR_MULT: Record<string, number> = {
  leather: 5,
  copper: 11,
  chainmail: 15,
  iron: 15,
  golden: 7,
  diamond: 33,
  netherite: 37,
};

const SINGLE: Record<string, number> = {
  bow: 384,
  crossbow: 465,
  trident: 250,
  shield: 336,
  elytra: 432,
  fishing_rod: 64,
  flint_and_steel: 64,
  shears: 238,
  carrot_on_a_stick: 25,
  warped_fungus_on_a_stick: 100,
  mace: 500,
  brush: 64,
  turtle_helmet: 275,
  wolf_armor: 64,
};

export function defaultMaxDamage(id: string): number | undefined {
  const name = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  const single = SINGLE[name];
  if (single !== undefined) return single;
  const tool = /^([a-z]+)_(sword|pickaxe|axe|shovel|hoe|spear)$/.exec(name);
  if (tool) return TOOL_TIERS[tool[1]!];
  const armor = /^([a-z]+)_(helmet|chestplate|leggings|boots)$/.exec(name);
  if (armor) {
    const mult = ARMOR_MULT[armor[1]!];
    const base = ARMOR_BASE[armor[2]!];
    if (mult !== undefined && base !== undefined) return mult * base;
  }
  return undefined;
}
