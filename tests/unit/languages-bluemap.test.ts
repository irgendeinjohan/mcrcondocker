import { describe, expect, it } from "vitest";
import { normalizeBlueMapUrl } from "../../src/shared/bluemap.js";
import { ENGLISH, resolveLocale, translate } from "../../src/shared/translations.js";
import { dangerousReason } from "../../src/shared/dangerous.js";
import { buildAction } from "../../src/server/actions.js";

const player = "36532b5e-c442-3dbb-a24c-c7e55d0f979a";

describe("dashboard languages", () => {
  it("selects supported browser languages and falls back to English", () => {
    expect(resolveLocale("de-DE")).toBe("de");
    expect(resolveLocale("en_US")).toBe("en");
    expect(resolveLocale("el-GR")).toBe("en");
    expect(resolveLocale(null)).toBe("en");
  });

  it("interpolates values once without interpreting user content as translation keys", () => {
    expect(translate("en", "Inventar")).toBe("Inventory");
    expect(translate("de", "Inventar")).toBe("Inventar");
    expect(translate("en", "Fehler {status}", { status: 401 })).toBe("Error 401");
    expect(translate("en", "Nachricht an {player}: {text}", { player: "Welt", text: "{player} <script>" }))
      .toBe("Message to Welt: {player} <script>");
    expect(translate("en", "unknown.key")).toBe("unknown.key");
    expect(translate("en", "constructor")).toBe("constructor");
    expect(translate("en", "__proto__")).toBe("__proto__");
    expect(translate("en", "{constructor}")).toBe("{constructor}");
  });

  it("keeps every interpolation parameter in English translations", () => {
    const params = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const [german, english] of Object.entries(ENGLISH)) expect(params(english), german).toEqual(params(german));
  });

  it("localizes action confirmations without changing commands or player names", () => {
    const ctx = { nameOf: () => "Inventar" };
    const german = buildAction({ type: "clear", uuid: player }, ctx, "de");
    const english = buildAction({ type: "clear", uuid: player }, ctx, "en");
    expect(english.commands).toEqual(german.commands);
    expect(english.label).toBe("Cleared Inventar’s inventory");
    expect(english.confirm).toBe("The entire inventory of Inventar will be deleted.");
    expect(dangerousReason("execute as @a run stop", [], 0, "en")).toBe("“stop” is classified as dangerous (inside execute … run)");
  });
});

describe("BlueMap URL validation", () => {
  it("preserves subpaths, ports, queries, and BlueMap camera fragments", () => {
    expect(normalizeBlueMapUrl(" https://map.example.com:8100/world/?x=1&z=2#world:0:0:0 "))
      .toBe("https://map.example.com:8100/world/?x=1&z=2#world:0:0:0");
    expect(normalizeBlueMapUrl("http://192.168.1.5:8100")).toBe("http://192.168.1.5:8100/");
    expect(normalizeBlueMapUrl(null)).toBeNull();
    expect(normalizeBlueMapUrl("")).toBeNull();
  });

  it.each([undefined, {}, 7, "//map.example.com", "/bluemap/", "javascript:alert(1)", "data:text/html,x", "ftp://map.example.com", "https://user:secret@map.example.com", "https://map.example.com/\r\nheader", "https://map.example.com/a b", "x".repeat(2049)])("rejects unsafe input %j", (input) => {
    expect(() => normalizeBlueMapUrl(input)).toThrow();
  });
});
