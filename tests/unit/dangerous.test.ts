import { describe, expect, it } from "vitest";
import { dangerousReason } from "../../src/shared/dangerous.js";

describe("gefährliche Befehle", () => {
  it.each(["stop", "/stop", "minecraft:stop", "OP Alex", "ban Alex", "whitelist off", "kill @e", "bukkit:reload confirm", "data modify entity @s Pos set value [0d,0d,0d]", "execute as @a run kill @s", "execute in minecraft:the_nether run execute as @a run clear @s"])(
    "%s braucht Bestätigung",
    (cmd) => expect(dangerousReason(cmd)).not.toBeNull(),
  );

  it.each(["list", "tps", "say Hallo", "data get entity Alex", "execute as @a run say hi", "time query daytime", "tp Alex 0 64 0", ""])(
    "%s ist harmlos",
    (cmd) => expect(dangerousReason(cmd)).toBeNull(),
  );

  it("eigene Erweiterung per Konfiguration", () => {
    expect(dangerousReason("tp Alex 0 0 0", ["tp"])).not.toBeNull();
  });
});
