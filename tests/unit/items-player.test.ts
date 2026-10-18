import { describe, expect, it } from "vitest";
import { segmentsToPlain } from "../../src/shared/mctext.js";
import type { Item } from "../../src/shared/types.js";
import { collectingWarn } from "../../src/server/parse/diagnostics.js";
import { parseItemList } from "../../src/server/parse/items.js";
import { parsePlayer } from "../../src/server/parse/player.js";
import { parseEntityDump } from "../../src/server/parse/responses.js";
import { isCompound, parseSnbt, type SnbtCompound } from "../../src/server/parse/snbt.js";
import { fixture, fixture263 } from "./helpers.js";

const name = (i: Item | null | undefined) => (i ? segmentsToPlain(i.name) : undefined);

function chestItems(): Item[] {
  const { warn } = collectingWarn();
  const body = fixture263("block-chest-items-string");
  const nbt = parseSnbt(body, body.indexOf("got ") + 4).value as SnbtCompound;
  return parseItemList(nbt.Items, { warn }, "Items");
}

function player26(n: string) {
  const c = collectingWarn();
  const dump = parseEntityDump(fixture263(n), c.warn);
  if (dump.kind !== "ok") throw new Error("nicht lesbar");
  return { p: parsePlayer(dump.nbt, { warn: c.warn }), warnings: c.list };
}

function legacy(file: string) {
  const c = collectingWarn();
  const v = parseSnbt(fixture(`legacy/${file}`).trim()).value;
  if (!isCompound(v)) throw new Error("kein Compound");
  return { p: parsePlayer(v, { warn: c.warn }), warnings: c.list };
}

describe("Items aus 26.3-Truhe", () => {
  const items = chestItems();
  const bySlot = (s: number) => items.find((i) => i.slot === s)!;

  it("liest alle Items", () => {
    expect(items.length).toBeGreaterThanOrEqual(26);
  });

  it("verzaubertes, umbenanntes, beschädigtes Schwert", () => {
    const s = bySlot(0);
    expect(s.id).toBe("minecraft:diamond_sword");
    expect(name(s)).toBe("Excalibur");
    expect(s.hasCustomName).toBe(true);
    expect(s.name[0]).toMatchObject({ color: "#ffaa00" });
    expect(s.name[0]!.italic).toBeUndefined(); // italic:false explizit
    expect(s.enchantments.map((e) => `${e.id}=${e.level}`).sort()).toEqual(["minecraft:mending=1", "minecraft:sharpness=5", "minecraft:unbreaking=3"]);
    expect(s.damage).toBe(120);
    expect(s.maxDamage).toBe(1561);
    expect(s.glint).toBe(true);
  });

  it("Stapel", () => {
    expect(bySlot(1)).toMatchObject({ id: "minecraft:cobblestone", count: 64 });
  });

  it("Shulkerkiste mit Inhalt und eigenem Namen", () => {
    const sb = bySlot(2);
    expect(name(sb)).toBe("Lager");
    expect(sb.name[0]!.italic).toBe(true);
    expect(sb.containerSize).toBe(27);
    expect(sb.contents!.map((i) => [i.slot, i.id, i.count])).toEqual([
      [0, "minecraft:diamond", 32],
      [5, "minecraft:golden_apple", 3],
      [26, "minecraft:netherite_pickaxe", 1],
    ]);
    expect(sb.contents![2]!.enchantments[0]!.id).toBe("minecraft:efficiency");
  });

  it("Verzaubertes Buch, Trank, Buch, Kopf", () => {
    expect(bySlot(3).storedEnchantments).toHaveLength(2);
    expect(bySlot(4).details).toContain("Trank: Strong Healing");
    expect(name(bySlot(5))).toBe("Tagebuch");
    expect(bySlot(5).details).toEqual(expect.arrayContaining(["von Johan", "2 Seiten"]));
    expect(name(bySlot(6))).toBe("Notch's Head");
  });

  it("Lederrüstung gefärbt mit Besatz, Bogen unzerbrechlich", () => {
    expect(bySlot(7).details).toEqual(expect.arrayContaining(["Gefärbt: #ff0000", "Rüstungsbesatz: Coast (Gold)"]));
    expect(bySlot(7).maxDamage).toBe(80);
    expect(bySlot(8).unbreakable).toBe(true);
  });

  it("Bündel, Karte, Rakete, Unicode-Name mit Lore", () => {
    expect(bySlot(9).contents!.map((i) => i.id)).toEqual(["minecraft:arrow", "minecraft:torch"]);
    expect(bySlot(10).details).toContain("Karte #7");
    expect(bySlot(11)).toMatchObject({ count: 16, details: ["Flugdauer: 2"] });
    expect(name(bySlot(12))).toBe("Ümläut ✓ 🎉 Name");
    expect(bySlot(12).lore!.map((l) => segmentsToPlain(l))).toEqual(["Zeile 1", "Zeile 2"]);
    expect(bySlot(12).lore![1]![0]!.color).toBe("#ff5555");
  });

  it("item_name und Haltbarkeit der Spitzhacke", () => {
    const p = bySlot(17);
    expect(name(p)).toBe("Spitzhacke");
    expect(p.hasCustomName).toBe(false);
    expect(p.damage).toBe(1500);
  });

  it("Glint-Override und Trank mit eigenen Effekten", () => {
    expect(bySlot(18).glint).toBe(true);
    expect(bySlot(21).details.join()).toContain("Speed II");
  });
});

