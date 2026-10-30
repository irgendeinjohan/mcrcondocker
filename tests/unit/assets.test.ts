import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { Assets } from "../../src/server/assets.js";
import { ZipReader } from "../../src/server/zip.js";

/** Minimaler ZIP-Schreiber nur für Tests */
function makeZip(files: Record<string, Buffer>, deflate = true): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const comp = deflate ? deflateRawSync(data) : data;
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const PNG_A = Buffer.from("89504e470d0a1a0a-A", "utf8");
const PNG_B = Buffer.from("89504e470d0a1a0a-B", "utf8");

describe("Assets", () => {
  it("liest Texturen und en_us.json direkt aus der Client-.jar", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mcdash-assets-"));
    writeFileSync(
      path.join(dir, "26.3.jar"),
      makeZip({
        "assets/minecraft/textures/item/diamond_sword.png": PNG_A,
        "assets/minecraft/textures/block/stone.png": PNG_B,
        "assets/minecraft/textures/item/clock_00.png": PNG_B,
        "assets/minecraft/lang/en_us.json": Buffer.from(JSON.stringify({ "item.minecraft.diamond_sword": "Diamond Sword" })),
      }),
    );
    const a = new Assets(dir);
    expect(a.info()).toMatchObject({ textures: "jar", textureSource: "26.3.jar", language: "en_us" });
    expect(a.icon("minecraft:diamond_sword")).toEqual(PNG_A);
    expect(a.icon("minecraft:stone")).toEqual(PNG_B); // Block-Textur als Ersatz
    expect(a.icon("minecraft:clock")).toEqual(PNG_B); // Alias
    expect(a.icon("minecraft:unbekannt")).toBeNull();
    expect(a.icon("../../etc/passwd")).toBeNull();
    expect(a.translate("item.minecraft.diamond_sword")).toBe("Diamond Sword");
  });

  it("entpackter Ordner und deutsche Sprachdatei haben Vorrang", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mcdash-assets-"));
    mkdirSync(path.join(dir, "textures", "item"), { recursive: true });
    writeFileSync(path.join(dir, "textures", "item", "apple.png"), PNG_A);
    writeFileSync(path.join(dir, "de_de.json"), JSON.stringify({ "item.minecraft.apple": "Apfel" }));
    const a = new Assets(dir);
    expect(a.info()).toMatchObject({ textures: "folder", language: "de_de" });
    expect(a.icon("minecraft:apple")).toEqual(PNG_A);
    expect(a.translate("item.minecraft.apple")).toBe("Apfel");
  });

  it("ohne Ordner: keine Texturen, kein Absturz", () => {
    const a = new Assets("/gibt/es/nicht");
    expect(a.info()).toEqual({ textures: null, textureSource: null, language: null, translations: 0 });
    expect(a.icon("minecraft:stone")).toBeNull();
  });

  it("prefers rendered inventory icons, respects overrides, and isolates namespaces", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mcdash-rendered-"));
    const fallback = mkdtempSync(path.join(tmpdir(), "mcdash-bundled-"));
    for (const base of [dir, fallback]) mkdirSync(path.join(base, "icons", "minecraft"), { recursive: true });
    mkdirSync(path.join(dir, "icons", "custom"), { recursive: true });
    mkdirSync(path.join(dir, "textures", "block"), { recursive: true });
    mkdirSync(path.join(fallback, "gui"), { recursive: true });
    writeFileSync(path.join(dir, "icons", "minecraft", "chest.png"), PNG_A);
    writeFileSync(path.join(fallback, "icons", "minecraft", "chest.png"), PNG_B);
    writeFileSync(path.join(fallback, "icons", "minecraft", "shield.png"), PNG_B);
    writeFileSync(path.join(dir, "icons", "custom", "chest.png"), PNG_B);
    writeFileSync(path.join(dir, "textures", "block", "chest_front.png"), PNG_B);
    writeFileSync(path.join(fallback, "gui", "food_half.png"), PNG_A);
    const assets = new Assets(dir, "de_de", undefined, fallback);
    expect(assets.info().textures).toBe("rendered");
    expect(assets.icon("minecraft:chest")).toEqual(PNG_A);
    expect(assets.icon("chest")).toEqual(PNG_A);
    expect(assets.icon("custom:chest")).toEqual(PNG_B);
    expect(assets.icon("other:chest")).toBeNull();
    expect(assets.icon("minecraft:shield")).toEqual(PNG_B);
    expect(assets.icon("minecraft:../chest")).toBeNull();
    expect(assets.gui("food_half")).toEqual(PNG_A);
    expect(assets.gui("../../etc/passwd")).toBeNull();
  });

  it("loads game names per language with English fallback and no arbitrary file access", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mcdash-locales-"));
    mkdirSync(path.join(dir, "lang"), { recursive: true });
    writeFileSync(path.join(dir, "lang", "en_us.json"), JSON.stringify({ "item.minecraft.apple": "Apple", "item.minecraft.shield": "Shield" }));
    writeFileSync(path.join(dir, "lang", "de_de.json"), JSON.stringify({ "item.minecraft.apple": "Apfel" }));
    const assets = new Assets(dir);
    expect(assets.translations("de")).toMatchObject({ "item.minecraft.apple": "Apfel", "item.minecraft.shield": "Shield" });
    expect(assets.items("en")).toContainEqual({ id: "apple", name: "Apple" });
    expect(assets.items("de")).toContainEqual({ id: "apple", name: "Apfel" });
    expect(assets.translations("../../secrets")).toEqual(assets.translations("en"));
  });

  it("ZipReader liest auch unkomprimierte Einträge", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mcdash-zip-"));
    const f = path.join(dir, "x.zip");
    writeFileSync(f, makeZip({ "a.txt": Buffer.from("Hallo Wält") }, false));
    const z = new ZipReader(f);
    expect(z.get("a.txt")!.toString()).toBe("Hallo Wält");
    expect(z.get("fehlt")).toBeNull();
    z.close();
  });
});
