import { describe, expect, it } from "vitest";
import matrix from "../fixtures/versions/matrix.json";
import { fixture } from "./helpers.js";
import { collectingWarn, Diagnostics } from "../../src/server/parse/diagnostics.js";
import { parsePlayer } from "../../src/server/parse/player.js";
import { parseEntityDump } from "../../src/server/parse/responses.js";
import { isCompound, parseSnbt } from "../../src/server/parse/snbt.js";
import { diagnostic, DIAGNOSTIC_MESSAGES, formatDiagnostic } from "../../src/shared/diagnostic-messages.js";

describe("versioned game-format matrix", () => {
  it.each(matrix)("parses $version ($provenance)", (test) => {
    const warnings = collectingWarn();
    const input = fixture(test.file);
    const parsed = test.response ? parseEntityDump(input, warnings.warn) : null;
    const nbt = parsed?.kind === "ok" ? parsed.nbt : parseSnbt(input).value;
    expect(isCompound(nbt)).toBe(true);
    if (!isCompound(nbt)) throw new Error("Invalid fixture");
    const player = parsePlayer(nbt, { warn: warnings.warn });
    expect(player.complete).toBe(true);
    expect(player.armor.head?.id).toBe(test.armor);
    expect(player.offhand?.id).toBe(test.offhand);
    expect(player.inventory.every((item) => item.slot >= 0 && item.slot <= 35)).toBe(true);
    const weapon = player.inventory.find((item) => item.id === test.weapon)!;
    expect(weapon.enchantments).toContainEqual(expect.objectContaining({ id: test.enchantment, level: test.level }));
    expect(weapon.name.map((segment) => segment.text).join("")).toBe(test.name);
    expect(warnings.list.filter((warning) => warning.level === "error")).toEqual([]);
  });
});

describe("structured parser diagnostics", () => {
  it("keeps stable message IDs, raw context, and refreshed parameters when deduplicating", () => {
    const diag = new Diagnostics();
    diag.warn("info", "one-key", diagnostic("listCountMismatch", { online: 4, parsed: 1 }), "raw <untranslated>");
    diag.warn("info", "one-key", diagnostic("listCountMismatch", { online: 5, parsed: 2 }));
    const warning = diag.getWarnings()[0]!;
    expect(warning.count).toBe(2);
    expect(warning.messageData?.id).toBe("listCountMismatch");
    expect(formatDiagnostic("en", warning.messageData!)).toBe("/list reports 5 players; parsed 2");
    expect(formatDiagnostic("de", warning.messageData!)).toBe("/list meldet 5 Spieler, gelesen wurden 2");
    expect(warning.context).toBe("raw <untranslated>");
  });
  it("preserves parameters in every language and translates nested SNBT failures", () => {
    const keys = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const [id, [de, en]] of Object.entries(DIAGNOSTIC_MESSAGES)) expect(keys(de), id).toEqual(keys(en));
    const failure = parseSnbt('{"key" 3}').error!;
    expect(formatDiagnostic("en", failure.messageData!)).toBe('Expected \':\' after key "key"');
  });
});