describe("Spieler 26.3", () => {
  it("Alex: Overworld, Inventar, Rüstung aus equipment, Offhand, Enderkiste", () => {
    const { p, warnings } = player26("player-alex-string");
    expect(p.dimension).toBe("minecraft:overworld");
    expect(p.pos).toEqual({ x: 120.5, y: -60, z: -340.25 });
    expect(p.health).toBeCloseTo(6.24, 1);
    expect(p.maxHealth).toBe(20);
    expect(p.xpLevel).toBe(30);
    expect(p.gameMode).toBe("survival");
    expect(name(p.inventory.find((i) => i.slot === 0))).toBe("Excalibur");
    expect(p.inventory.find((i) => i.slot === 8)).toMatchObject({ id: "minecraft:torch", count: 23 });
    expect(p.armor.head).toMatchObject({ id: "minecraft:diamond_helmet", damage: 50, maxDamage: 363 });
    expect(p.armor.chest!.id).toBe("minecraft:netherite_chestplate");
    expect(p.armor.legs!.id).toBe("minecraft:iron_leggings");
    expect(p.armor.feet!.id).toBe("minecraft:netherite_boots");
    expect(p.offhand).toMatchObject({ id: "minecraft:shield", damage: 10 });
    expect(p.enderChest!.map((i) => i.slot)).toEqual([0, 26]);
    expect(p.effects.map((e) => e.id)).toContain("minecraft:speed");
    // keine Warnungen außer Hinweisen
    expect(warnings.filter((w) => w.level !== "info")).toEqual([]);
  });

  it("Bedrock-artiger Spieler im Nether", () => {
    const { p } = player26("player-bedrock-string");
    expect(p.dimension).toBe("minecraft:the_nether");
    expect(p.pos.x).toBeCloseTo(-45.7);
    expect(p.inventory.map((i) => i.id)).toEqual(expect.arrayContaining(["minecraft:golden_sword", "minecraft:netherrack"]));
    expect(p.xpLevel).toBe(3);
  });

  it("Steve im End mit Elytra", () => {
    const { p } = player26("player-steve-string");
    expect(p.dimension).toBe("minecraft:the_end");
    expect(p.armor.chest).toMatchObject({ id: "minecraft:elytra", damage: 300, maxDamage: 432 });
  });

  it("Rüstungsständer: equipment mit mainhand", () => {
    const c = collectingWarn();
    const dump = parseEntityDump(fixture263("entity-armor-stand-string"), c.warn);
    expect(dump.kind).toBe("ok");
    if (dump.kind === "ok") {
      const eq = dump.nbt.equipment as SnbtCompound;
      expect(Object.keys(eq).sort()).toEqual(["chest", "feet", "head", "legs", "mainhand", "offhand"]);
    }
  });
});

