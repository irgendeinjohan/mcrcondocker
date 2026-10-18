// Simulierte Welt für den Mock-Modus. Antworten entsprechen dem am echten
// Paper-26.3-Server gemessenen Format (tests/fixtures/26.3), optional im alten
// Format (MOCK_OLD_FORMAT=true).

function q(s: string): string {
  // wie StringTag.quoteAndEscape
  const quote = s.includes('"') && !s.includes("'") ? "'" : '"';
  return quote + s.replace(/\\/g, "\\\\").replace(new RegExp(quote, "g"), "\\" + quote).replace(/\n/g, "\\n") + quote;
}

interface MockItem {
  slot: number;
  /** SNBT ohne Slot, neues Format */
  snbt: string;
  /** SNBT ohne Slot, altes Format (1.20.4) */
  old: string;
}

const it = (slot: number, snbt: string, old?: string): MockItem => ({ slot, snbt, old: old ?? snbt.replace(/count:(\d+)/, "Count:$1b") });

const EXCALIBUR = `components:{"minecraft:custom_name":{color:"gold",italic:0b,text:"Excalibur"},"minecraft:damage":120,"minecraft:enchantments":{"minecraft:mending":1,"minecraft:sharpness":5,"minecraft:unbreaking":3}},count:1,id:"minecraft:diamond_sword"`;
const EXCALIBUR_OLD = `id:"minecraft:diamond_sword",Count:1b,tag:{Damage:120,Enchantments:[{id:"minecraft:sharpness",lvl:5s},{id:"minecraft:unbreaking",lvl:3s},{id:"minecraft:mending",lvl:1s}],display:{Name:'{"text":"Excalibur","color":"gold","italic":false}'}}`;
const SHULKER = `components:{"minecraft:container":[{item:{count:32,id:"minecraft:diamond"},slot:0},{item:{count:3,id:"minecraft:golden_apple"},slot:5},{item:{components:{"minecraft:enchantments":{"minecraft:efficiency":5}},id:"minecraft:netherite_pickaxe"},slot:26}],"minecraft:custom_name":"Lager"},count:1,id:"minecraft:shulker_box"`;
const SHULKER_OLD = `id:"minecraft:shulker_box",Count:1b,tag:{BlockEntityTag:{Items:[{Slot:0b,id:"minecraft:diamond",Count:32b},{Slot:5b,id:"minecraft:golden_apple",Count:3b},{Slot:26b,id:"minecraft:netherite_pickaxe",Count:1b,tag:{Enchantments:[{id:"minecraft:efficiency",lvl:5s}]}}]},display:{Name:'{"text":"Lager"}'}}`;

