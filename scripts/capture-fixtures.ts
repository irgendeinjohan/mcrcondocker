// Zeichnet echte RCON-Antworten eines Testservers als Fixtures auf.
// Aufruf: RCON_PASSWORD=... tsx scripts/capture-fixtures.ts <ausgabeordner> [szenario]
// Szenarien: world (Standard), players
// Siehe docs/testserver.md
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { RconClient } from "../src/server/rcon/client.js";

interface Step {
  cmd: string;
  /** Dateiname (ohne Endung); ohne Namen wird nur ausgeführt */
  save?: string;
  note?: string;
}

const C = "0 -59 0"; // Truhe mit Beispiel-Items
const BIG = "3 -59 0"; // Truhe mit großer Antwort (> 4096 Bytes)

const items: string[] = [
  `minecraft:diamond_sword[enchantments={sharpness:5,unbreaking:3,mending:1},custom_name={text:"Excalibur",color:"gold",italic:false},damage=120]`,
  `minecraft:cobblestone 64`,
  `minecraft:shulker_box[container=[{slot:0,item:{id:"minecraft:diamond",count:32}},{slot:5,item:{id:"minecraft:golden_apple",count:3}},{slot:26,item:{id:"minecraft:netherite_pickaxe",count:1,components:{"minecraft:enchantments":{efficiency:5}}}}],custom_name="Lager"]`,
  `minecraft:enchanted_book[stored_enchantments={protection:4,feather_falling:4}]`,
  `minecraft:potion[potion_contents={potion:"minecraft:strong_healing"}]`,
  `minecraft:written_book[written_book_content={title:"Tagebuch",author:"Johan",pages:["Seite 1","Seite 2"]}]`,
  `minecraft:player_head[profile={name:"Notch"}]`,
  `minecraft:leather_chestplate[dyed_color=16711680,trim={material:"minecraft:gold",pattern:"minecraft:coast"}]`,
  `minecraft:bow[unbreakable={},enchantments={power:5,infinity:1}]`,
  `minecraft:bundle[bundle_contents=[{id:"minecraft:arrow",count:16},{id:"minecraft:torch",count:5}]]`,
  `minecraft:filled_map[map_id=7]`,
  `minecraft:firework_rocket[fireworks={flight_duration:2}] 16`,
  `minecraft:stone[custom_name="Ümläut ✓ 🎉 Name",lore=["Zeile 1",{text:"Zeile 2",color:"red"}]] 3`,
  `minecraft:elytra[damage=400]`,
  `minecraft:trident[enchantments={loyalty:3,impaling:5}]`,
  `minecraft:tipped_arrow[potion_contents={potion:"minecraft:poison"}] 8`,
  `minecraft:white_banner[banner_patterns=[{pattern:"minecraft:creeper",color:"black"}]]`,
  `minecraft:diamond_pickaxe[item_name="Spitzhacke",enchantments={efficiency:5,fortune:3},repair_cost=3,damage=1500]`,
  `minecraft:nether_star[enchantment_glint_override=true]`,
  `minecraft:paper[custom_data={foo:1b,bar:"baz"}]`,
  `minecraft:netherite_chestplate[trim={material:"minecraft:diamond",pattern:"minecraft:silence"},enchantments={protection:4}]`,
  `minecraft:potion[potion_contents={custom_color:255,custom_effects:[{id:"minecraft:speed",amplifier:1b,duration:600}]}]`,
  `minecraft:red_shulker_box`,
  `minecraft:golden_apple 7`,
  `minecraft:mace[enchantments={density:5,wind_burst:3}]`,
  `minecraft:spawner`,
  `minecraft:wolf_spawn_egg`,
];

// Langer Name + viele Verzauberungen, damit die Antwort sicher > 4096 Bytes wird
const bigItem = (i: number) =>
  `minecraft:netherite_sword[enchantments={sharpness:5,unbreaking:3,mending:1,looting:3,fire_aspect:2,knockback:2,sweeping_edge:3},custom_name={text:"Schwert Nummer ${i} mit einem sehr langen Namen ÄÖÜ äöü ß €",color:"aqua"},lore=["Zeile A ${i}","Zeile B ${i}"],damage=${i}]`;

