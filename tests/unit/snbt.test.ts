import { describe, expect, it } from "vitest";
import { parseLiteral, parseSnbt } from "../../src/server/parse/snbt.js";
import { fixture263 } from "./helpers.js";

describe("parseSnbt", () => {
  it("liest kompaktes SNBT mit allen Zahlentypen", () => {
    const r = parseSnbt('{a:1b,b:2s,c:3,d:4L,e:1.5f,f:-2.25d,g:"x",h:[1,2],i:[I;1,-2,3],j:[B;1b,0b],k:[L;5L],l:{}}');
    expect(r.error).toBeUndefined();
    expect(r.value).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 1.5, f: -2.25, g: "x", h: [1, 2], i: [1, -2, 3], j: [1, 0], k: [5], l: {} });
  });

  it("liest die hübsche Ausgabe mit Leerzeichen", () => {
    const r = parseSnbt('{Pos: [1.5d, 64.0d, -3.25d], Name: "Alex", tags: []}');
    expect(r.value).toEqual({ Pos: [1.5, 64, -3.25], Name: "Alex", tags: [] });
  });

  it("versteht Escapes und beide Anführungszeichen", () => {
    const r = parseSnbt(`{a:'Ständer "mit" Zitat',b:"it\\'s",c:"x\\\\y",d:"\\u00e4\\n"}`);
    expect(r.value).toEqual({ a: 'Ständer "mit" Zitat', b: "it's", c: "x\\y", d: "ä\n" });
  });

  it("liest gequotete Schlüssel mit Namespace und Punkt-Schlüssel", () => {
    const r = parseSnbt('{"minecraft:damage":120,Bukkit.updateLevel:2,Paper.Origin:[1.0d]}');
    expect(r.value).toEqual({ "minecraft:damage": 120, "Bukkit.updateLevel": 2, "Paper.Origin": [1] });
  });

  it("true/false und unquotierte Strings", () => {
    expect(parseSnbt("[true,false,stone,a.b_c-1]").value).toEqual([true, false, "stone", "a.b_c-1"]);
  });

  it("Zahlenformate", () => {
    expect(parseLiteral("0b")).toBe(0);
    expect(parseLiteral("1b")).toBe(1);
    expect(parseLiteral("-4954509687468663612L")).toBeCloseTo(-4954509687468663612);
    expect(parseLiteral("1.0E-5")).toBeCloseTo(0.00001);
    expect(parseLiteral(".5f")).toBe(0.5);
    expect(parseLiteral("0x1F")).toBe(31);
    expect(parseLiteral("1_000")).toBe(1000);
    expect(parseLiteral("12ub")).toBe(12);
    expect(parseLiteral("abc")).toBe("abc");
  });

  it("gibt bei abgeschnittener Ausgabe (...) Teilergebnis zurück", () => {
    const r = parseSnbt("{seenCredits: 0b, DeathTime: 0s, recipeBook: {...");
    expect(r.truncated).toBe(true);
    expect(r.value).toEqual({ seenCredits: 0, DeathTime: 0, recipeBook: {} });
  });

  it("gibt bei kaputtem SNBT Fehlerposition und Teilergebnis zurück, ohne zu werfen", () => {
    const r = parseSnbt("{a:1,b:[1,2,{c:3}],d:?}");
    expect(r.error?.pos).toBeGreaterThan(0);
    expect(r.value).toEqual({ a: 1, b: [1, 2, { c: 3 }] });
  });

  it("nicht abgeschlossener String", () => {
    const r = parseSnbt('{Slot: 0b, id: "minecraft:diamond_sword", count: 1, components: {"...');
    expect(r.truncated).toBe(true);
    expect(r.value).toEqual({ Slot: 0, id: "minecraft:diamond_sword", count: 1, components: {} });
  });

  it("dupliziert keine Compound-Elemente in Listen", () => {
    const r = parseSnbt("[{a:1},{a:2}]");
    expect(r.value).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("kein Prototype-Pollution über __proto__-Schlüssel", () => {
    const r = parseSnbt('{"__proto__":{x:1}}');
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(Object.keys(r.value as object)).toEqual(["__proto__"]);
  });

  it("liest die große 26.3-Truhe (3 RCON-Pakete) vollständig", () => {
    const body = fixture263("block-chest-large-string");
    const r = parseSnbt(body, body.indexOf("got ") + 4);
    expect(r.error).toBeUndefined();
    expect(r.end).toBe(body.length);
    const items = (r.value as { Items: unknown[] }).Items;
    expect(items).toHaveLength(27);
    // Umlaute/€ an Paketgrenzen unversehrt
    expect(body).not.toContain("�");
  });
});
