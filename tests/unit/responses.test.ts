import { describe, expect, it } from "vitest";
import { collectingWarn } from "../../src/server/parse/diagnostics.js";
import { parseEntityDump, parseList, parseMspt, parsePathValue, parseTps } from "../../src/server/parse/responses.js";
import { fixture, fixture263 } from "./helpers.js";

describe("/list", () => {
  it("leere Liste (26.3)", () => {
    const { warn } = collectingWarn();
    expect(parseList(fixture263("list-uuids-empty"), warn)).toEqual({ online: 0, max: 20, players: [] });
  });

  it("3 Spieler mit UUIDs inkl. Bedrock-Präfix (26.3)", () => {
    const { warn, list } = collectingWarn();
    const r = parseList(fixture263("list-uuids-3-players"), warn)!;
    expect(r.online).toBe(3);
    expect(r.players).toEqual([
      { name: ".Bedrock_Spieler", uuid: "56200adf-8d4f-3ab8-a2f1-df8fa1001b8d" },
      { name: "Steve_Java", uuid: "65366474-7912-31ba-8ffe-0c2eab803f9e" },
      { name: "Alex", uuid: "36532b5e-c442-3dbb-a24c-c7e55d0f979a" },
    ]);
    expect(list).toEqual([]);
  });

  it("Namen ohne UUIDs (/list)", () => {
    const { warn } = collectingWarn();
    expect(parseList(fixture263("list-3-players"), warn)!.players.map((p) => p.name)).toEqual([".Bedrock_Spieler", "Steve_Java", "Alex"]);
  });

  it("Bedrock-Namen mit Leerzeichen, Komma und Klammern", () => {
    const { warn } = collectingWarn();
    const body =
      "There are 3 of a max of 20 players online: .Steve Bedrock (00000000-0000-0000-0009-01f5f0fa4c3b), Jo, hann (aa) (36532b5e-c442-3dbb-a24c-c7e55d0f979a), Alex (65366474-7912-31ba-8ffe-0c2eab803f9e)";
    expect(parseList(body, warn)!.players).toEqual([
      { name: ".Steve Bedrock", uuid: "00000000-0000-0000-0009-01f5f0fa4c3b" },
      { name: "Jo, hann (aa)", uuid: "36532b5e-c442-3dbb-a24c-c7e55d0f979a" },
      { name: "Alex", uuid: "65366474-7912-31ba-8ffe-0c2eab803f9e" },
    ]);
  });

  it("unlesbare Antwort → null + Warnung", () => {
    const { warn, list } = collectingWarn();
    expect(parseList("Irgendwas anderes", warn)).toBeNull();
    expect(list[0]!.key).toBe("list-unreadable");
  });
});

describe("/tps und /mspt", () => {
  it("tps (26.3)", () => {
    const { warn } = collectingWarn();
    const tps = parseTps(fixture263("tps"), warn)!;
    expect(tps).toHaveLength(3);
    tps.forEach((t) => expect(t).toBeGreaterThan(0));
  });

  it("tps mit Stern bei >20", () => {
    const { warn } = collectingWarn();
    expect(parseTps("§6TPS from last 1m, 5m, 15m: §a*20.0, §a19.5, §e15.2", warn)).toEqual([20, 19.5, 15.2]);
  });

  it("mspt (26.3)", () => {
    const { warn } = collectingWarn();
    const m = parseMspt(fixture263("mspt"), warn)!;
    expect(m).toHaveLength(3);
    expect(m[0]!.max).toBeGreaterThanOrEqual(m[0]!.avg);
  });
});

describe("Entity-Antworten", () => {
  it("string-Umweg liefert vollständige Spielerdaten (26.3)", () => {
    const { warn, list } = collectingWarn();
    const r = parseEntityDump(fixture263("player-alex-string"), warn);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.truncated).toBe(false);
      expect(r.nbt.Dimension).toBe("minecraft:overworld");
    }
    expect(list).toEqual([]);
  });

  it("abgeschnittene data-get-Ausgabe wird erkannt (26.3)", () => {
    const { warn, list } = collectingWarn();
    const r = parseEntityDump(fixture263("player-alex-pretty-truncated"), warn);
    expect(r.kind === "ok" && r.truncated).toBe(true);
    expect(list.map((w) => w.key)).toContain("entity-truncated");
  });

  it("vollständige hübsche Ausgabe (älteres Format)", () => {
    const { warn } = collectingWarn();
    const r = parseEntityDump(fixture("legacy/pretty-complete.txt"), warn);
    expect(r.kind === "ok" && r.nbt.Name).toBe('Ein "Zitat"');
  });

  it("Spieler nicht gefunden (26.3)", () => {
    const { warn } = collectingWarn();
    expect(parseEntityDump(fixture263("error-string-player-not-found"), warn).kind).toBe("not_found");
  });

  it("unbekannte Antwort → error + Warnung", () => {
    const { warn, list } = collectingWarn();
    expect(parseEntityDump("Unknown or incomplete command", warn).kind).toBe("error");
    expect(list[0]!.level).toBe("error");
  });

  it("Einzelwerte (Rückfallweg, 26.3)", () => {
    expect(parsePathValue(fixture263("player-alex-path-pos"))).toEqual([120.5, -60, -340.25]);
    expect(parsePathValue(fixture263("player-alex-path-dimension"))).toBe("minecraft:overworld");
    expect(parsePathValue(fixture263("player-alex-path-xplevel"))).toBe(30);
  });
});