const worldSteps: Step[] = [
  { cmd: "forceload add 0 0 16 16" },
  { cmd: "list", save: "list-empty" },
  { cmd: "list uuids", save: "list-uuids-empty" },
  { cmd: "tps", save: "tps" },
  { cmd: "mspt", save: "mspt" },
  { cmd: "setblock " + C + " minecraft:chest" },
  ...items.map((it, i) => ({ cmd: `item replace block ${C} container.${i} with ${it}`, note: it })),
  { cmd: `data get block ${C}`, save: "block-chest-items" },
  { cmd: `data get block ${C} Items[0]`, save: "block-chest-path-item0" },
  { cmd: `data modify storage mcdash:tmp s set string block ${C}`, save: "block-chest-items-string" },
  { cmd: "setblock " + BIG + " minecraft:chest" },
  ...Array.from({ length: 27 }, (_, i) => ({ cmd: `item replace block ${BIG} container.${i} with ${bigItem(i)}` })),
  { cmd: `data get block ${BIG}`, save: "block-chest-large" },
  { cmd: `data modify storage mcdash:tmp s set string block ${BIG}`, save: "block-chest-large-string" },
  {
    cmd:
      `summon minecraft:armor_stand 2 -59 2 {Tags:["dash"],CustomName:"Ständer",ShowArms:1b,equipment:{` +
      `head:{id:"minecraft:diamond_helmet",count:1,components:{"minecraft:enchantments":{protection:4}}},` +
      `chest:{id:"minecraft:elytra",count:1,components:{"minecraft:damage":100}},` +
      `legs:{id:"minecraft:iron_leggings",count:1},feet:{id:"minecraft:golden_boots",count:1},` +
      `mainhand:{id:"minecraft:diamond_sword",count:1},offhand:{id:"minecraft:shield",count:1}}}`,
  },
  { cmd: "data get entity @e[type=minecraft:armor_stand,tag=dash,limit=1]", save: "entity-armor-stand" },
  { cmd: "data get entity @e[type=minecraft:armor_stand,tag=dash,limit=1] equipment", save: "entity-armor-stand-equipment" },
  { cmd: "data modify storage mcdash:tmp s set string entity @e[type=minecraft:armor_stand,tag=dash,limit=1]", save: "entity-armor-stand-string" },
  { cmd: "data get entity @e[type=minecraft:armor_stand,tag=dash,limit=1] Foo", save: "error-no-such-path" },
  { cmd: "data modify storage mcdash:tmp s set string entity Nobody", save: "error-string-player-not-found" },
  { cmd: "data get entity Nobody", save: "error-player-not-found" },
  { cmd: "data get entity 00000000-0000-0000-0009-01f5f0fa4c3b", save: "error-uuid-not-found" },
  { cmd: "data get block 9999 0 9999", save: "error-not-loaded" },
  { cmd: "data get block 1 -59 1", save: "error-not-block-entity" },
  { cmd: "thiscommanddoesnotexist", save: "error-unknown-command" },
  { cmd: "data get entity", save: "error-incomplete-command" },
  { cmd: "say Hallo aus RCON", save: "say" },
  { cmd: "time query gametime", save: "time-query" },
  { cmd: "data get storage mcdash:tmp", save: "storage-after-world" },
  { cmd: "kill @e[type=minecraft:armor_stand,tag=dash]" },
];

