import { describe, expect, it } from "vitest";
import { componentToPlain, componentToSegments, parseLegacy, prettifyId, stripLegacy } from "../../src/shared/mctext.js";
import { fixture263 } from "./helpers.js";

describe("§-Codes", () => {
  it("entfernt Codes aus /tps", () => {
    expect(stripLegacy(fixture263("tps"))).toMatch(/^TPS from last 1m, 5m, 15m: [\d.]+, [\d.]+, [\d.]+\n$/);
  });

  it("zerlegt Farben und Formatierung", () => {
    const segs = parseLegacy("§6Gold §lfett§r normal");
    expect(segs).toEqual([
      { text: "Gold ", color: "#ffaa00" },
      { text: "fett", color: "#ffaa00", bold: true },
      { text: " normal" },
    ]);
  });

  it("Hex-Farben im Bungee-Format", () => {
    expect(parseLegacy("§x§1§2§3§4§5§6Hex")).toEqual([{ text: "Hex", color: "#123456" }]);
  });

  it("mspt mit Unicode-Zeichen", () => {
    expect(stripLegacy(fixture263("mspt"))).toContain("◴");
  });
});

describe("Text-Komponenten", () => {
  it("SNBT-Compound (ab 1.21.5)", () => {
    expect(componentToSegments({ text: "Excalibur", color: "gold", italic: 0 })).toEqual([{ text: "Excalibur", color: "#ffaa00" }]);
  });

  it("JSON-String (bis 1.21.4)", () => {
    expect(componentToPlain('{"text":"Spitzi","extra":[{"text":"!","color":"red"}]}')).toBe("Spitzi!");
  });

  it("einfacher String und gemischte Liste mit Wrapper", () => {
    expect(componentToPlain("Lager")).toBe("Lager");
    expect(componentToPlain([{ "": "a" }, { text: "b" }])).toBe("ab");
  });

  it("translate mit und ohne Sprachdatei", () => {
    expect(componentToPlain({ translate: "item.minecraft.diamond_sword" })).toBe("Diamond Sword");
    const t = (k: string) => (k === "x.y" ? "Hallo %s und %s" : undefined);
    expect(componentToPlain({ translate: "x.y", with: ["A", { text: "B" }] }, t)).toBe("Hallo A und B");
    expect(componentToPlain({ translate: "nope", fallback: "Ersatz" })).toBe("Ersatz");
  });

  it("prettifyId", () => {
    expect(prettifyId("minecraft:netherite_sword")).toBe("Netherite Sword");
  });
});