const ALEX_ITEMS: MockItem[] = [
  it(0, EXCALIBUR, EXCALIBUR_OLD),
  it(1, `count:64,id:"minecraft:cobblestone"`),
  it(2, `components:{"minecraft:damage":1500,"minecraft:enchantments":{"minecraft:efficiency":5,"minecraft:fortune":3},"minecraft:item_name":"Spitzhacke","minecraft:repair_cost":3},count:1,id:"minecraft:diamond_pickaxe"`,
    `id:"minecraft:diamond_pickaxe",Count:1b,tag:{Damage:1500,Enchantments:[{id:"minecraft:efficiency",lvl:5s},{id:"minecraft:fortune",lvl:3s}]}`),
  it(3, `count:16,id:"minecraft:cooked_beef"`),
  it(4, SHULKER, SHULKER_OLD),
  it(5, `components:{"minecraft:enchantments":{"minecraft:infinity":1,"minecraft:power":5},"minecraft:unbreakable":{}},count:1,id:"minecraft:bow"`,
    `id:"minecraft:bow",Count:1b,tag:{Unbreakable:1b,Enchantments:[{id:"minecraft:power",lvl:5s},{id:"minecraft:infinity",lvl:1s}]}`),
  it(6, `count:1,id:"minecraft:arrow"`),
  it(7, `count:23,id:"minecraft:torch"`),
  it(8, `count:7,id:"minecraft:golden_apple"`),
  it(9, `components:{"minecraft:stored_enchantments":{"minecraft:feather_falling":4,"minecraft:protection":4}},count:1,id:"minecraft:enchanted_book"`,
    `id:"minecraft:enchanted_book",Count:1b,tag:{StoredEnchantments:[{id:"minecraft:protection",lvl:4s},{id:"minecraft:feather_falling",lvl:4s}]}`),
  it(10, `components:{"minecraft:potion_contents":{potion:"minecraft:strong_healing"}},count:1,id:"minecraft:potion"`, `id:"minecraft:potion",Count:1b,tag:{Potion:"minecraft:strong_healing"}`),
  it(11, `components:{"minecraft:written_book_content":{author:"Johan",pages:[{raw:"Seite 1"},{raw:"Seite 2"}],title:{raw:"Tagebuch"}}},count:1,id:"minecraft:written_book"`,
    `id:"minecraft:written_book",Count:1b,tag:{title:"Tagebuch",author:"Johan",pages:['"Seite 1"','"Seite 2"']}`),
  it(12, `components:{"minecraft:profile":{name:"Notch"}},count:1,id:"minecraft:player_head"`, `id:"minecraft:player_head",Count:1b,tag:{SkullOwner:"Notch"}`),
  it(13, `components:{"minecraft:dyed_color":16711680,"minecraft:trim":{material:"minecraft:gold",pattern:"minecraft:coast"}},count:1,id:"minecraft:leather_chestplate"`,
    `id:"minecraft:leather_chestplate",Count:1b,tag:{display:{color:16711680},Trim:{material:"minecraft:gold",pattern:"minecraft:coast"}}`),
  it(14, `components:{"minecraft:bundle_contents":[{count:16,id:"minecraft:arrow"},{count:5,id:"minecraft:torch"}]},count:1,id:"minecraft:bundle"`),
  it(15, `components:{"minecraft:map_id":7},count:1,id:"minecraft:filled_map"`, `id:"minecraft:filled_map",Count:1b,tag:{map:7}`),
  it(16, `components:{"minecraft:fireworks":{flight_duration:2b}},count:16,id:"minecraft:firework_rocket"`, `id:"minecraft:firework_rocket",Count:16b,tag:{Fireworks:{Flight:2b}}`),
  it(17, `components:{"minecraft:custom_name":"Ümläut ✓ 🎉 Name","minecraft:lore":["Zeile 1",{color:"red",text:"Zeile 2"}]},count:3,id:"minecraft:stone"`,
    `id:"minecraft:stone",Count:3b,tag:{display:{Name:'{"text":"Ümläut ✓ 🎉 Name"}',Lore:['{"text":"Zeile 1"}','{"text":"Zeile 2","color":"red"}']}}`),
  it(20, `components:{"minecraft:damage":400},count:1,id:"minecraft:elytra"`, `id:"minecraft:elytra",Count:1b,tag:{Damage:400}`),
  it(21, `components:{"minecraft:enchantments":{"minecraft:impaling":5,"minecraft:loyalty":3}},count:1,id:"minecraft:trident"`,
    `id:"minecraft:trident",Count:1b,tag:{Enchantments:[{id:"minecraft:loyalty",lvl:3s},{id:"minecraft:impaling",lvl:5s}]}`),
  it(22, `count:1,id:"minecraft:nether_star"`),
  it(25, `count:64,id:"minecraft:oak_log"`),
  it(26, `count:64,id:"minecraft:oak_log"`),
  it(30, `components:{"minecraft:enchantments":{"minecraft:density":5,"minecraft:wind_burst":3}},count:1,id:"minecraft:mace"`),
  it(35, `count:12,id:"minecraft:ender_pearl"`),
];

interface Armor {
  head?: string;
  chest?: string;
  legs?: string;
  feet?: string;
  offhand?: string;
}

interface MockPlayer {
  name: string;
  uuid: string;
  uuidInts: string;
  dimension: string;
  pos: [number, number, number];
  health: number;
  food: number;
  xp: number;
  gameMode: number;
  items: MockItem[];
  armor: Armor;
  ender: MockItem[];
  /** zeitweise online: Periode/Onlinedauer in ms */
  schedule?: { period: number; online: number };
  speed: number;
}

