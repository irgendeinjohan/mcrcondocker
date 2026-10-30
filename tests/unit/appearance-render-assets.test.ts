import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { itemAppearance } from "../../src/shared/appearance.js";
import { RenderAssets } from "../../src/server/render-assets.js";
import { parseItem } from "../../src/server/parse/items.js";
import { collectingWarn } from "../../src/server/parse/diagnostics.js";
import { parseSnbt } from "../../src/server/parse/snbt.js";

const directories: string[] = [];
const temp = () => { const directory = mkdtempSync(path.join(tmpdir(), "mcdash-render-test-")); directories.push(directory); return directory; };
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("component appearance", () => {
  it("normalizes legacy dyes, trims, potions, patterns, and custom model data", () => {
    const result = itemAppearance({}, { display: { color: 255 }, Trim: { material: "minecraft:gold", pattern: "minecraft:coast" }, CustomModelData: 7, Potion: "minecraft:healing", CustomPotionColor: 0xff0000, BlockEntityTag: { Base: 11, Patterns: [{ Pattern: "cs", Color: 0 }] } });
    expect(result?.components).toMatchObject({ dyed_color: 255, trim: { material: "minecraft:gold" }, custom_model_data: 7, potion_contents: { potion: "minecraft:healing", custom_color: 0xff0000 }, base_color: "blue", banner_patterns: [{ pattern: "minecraft:stripe_center", color: "white" }] });
  });
  it("preserves modern component data while excluding custom data, names, and arbitrary skin URLs", () => {
    const texture = "b".repeat(64);
    const profile = (url: string) => ({ properties: [{ name: "textures", value: Buffer.from(JSON.stringify({ textures: { SKIN: { url } } })).toString("base64") }] });
    const appearance = itemAppearance({ profile: profile(`https://textures.minecraft.net/texture/${texture}`), dyed_color: { rgb: 0xff0000 }, trim: { material: "minecraft:diamond" }, custom_data: { private: "excluded" }, custom_name: "Preserve this name" });
    expect(appearance?.skin).toBe(texture);
    expect(appearance?.components).toEqual({ dyed_color: { rgb: 0xff0000 }, trim: { material: "minecraft:diamond" } });
    expect(itemAppearance({ profile: profile("https://example.com/skin.png") })).toBeUndefined();
    expect(itemAppearance({ profile: { properties: [{ name: "textures", value: "invalid" }] } })).toBeUndefined();
    expect(itemAppearance({ custom_model_data: { strings: ["x".repeat(40000)] } })?.components.custom_model_data).not.toContain("x".repeat(40000));
  });
  it("passes parsed SNBT appearance through the inventory API model", () => {
    const raw = parseSnbt('{id:"minecraft:leather_chestplate",count:1,components:{"minecraft:dyed_color":16711680,"minecraft:trim":{material:"minecraft:gold",pattern:"minecraft:coast"}}}').value;
    const item = parseItem(raw, { warn: collectingWarn().warn });
    expect(item?.appearance?.components).toMatchObject({ dyed_color: 0xff0000, trim: { pattern: "minecraft:coast" } });
  });
});

describe("local renderer asset boundary", () => {
  it("indexes local packs in priority order and cannot read arbitrary paths", () => {
    const bundled = temp(), user = temp();
    const write = (root: string, relative: string, content: string) => { const file = path.join(root, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, content); };
    const item = "assets/minecraft/items/stick.json";
    write(path.join(bundled, "vanilla"), item, '{"base":true}');
    write(path.join(user, "resourcepacks", "10-base"), item, '{"first":true}');
    write(path.join(user, "resourcepacks", "90-override"), item, '{"override":true}');
    write(user, "private.env", "not exposed");
    const renderer = new RenderAssets(user, bundled);
    try {
      expect(renderer.info()).toMatchObject({ enabled: true, custom: true, version: "26.3" });
      expect(renderer.read(item)?.toString()).toBe('{"override":true}');
      expect(renderer.read("../../private.env")).toBeNull();
      expect(renderer.read("private.env")).toBeNull();
      expect(renderer.read("assets/minecraft/items/../private.env")).toBeNull();
      expect(renderer.skin("../../private.env")).toBeNull();
      expect(renderer.info().files).not.toContain("private.env");
    } finally { renderer.close(); }
  });
});