describe("Altes Format", () => {
  it("1.20.4: tag, Count, Rüstung in Slots 100–103, Offhand -106", () => {
    const { p, warnings } = legacy("player-1.20.4.snbt");
    expect(p.dimension).toBe("minecraft:the_nether");
    expect(p.maxHealth).toBe(24);
    expect(p.gameMode).toBe("creative");
    const sword = p.inventory.find((i) => i.slot === 0)!;
    expect(name(sword)).toBe("Excalibur");
    expect(sword.enchantments.map((e) => e.level)).toEqual([5, 3]);
    expect(sword.damage).toBe(120);
    expect(sword.lore!.map(segmentsToPlain)).toEqual(["Alte Lore"]);
    const shulker = p.inventory.find((i) => i.slot === 9)!;
    expect(name(shulker)).toBe("Lager");
    expect(shulker.contents!.map((i) => [i.slot, i.count])).toEqual([[0, 32], [13, 3]]);
    expect(p.inventory.find((i) => i.slot === 10)!.storedEnchantments[0]!.level).toBe(4);
    expect(p.inventory.find((i) => i.slot === 11)!.details).toContain("Trank: Strong Healing");
    expect(p.inventory.find((i) => i.slot === 12)!.details).toEqual(expect.arrayContaining(["Gefärbt: #ff0000"]));
    expect(p.inventory.find((i) => i.slot === 13)!.unbreakable).toBe(true);
    expect(p.armor).toMatchObject({
      feet: { id: "minecraft:iron_boots", damage: 10 },
      legs: { id: "minecraft:iron_leggings" },
      chest: { id: "minecraft:elytra", damage: 400 },
      head: { id: "minecraft:turtle_helmet", maxDamage: 275 },
    });
    expect(p.offhand!.id).toBe("minecraft:shield");
    expect(p.inventory.every((i) => i.slot >= 0 && i.slot <= 35)).toBe(true);
    expect(p.effects[0]).toMatchObject({ amplifier: 1, duration: 200 });
    expect(warnings.filter((w) => w.level !== "info")).toEqual([]);
  });

  it("1.21.4: components mit levels-Wrapper, JSON-Namen, Slots 100–103", () => {
    const { p } = legacy("player-1.21.4.snbt");
    const pick = p.inventory.find((i) => i.slot === 0)!;
    expect(name(pick)).toBe("Spitzi");
    expect(pick.name[0]!.italic).toBeUndefined();
    expect(pick.enchantments.map((e) => e.id).sort()).toEqual(["minecraft:efficiency", "minecraft:fortune"]);
    expect(pick.unbreakable).toBe(true);
    expect(name(p.inventory.find((i) => i.slot === 1))).toBe("Tagebuch");
    expect(p.inventory.find((i) => i.slot === 2)!.contents![0]!.id).toBe("minecraft:emerald");
    const stone = p.inventory.find((i) => i.slot === 3)!;
    expect(stone.lore![0]![0]).toMatchObject({ text: "Zeile", color: "#5555ff" });
    expect(stone.details).toContain("Gefärbt: #0000ff");
    expect(p.armor.chest).toMatchObject({ id: "minecraft:diamond_chestplate", damage: 5, maxDamage: 528 });
    expect(p.offhand!.id).toBe("minecraft:totem_of_undying");
    expect(p.enderChest).toEqual([]);
    expect(p.effects[0]!.duration).toBe(-1);
  });

  it("unbekannte Felder/Komponenten erzeugen Hinweise statt Absturz", () => {
    const c = collectingWarn();
    const v = parseSnbt('{Pos:[0d,0d,0d],Dimension:"x:y",Health:1f,NeuesFeld:1,Inventory:[{Slot:0b,id:"minecraft:stone",count:1,components:{"minecraft:zukunft":{a:1}}},{Slot:1b,count:3},"kaputt"]}').value as SnbtCompound;
    const p = parsePlayer(v, { warn: c.warn });
    expect(p.inventory).toHaveLength(1);
    expect(c.list.map((w) => w.key)).toEqual(
      expect.arrayContaining(["unknown-player-field:NeuesFeld", "unknown-component:zukunft", "item-no-id:Inventory[1]", "item-not-compound:Inventory[2]"]),
    );
  });
});