const ARMOR_FULL: Armor = {
  head: `components:{"minecraft:damage":50,"minecraft:enchantments":{"minecraft:protection":4,"minecraft:respiration":3}},count:1,id:"minecraft:diamond_helmet"`,
  chest: `components:{"minecraft:enchantments":{"minecraft:protection":4},"minecraft:trim":{material:"minecraft:diamond",pattern:"minecraft:silence"}},count:1,id:"minecraft:netherite_chestplate"`,
  legs: `count:1,id:"minecraft:iron_leggings"`,
  feet: `components:{"minecraft:enchantments":{"minecraft:depth_strider":3,"minecraft:feather_falling":4}},count:1,id:"minecraft:netherite_boots"`,
  offhand: `components:{"minecraft:damage":10},count:1,id:"minecraft:shield"`,
};

function player(p: Omit<MockPlayer, "speed"> & { speed?: number }): MockPlayer {
  return { speed: 1.5, ...p };
}

export class MockWorld {
  private readonly started = Date.now();
  private tick = 0;
  readonly players: MockPlayer[] = [
    player({
      name: "Alex", uuid: "36532b5e-c442-3dbb-a24c-c7e55d0f979a", uuidInts: "[I;911420254,-1002291269,-1574893685,-1388806246]",
      dimension: "minecraft:overworld", pos: [120.5, 64, -340.25], health: 14.5, food: 18, xp: 30, gameMode: 0,
      items: ALEX_ITEMS, armor: ARMOR_FULL,
      ender: [it(0, `components:{"minecraft:potion_contents":{potion:"minecraft:strong_healing"}},count:1,id:"minecraft:potion"`), it(26, `count:64,id:"minecraft:diamond_block"`)],
    }),
    player({
      name: ".Steve Bedrock", uuid: "00000000-0000-0000-0009-01f5f0fa4c3b", uuidInts: "[I;0,0,589825,-168211397]",
      dimension: "minecraft:overworld", pos: [80, 70, -300], health: 20, food: 20, xp: 5, gameMode: 0,
      items: [it(0, `count:1,id:"minecraft:iron_sword"`), it(1, `count:32,id:"minecraft:bread"`), it(9, `count:64,id:"minecraft:dirt"`)],
      armor: { chest: `count:1,id:"minecraft:iron_chestplate"` }, ender: [],
    }),
    player({
      name: "NetherNinja", uuid: "65366474-7912-31ba-8ffe-0c2eab803f9e", uuidInts: "[I;1698063476,2031235514,-1879176148,-1430028385]",
      dimension: "minecraft:the_nether", pos: [-45.7, 70, 812.3], health: 8, food: 9, xp: 12, gameMode: 0,
      items: [it(0, `count:1,id:"minecraft:golden_sword"`), it(1, `count:12,id:"minecraft:netherrack"`), it(2, `count:1,id:"minecraft:flint_and_steel"`)],
      armor: { head: `count:1,id:"minecraft:golden_helmet"`, feet: `components:{"minecraft:enchantments":{"minecraft:soul_speed":3}},count:1,id:"minecraft:diamond_boots"` },
      ender: [], speed: 3,
    }),
    player({
      name: "EnderQueen", uuid: "0b4f6a3c-2d1e-4f5a-8b9c-7d6e5f4a3b2c", uuidInts: "[I;189749820,756961114,-1952679012,2104318764]",
      dimension: "minecraft:the_end", pos: [100.5, 50, 0.5], health: 20, food: 20, xp: 55, gameMode: 1,
      items: [it(3, `components:{"minecraft:damage":300},count:1,id:"minecraft:elytra"`), it(4, `count:64,id:"minecraft:firework_rocket"`)],
      armor: { chest: `components:{"minecraft:damage":300},count:1,id:"minecraft:elytra"` },
      ender: [], speed: 6,
    }),
    player({
      name: "Gelegenheitsspieler", uuid: "7c9e6679-7425-40de-944b-e07fc1f90ae7", uuidInts: "[I;2090755705,1948598494,-1807949697,-1040315673]",
      dimension: "minecraft:overworld", pos: [-500, 72, 200], health: 20, food: 20, xp: 1, gameMode: 0,
      items: [it(0, `count:1,id:"minecraft:wooden_pickaxe"`)], armor: {}, ender: [],
      schedule: { period: 120_000, online: 45_000 },
    }),
  ];

  constructor(private readonly oldFormat = false) {}

