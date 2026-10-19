import { describe, expect, it } from "vitest";
import { buildAction } from "../../src/server/actions.js";
import { looksLikeError, parseBanlist, parseDifficulty, parseGamerule, parseLastNumber, parseTest, parseTimeline, parseTimeQuery } from "../../src/server/parse/world.js";

describe("Welt-Antworten", () => {
  it("Gamerule-Abfrage", () => {
    expect(parseGamerule("Gamerule keep_inventory is currently set to: false")).toBe(false);
    expect(parseGamerule("Gamerule playersSleepingPercentage is currently set to: 50")).toBe(50);
    expect(parseGamerule("Incorrect argument for command\n...gamerule foo<--[HERE]")).toBeNull();
    expect(parseGamerule("Unknown or incomplete command. See below for error")).toBeNull();
  });

  it("Zeit, Schwierigkeit, Prädikat", () => {
    expect(parseTimeQuery("The time is 13042")).toBe(13042);
    expect(parseTimeQuery("Can't find element 'minecraft:daytime' of type 'minecraft:timeline'\n...ry daytime<--[HERE]")).toBeNull();
    expect(parseTimeline("Timeline minecraft:day is at 4839 tick(s)")).toBe(4839);
    expect(parseLastNumber("Timeline minecraft:day is at repetition 12")).toBe(12);
    expect(parseDifficulty("The difficulty is Hard")).toBe("hard");
    expect(parseDifficulty("§cIrgendwas")).toBeNull();
    expect(parseTest("Test passed")).toBe(true);
    expect(parseTest("Test failed")).toBe(false);
    expect(parseTest("Unknown or incomplete command")).toBeNull();
  });

  it("Bann-Liste mit und ohne Zeilenumbrüche", () => {
    const expected = [
      { target: "Griefer123", source: "Rcon", reason: "Hat das Dorf angezündet." },
      { target: ".Bedrock_Spieler", source: "Johan", reason: "Banned by an operator." },
    ];
    expect(parseBanlist("There are 2 ban(s):\nGriefer123 was banned by Rcon: Hat das Dorf angezündet.\n.Bedrock_Spieler was banned by Johan: Banned by an operator.")).toEqual(expected);
    expect(parseBanlist("There are 2 ban(s):Griefer123 was banned by Rcon: Hat das Dorf angezündet..Bedrock_Spieler was banned by Johan: Banned by an operator.")).toEqual(expected);
    expect(parseBanlist("There are no bans")).toEqual([]);
  });

  it("Fehlermeldungen erkennen", () => {
    expect(looksLikeError("No player was found")).toBe(true);
    expect(looksLikeError("Unknown item 'minecraft:foo'")).toBe(true);
    expect(looksLikeError("Nothing changed. The player isn't banned")).toBe(true);
    expect(looksLikeError("Set Alex's game mode to Creative Mode")).toBe(false);
    expect(looksLikeError("")).toBe(false);
    expect(looksLikeError("Only players may be affected by this command, but the provided selector includes entities\nmsg x<--[HERE]")).toBe(true);
    expect(looksLikeError("Failed to parse structure: No key type in MapLike[{}]")).toBe(true);
  });
});

describe("Aktionen → Befehle", () => {
  const ctx = { nameOf: (u: string) => (u.startsWith("0") ? ".Bedrock_Spieler" : null) };
  const u = "00000000-0000-0000-0009-01f5f0fa4c3b";

  it("lässt keine eigenen Befehle durch", () => {
    expect(() => buildAction({ type: "gamemode", uuid: `${u} @a`, mode: "creative" }, ctx)).toThrow();
    expect(() => buildAction({ type: "gamemode", uuid: u, mode: "creative @a" }, ctx)).toThrow();
    expect(() => buildAction({ type: "give", uuid: u, item: "stone 64\nop x", count: 1 }, ctx)).toThrow();
    expect(() => buildAction({ type: "tp_coords", uuid: u, dimension: "minecraft:overworld run stop", x: 0, y: 0, z: 0 }, ctx)).toThrow();
    expect(() => buildAction({ type: "pardon_ip", ip: "1.2.3.4 x" }, ctx)).toThrow();
    expect(() => buildAction({ type: "irgendwas" }, ctx)).toThrow();
    expect(() => buildAction(null, ctx)).toThrow();
  });

  it("Ban/OP per Name, ohne bekannten Namen abgelehnt", () => {
    expect(buildAction({ type: "op", uuid: u }, ctx).commands).toEqual(["op .Bedrock_Spieler"]);
    expect(() => buildAction({ type: "op", uuid: "36532b5e-c442-3dbb-a24c-c7e55d0f979a" }, ctx)).toThrow();
  });

  it("Gründe werden einzeilig, gefährliche Aktionen markiert", () => {
    const b = buildAction({ type: "kick", uuid: u, reason: "AFK\nzu lange" }, ctx);
    expect(b.commands).toEqual([`execute as ${u} run kick @s AFK zu lange`]);
    expect(b.confirm).toBeTruthy();
    expect(buildAction({ type: "heal", uuid: u }, ctx).confirm).toBeNull();
    expect(buildAction({ type: "difficulty", difficulty: "hard" }, ctx).confirm).toBeTruthy();
  });
});
