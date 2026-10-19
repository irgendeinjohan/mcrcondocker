// Optionale Item-Texturen und Sprachdateien aus dem Volume.
// Unterstützt (in dieser Reihenfolge):
//  1. entpackte Ordner:  <assets>/textures/{item,block}/*.png
//                    oder <assets>/assets/minecraft/textures/{item,block}/*.png
//  2. die Client-.jar:   <assets>/*.jar  (z. B. aus .minecraft/versions/26.3/26.3.jar)
// Sprachdatei: <assets>/lang/<sprache>.json oder <assets>/<sprache>.json
// (Standard de_de), sonst en_us.json aus der .jar.
// Es wird nichts aus dem Internet geladen und nichts mitgeliefert.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ItemInfo } from "../shared/types.js";
import { ZipReader } from "./zip.js";

const SAFE_ID = /^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/;
const ALIASES: Record<string, string[]> = {
  compass: ["compass_00"],
  recovery_compass: ["recovery_compass_00"],
  clock: ["clock_00"],
  crossbow: ["crossbow_standby"],
  light: ["light_00"],
  bow: ["bow"],
};

/** Blöcke ohne eigenes Item (Wandvarianten, Flüssigkeiten, technische Blöcke) */
const NOT_ITEMS =
  /^(?:air|cave_air|void_air|water|lava|fire|soul_fire|moving_piston|piston_head|nether_portal|end_portal|end_gateway|bubble_column|frosted_ice|tall_seagrass|kelp_plant|bamboo_sapling|sweet_berry_bush|cocoa|carrots|potatoes|beetroots|melon_stem|pumpkin_stem|attached_.*|potted_.*|.*_wall_(?:torch|sign|banner|head|skull|fan|hanging_sign)|wall_torch|.*_cauldron|redstone_wire|tripwire|big_dripleaf_stem|cave_vines_plant|twisting_vines_plant|weeping_vines_plant|.*_candle_cake|structure_void|jigsaw|test_block|test_instance_block)$/;

export interface AssetsInfo {
  textures: "folder" | "jar" | null;
  textureSource: string | null;
  language: string | null;
  translations: number;
}

export class Assets {
  private folders: string[] = [];
  private jar: ZipReader | null = null;
  private cache = new Map<string, Buffer | null>();
  private lang: Record<string, string> = {};
  private langName: string | null = null;
  private log: (msg: string) => void;

  constructor(private readonly dir: string, private readonly language = "de_de", log?: (msg: string) => void) {
    this.log = log ?? (() => {});
    this.load();
  }

  private load(): void {
    if (!existsSync(this.dir)) return;
    for (const base of [path.join(this.dir, "textures"), path.join(this.dir, "assets", "minecraft", "textures")]) {
      if (existsSync(path.join(base, "item")) || existsSync(path.join(base, "block"))) this.folders.push(base);
    }
    let jars: string[] = [];
    try {
      jars = readdirSync(this.dir)
        .filter((f) => f.toLowerCase().endsWith(".jar"))
        .map((f) => path.join(this.dir, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    } catch {
      /* Ordner nicht lesbar */
    }
    for (const j of jars) {
      try {
        const z = new ZipReader(j);
        if (z.has("assets/minecraft/textures/item/diamond_sword.png") || z.has("assets/minecraft/lang/en_us.json")) {
          this.jar = z;
          this.log(`Texturen aus ${path.basename(j)} geladen`);
          break;
        }
        z.close();
      } catch (e) {
        this.log(`${path.basename(j)} konnte nicht gelesen werden: ${(e as Error).message}`);
      }
    }
    // Sprachdatei
    const candidates = [path.join(this.dir, "lang", `${this.language}.json`), path.join(this.dir, `${this.language}.json`)];
    for (const c of candidates) {
      if (existsSync(c)) {
        try {
          this.lang = JSON.parse(readFileSync(c, "utf8"));
          this.langName = this.language;
          break;
        } catch (e) {
          this.log(`Sprachdatei ${c} ungültig: ${(e as Error).message}`);
        }
      }
    }
    if (!this.langName && this.jar) {
      const en = this.jar.get("assets/minecraft/lang/en_us.json");
      if (en) {
        try {
          this.lang = JSON.parse(en.toString("utf8"));
          this.langName = "en_us";
        } catch {
          /* ignorieren */
        }
      }
    }
  }

  info(): AssetsInfo {
    return {
      textures: this.folders.length ? "folder" : this.jar ? "jar" : null,
      textureSource: this.folders[0] ? path.relative(this.dir, this.folders[0]) || "." : this.jar ? path.basename(this.jar.file) : null,
      language: this.langName,
      translations: Object.keys(this.lang).length,
    };
  }

  translate = (key: string): string | undefined => this.lang[key];

  private itemList: ItemInfo[] | null = null;

  /**
   * Items für die Auswahl beim Geben, aus der Sprachdatei abgeleitet
   * (item.minecraft.* und block.minecraft.*). Ohne Sprachdatei leer.
   */
  items(): ItemInfo[] {
    if (this.itemList) return this.itemList;
    const byId = new Map<string, string>();
    for (const [key, name] of Object.entries(this.lang)) {
      const m = /^(item|block)\.minecraft\.([a-z0-9_]+)$/.exec(key);
      if (!m || NOT_ITEMS.test(m[2]!)) continue;
      // Item-Namen haben Vorrang (z. B. bei Samen/Pflanzen)
      if (m[1] === "item" || !byId.has(m[2]!)) byId.set(m[2]!, name);
    }
    this.itemList = [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "de"));
    return this.itemList;
  }

  /** PNG für eine Item-ID oder null */
  icon(id: string): Buffer | null {
    if (!SAFE_ID.test(id) || id.includes("..")) return null;
    const name = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
    if (this.cache.has(name)) return this.cache.get(name)!;
    const names = [...(ALIASES[name] ?? []), name];
    const rel: string[] = [];
    for (const n of names) rel.push(`item/${n}.png`);
    for (const n of names) rel.push(`block/${n}.png`, `block/${n}_front.png`, `block/${n}_side.png`, `block/${n}_top.png`);
    let found: Buffer | null = null;
    outer: for (const r of rel) {
      for (const f of this.folders) {
        const p = path.join(f, r);
        if (existsSync(p)) {
          found = readFileSync(p);
          break outer;
        }
      }
      if (this.jar) {
        const b = this.jar.get(`assets/minecraft/textures/${r}`);
        if (b) {
          found = b;
          break;
        }
      }
    }
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(name, found);
    return found;
  }
}