  private isOnline(p: MockPlayer, now = Date.now()): boolean {
    if (!p.schedule) return true;
    return (now - this.started) % p.schedule.period < p.schedule.online;
  }

  private advance(): void {
    this.tick++;
    for (const p of this.players) {
      const a = (this.tick * 0.3 + p.name.length) % (Math.PI * 2);
      p.pos[0] = Math.round((p.pos[0] + Math.cos(a) * p.speed) * 100) / 100;
      p.pos[2] = Math.round((p.pos[2] + Math.sin(a) * p.speed) * 100) / 100;
      p.pos[1] = Math.round((p.pos[1] + Math.sin(this.tick / 4) * 0.3) * 100) / 100;
      if (p.gameMode === 0 && this.tick % 3 === 0) {
        p.health = Math.max(1, Math.min(20, p.health + (Math.random() < 0.5 ? -1 : 1)));
        p.food = Math.max(0, Math.min(20, p.food + (Math.random() < 0.3 ? -1 : 0) + (p.food < 6 ? 6 : 0)));
      }
    }
  }

  private online(): MockPlayer[] {
    return this.players.filter((p) => this.isOnline(p));
  }

  private nbt(p: MockPlayer): string {
    const fmt = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
    const pos = `[${p.pos.map((v) => fmt(v) + "d").join(",")}]`;
    const items = (list: MockItem[]) => list.map((i) => (this.oldFormat ? `{Slot:${i.slot}b,${i.old}}` : `{Slot:${i.slot}b,${i.snbt}}`)).join(",");
    const common =
      `AbsorptionAmount:0.0f,Air:300s,Brain:{memories:{}},Bukkit.updateLevel:2,DataVersion:${this.oldFormat ? 3700 : 5023},DeathTime:0s,` +
      `Dimension:${q(p.dimension)},EnderItems:[${items(p.ender)}],FallFlying:0b,Fire:-20s,Health:${fmt(p.health)}f,HurtTime:0s,`;
    if (this.oldFormat) {
      const armorSlots: [keyof Armor, number][] = [["feet", 100], ["legs", 101], ["chest", 102], ["head", 103], ["offhand", -106]];
      const extra = armorSlots
        .filter(([k]) => p.armor[k])
        .map(([k, slot]) => `{Slot:${slot}b,${p.armor[k]!.replace(/count:(\d+)/, "Count:$1b").replace(/components:\{"minecraft:damage":(\d+)[^}]*\}/, "tag:{Damage:$1}")}}`);
      return `{${common}Inventory:[${[items(p.items), ...extra].filter(Boolean).join(",")}],Pos:${pos},Attributes:[{Name:"minecraft:generic.max_health",Base:20.0d}],XpLevel:${p.xp},XpP:0.25f,foodLevel:${p.food},foodSaturationLevel:2.0f,playerGameType:${p.gameMode},SelectedItemSlot:0,UUID:${p.uuidInts}}`;
    }
    const eq = (Object.keys(p.armor) as (keyof Armor)[]).map((k) => `${k}:{${p.armor[k]}}`).join(",");
    return (
      `{${common}Inventory:[${items(p.items)}],Invulnerable:0b,Motion:[0.0d,-0.0784000015258789d,0.0d],OnGround:1b,PortalCooldown:0,Pos:${pos},` +
      `Rotation:[${(this.tick * 7) % 360}.0f,0.0f],Score:0,SelectedItemSlot:0,SleepTimer:0s,UUID:${p.uuidInts},XpLevel:${p.xp},XpP:0.44642857f,XpSeed:0,XpTotal:0,` +
      `abilities:{flySpeed:0.05f,flying:0b,instabuild:${p.gameMode === 1 ? 1 : 0}b,invulnerable:${p.gameMode === 1 ? 1 : 0}b,mayBuild:1b,mayfly:${p.gameMode === 1 ? 1 : 0}b,walkSpeed:0.1f},` +
      `active_effects:[{amplifier:1b,duration:11996,id:"minecraft:speed",show_icon:1b}],` +
      `attributes:[{base:20.0d,id:"minecraft:max_health"},{base:0.10000000149011612d,id:"minecraft:movement_speed"}],` +
      `equipment:{${eq}},foodExhaustionLevel:0.0f,foodLevel:${p.food},foodSaturationLevel:2.0f,foodTickTimer:0,playerGameType:${p.gameMode},recipeBook:{},seenCredits:0b}`
    );
  }