// Benötigt die Testbots Alex, .Bedrock_Spieler, Steve_Java (siehe docs/testserver.md)
function playerSteps(uuids: Record<string, string>): Step[] {
  const alex = uuids["Alex"]!;
  const bedrock = uuids[".Bedrock_Spieler"]!;
  const steve = uuids["Steve_Java"]!;
  const inv = (u: string, slot: string, item: string) => ({ cmd: `item replace entity ${u} ${slot} with ${item}` });
  return [
    { cmd: "difficulty peaceful" },
    { cmd: "time set day" },
    { cmd: "gamemode survival @a" },
    { cmd: "clear @a" },
    // Alex: Overworld, volles Inventar, Rüstung, Offhand, Enderkiste
    { cmd: `execute in minecraft:overworld run tp ${alex} 120.5 -60 -340.25` },
    inv(alex, "hotbar.0", items[0]!),
    inv(alex, "hotbar.1", "minecraft:cobblestone 64"),
    inv(alex, "hotbar.4", items[2]!),
    inv(alex, "hotbar.8", "minecraft:torch 23"),
    inv(alex, "inventory.0", items[3]!),
    inv(alex, "inventory.13", items[12]!),
    inv(alex, "inventory.26", items[9]!),
    inv(alex, "armor.head", `minecraft:diamond_helmet[enchantments={protection:4,respiration:3},damage=50]`),
    inv(alex, "armor.chest", items[20]!),
    inv(alex, "armor.legs", "minecraft:iron_leggings"),
    inv(alex, "armor.feet", `minecraft:netherite_boots[enchantments={feather_falling:4,depth_strider:3}]`),
    inv(alex, "weapon.offhand", "minecraft:shield[damage=10]"),
    inv(alex, "enderchest.0", items[4]!),
    inv(alex, "enderchest.26", "minecraft:diamond_block 64"),
    { cmd: `execute as ${alex} run xp set @s 30 levels` },
    { cmd: `execute as ${alex} run xp set @s 50 points` },
    { cmd: `damage ${alex} 7 minecraft:generic` },
    { cmd: `effect give ${alex} minecraft:hunger 5 120 true` },
    { cmd: `effect give ${alex} minecraft:speed 600 1` },
    // Bedrock-artiger Name: Nether
    { cmd: `execute in minecraft:the_nether run tp ${bedrock} -45.7 70 812.3` },
    inv(bedrock, "hotbar.0", "minecraft:golden_sword"),
    inv(bedrock, "inventory.5", "minecraft:netherrack 12"),
    { cmd: `execute as ${bedrock} run xp set @s 3 levels` },
    // Steve: End
    { cmd: `execute in minecraft:the_end run tp ${steve} 100.5 50 0.5` },
    inv(steve, "hotbar.3", items[13]!),
    inv(steve, "armor.chest", "minecraft:elytra[damage=300]"),
    { cmd: "list", save: "list-3-players" },
    { cmd: "list uuids", save: "list-uuids-3-players" },
    // Hauptweg: kompaktes SNBT über die Fehlermeldung der string-Quelle
    ...Object.entries({ alex, bedrock, steve }).flatMap(([n, u]) => [
      { cmd: `data modify storage mcdash:tmp s set string entity ${u}`, save: `player-${n}-string` },
      { cmd: `xp set ${u} 1 levels`, save: n === "alex" ? "error-xp-uuid-selector" : undefined },
      { cmd: `data get entity ${u}`, save: `player-${n}-pretty-truncated` },
    ]),
    // Einzelwerte (Rückfallweg)
    { cmd: `data get entity ${alex} Pos`, save: "player-alex-path-pos" },
    { cmd: `data get entity ${alex} Dimension`, save: "player-alex-path-dimension" },
    { cmd: `data get entity ${alex} Health`, save: "player-alex-path-health" },
    { cmd: `data get entity ${alex} foodLevel`, save: "player-alex-path-food" },
    { cmd: `data get entity ${alex} XpLevel`, save: "player-alex-path-xplevel" },
    { cmd: `data get entity ${alex} SelectedItemSlot`, save: "player-alex-path-selected" },
    { cmd: `data get entity ${alex} equipment`, save: "player-alex-path-equipment-truncated" },
    { cmd: `data modify storage mcdash:tmp s set string entity ${alex} equipment`, save: "player-alex-string-equipment" },
    { cmd: `data modify storage mcdash:tmp s set string entity ${alex} Inventory`, save: "player-alex-string-inventory" },
    { cmd: `data modify storage mcdash:tmp s set string entity ${alex} EnderItems`, save: "player-alex-string-enderitems" },
    { cmd: "data get storage mcdash:tmp", save: "storage-after" },
  ];
}

const scenario = process.argv[3] ?? "world";
const outDir = process.argv[2] ?? "tests/fixtures/26.3";

mkdirSync(outDir, { recursive: true });
const indexFile = path.join(outDir, "index.json");
const index: Record<string, unknown> = existsSync(indexFile)
  ? JSON.parse(readFileSync(indexFile, "utf8"))
  : {};

const client = new RconClient({
  host: process.env.RCON_HOST ?? "127.0.0.1",
  port: Number(process.env.RCON_PORT ?? 25575),
  password: process.env.RCON_PASSWORD ?? "",
  commandTimeoutMs: 20_000,
});
client.start();
await client.waitForConnected();
let steps: Step[];
if (scenario === "world") steps = worldSteps;
else if (scenario === "players") {
  const list = await client.send("list uuids");
  const uuids: Record<string, string> = {};
  for (const m of list.body.matchAll(/(?:: |, )(.+?) \(([0-9a-f-]{36})\)/g)) uuids[m[1]!] = m[2]!;
  console.log("Spieler:", uuids);
  steps = playerSteps(uuids);
} else if (scenario === "custom") {
  // einzelne Fixtures: … custom name1="befehl 1" name2="befehl 2"
  steps = process.argv.slice(4).map((arg) => {
    const i = arg.indexOf("=");
    return { save: arg.slice(0, i), cmd: arg.slice(i + 1) };
  });
} else throw new Error("unbekanntes Szenario " + scenario);
for (const step of steps) {
  const r = await client.send(step.cmd);
  const short = r.body.length > 160 ? r.body.slice(0, 160) + "…" : r.body;
  console.log(`> ${step.cmd.slice(0, 100)}\n  [${r.fragments} Paket(e), ${r.bytes} B] ${JSON.stringify(short)}`);
  if (step.save) {
    writeFileSync(path.join(outDir, step.save + ".txt"), r.body);
    index[step.save] = {
      command: step.cmd,
      fragments: r.fragments,
      bytes: r.bytes,
      capturedAt: new Date(r.receivedAt).toISOString(),
    };
  } else if (/^(Unknown|Incorrect|Invalid|Expected)/.test(r.body) || /<--\[HERE\]/.test(r.body)) {
    console.error("  !! Setup-Befehl fehlgeschlagen");
    process.exitCode = 1;
  }
}
writeFileSync(indexFile, JSON.stringify(index, null, 2) + "\n");
client.stop();
