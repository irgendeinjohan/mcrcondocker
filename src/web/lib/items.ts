// Darstellungshilfen für Items (Ersatz-Kacheln ohne Texturen).

const MATERIAL_COLORS: Record<string, string> = {
  diamond: "#4fd1c5",
  netherite: "#5b4b57",
  golden: "#e6b422",
  gold: "#e6b422",
  iron: "#c9ccd1",
  stone: "#8d8d8d",
  cobblestone: "#7a7a7a",
  wooden: "#a0743c",
  oak: "#a0743c",
  spruce: "#6b4f2d",
  birch: "#d6c58f",
  leather: "#8b5a2b",
  chainmail: "#9aa0a6",
  copper: "#c8743f",
  emerald: "#2ecc71",
  redstone: "#d0312d",
  lapis: "#2f5fd0",
  coal: "#2e2e2e",
  dirt: "#7a5232",
  grass: "#5d9b3a",
  sand: "#dccf8f",
  glass: "#a8d8e8",
  ender: "#1f6f63",
  nether: "#8b2c2c",
  netherrack: "#7a2e2e",
  blaze: "#f2a33a",
  torch: "#f6c14b",
  shulker: "#9b6b9b",
  potion: "#d14fd1",
  enchanted: "#b48ae6",
  golden_apple: "#f2c94c",
  elytra: "#8e8ea8",
  shield: "#8a6a3b",
  bow: "#8b6b3d",
  trident: "#3fa7a0",
  book: "#a0522d",
  map: "#d9c89e",
  bread: "#c89b5a",
  cooked: "#a0522d",
  bundle: "#a06a3c",
  firework: "#d24d57",
  arrow: "#b0b0b0",
  mace: "#6f6f7f",
  totem: "#e3c45b",
};

export function materialColor(id: string): string {
  const name = id.replace(/^[^:]*:/, "");
  if (MATERIAL_COLORS[name]) return MATERIAL_COLORS[name]!;
  for (const part of name.split("_")) if (MATERIAL_COLORS[part]) return MATERIAL_COLORS[part]!;
  // stabile Farbe aus dem Namen
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 35% 45%)`;
}

/** Kurzname für die Kachel: "diamond_sword" → "DiSw", "cobblestone" → "Cobb" */
export function shortName(id: string): string {
  const parts = id.replace(/^[^:]*:/, "").split("_").filter(Boolean);
  if (parts.length === 1) return cap(parts[0]!.slice(0, 4));
  return parts
    .slice(0, 3)
    .map((p) => cap(p.slice(0, parts.length > 2 ? 1 : 2)))
    .join("");
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function durabilityColor(fraction: number): string {
  return `hsl(${Math.round(Math.max(0, Math.min(1, fraction)) * 120)} 90% 45%)`;
}