  private find(target: string): MockPlayer | undefined {
    const t = target.toLowerCase();
    return this.online().find((p) => p.uuid === t || p.name.toLowerCase() === t);
  }

  handle(raw: string): string {
    const cmd = raw.trim().replace(/^\//, "");
    const lower = cmd.toLowerCase();
    if (lower === "list" || lower === "list uuids") {
      this.advance();
      const on = this.online();
      const names = on.map((p) => (lower === "list" ? p.name : `${p.name} (${p.uuid})`)).join(", ");
      return `There are ${on.length} of a max of 20 players online: ${names}`;
    }
    let m = /^data modify storage \S+ \S+ set string entity (\S+)$/i.exec(cmd);
    if (m) {
      const p = this.find(m[1]!);
      return p ? `Expected a value: got ${this.nbt(p)}` : "No entity was found";
    }
    m = /^data get entity (\S+)(?: (\S+))?$/i.exec(cmd);
    if (m) {
      const p = this.find(m[1]!);
      if (!p) return "No entity was found";
      const path = m[2];
      const v: Record<string, string> = {
        Pos: `[${p.pos.map((x) => x + "d").join(", ")}]`,
        Dimension: q(p.dimension),
        Health: `${p.health}f`,
        foodLevel: String(p.food),
        XpLevel: String(p.xp),
        playerGameType: String(p.gameMode),
      };
      if (!path) return `${p.name} has the following entity data: {Bukkit.updateLevel: 2, foodTickTimer: 0, AbsorptionAmount: 0.0f, XpTotal: 0, playerGameType: ${p.gameMode},...`;
      return v[path] !== undefined ? `${p.name} has the following entity data: ${v[path]}` : `Found no elements matching ${path}`;
    }
    if (lower === "tps") {
      const t = (19.2 + Math.random() * 0.8).toFixed(1);
      return `§6TPS from last 1m, 5m, 15m: §a${t}§r, §a20.0§r, §a20.0\n`;
    }
    if (lower === "mspt") {
      const a = (8 + Math.random() * 10).toFixed(1);
      return `§6Server tick times §e(§7avg§e/§7min§e/§7max§e)§6 from last 5s§7,§6 10s§7,§6 1m§e:\n§6◴ §a${a}§7/§a2.1§7/§e41.3§e, §a9.8§7/§a2.0§7/§e44.0§e, §a10.2§7/§a1.9§7/§c63.5\n`;
    }
    if (/^say /i.test(cmd)) return "";
    if (lower === "seed") return "Seed: [4046814556654922723]";
    if (lower === "time query gametime") return `The game time is ${Math.floor((Date.now() - this.started) / 50)} tick(s)`;
    if (/^weather (clear|rain|thunder)/i.test(cmd)) return `Set the weather to ${cmd.split(" ")[1]}`;
    if (lower === "stop") return "Stopping the server (Mock – es passiert nichts)";
    if (/^(kick|ban|op|deop) \S+/i.test(cmd)) {
      const p = this.find(cmd.split(" ")[1]!);
      return p ? `${cmd.split(" ")[0]} ${p.name}: Mock – keine Wirkung` : "No player was found";
    }
    if (lower === "version") return "§fThis server is running Paper version 26.3-205-main@a90108f (Mock)\n";
    if (lower === "help") return "§e--------- §fHelp: Index (1/42) §e--------------------\n§7Use /help [n] to get page n of help.\n§6Aliases: §fLists command aliases\n§6Bukkit: §fAll commands for Bukkit";
    if (lower === "colors") return "§0schwarz §1dunkelblau §2dunkelgrün §3dunkeltürkis §4dunkelrot §5lila §6gold §7grau §8dunkelgrau §9blau §agrün §btürkis §crot §dpink §egelb §fweiß §lfett§r §oKursiv§r §nunterstrichen§r §mdurchgestrichen§r §x§f§f§8§8§0§0Hex-Orange";
    const word = cmd.split(" ")[0] ?? cmd;
    return `Unknown or incomplete command. See below for error\n${word}<--[HERE]`;
  }
}
