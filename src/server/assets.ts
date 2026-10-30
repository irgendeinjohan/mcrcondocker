// Local Minecraft assets: user-rendered icons override the bundled vanilla pack.
// Raw texture folders and client JARs remain a fallback. No network I/O at runtime.
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
  textures: "rendered" | "folder" | "jar" | null;
  textureSource: string | null;
  language: string | null;
  translations: number;
}

export class Assets {
  private folders: string[] = [];
  private rendered: string[] = [];
  private roots: string[];
  private languages = new Map<string, Record<string, string>>();
  private jar: ZipReader | null = null;
  private cache = new Map<string, Buffer | null>();
  private lang: Record<string, string> = {};
  private langName: string | null = null;
  private log: (msg: string) => void;

  constructor(private readonly dir: string, private readonly language = "de_de", log?: (msg: string) => void, fallbackDir?: string) {
    this.roots = [dir, ...(fallbackDir ? [fallbackDir] : [])];
    this.log = log ?? (() => {});
    this.load();
  }

  private load(): void {
    for (const root of this.roots) {
      const icons = path.join(root, "icons");
      if (existsSync(icons)) this.rendered.push(icons);
    }
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
    const candidates = this.roots.flatMap((root) => [path.join(root, "lang", `${this.language}.json`), path.join(root, `${this.language}.json`)]);
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
      textures: this.rendered.length ? "rendered" : this.folders.length ? "folder" : this.jar ? "jar" : null,
      textureSource: this.rendered[0] ? "icons" : this.folders[0] ? path.relative(this.dir, this.folders[0]) || "." : this.jar ? path.basename(this.jar.file) : null,
      language: this.langName,
      translations: Object.keys(this.lang).length,
    };
  }

  translate = (key: string): string | undefined => this.lang[key];

  /** English fallback plus the requested game language; never accepts a file path. */
  translations(locale: string): Record<string, string> {
    const language = locale === "de" ? "de_de" : "en_us";
    if (this.languages.has(language)) return this.languages.get(language)!;
    const read = (name: string): Record<string, string> => {
      const candidates = this.roots.flatMap((root) => [path.join(root, "lang", `${name}.json`), path.join(root, `${name}.json`)]);
      for (const file of candidates) {
        try {
          const data: unknown = JSON.parse(readFileSync(file, "utf8"));
          if (data && typeof data === "object" && !Array.isArray(data)) {
            return Object.fromEntries(Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
          }
        } catch { /* Try the next source. */ }
      }
      try { return JSON.parse(this.jar?.get(`assets/minecraft/lang/${name}.json`)?.toString("utf8") ?? "{}"); }
      catch { return {}; }
    };
    const result = { ...read("en_us"), ...read(language) };
    this.languages.set(language, result);
    return result;
  }

  /** Item catalog, localized per request. Rendered IDs restrict it to actual items. */
  items(locale?: string): ItemInfo[] {
    const lang = locale ? this.translations(locale) : this.lang;
    const byId = new Map<string, string>();
    for (const [key, name] of Object.entries(lang)) {
      const m = /^(item|block)\.minecraft\.([a-z0-9_]+)$/.exec(key);
      if (!m || NOT_ITEMS.test(m[2]!)) continue;
      if (m[1] === "item" || !byId.has(m[2]!)) byId.set(m[2]!, name);
    }
    if (this.rendered.length) {
      const ids = new Set<string>();
      for (const dir of this.rendered) {
        try { for (const file of readdirSync(path.join(dir, "minecraft"))) if (/^[a-z0-9_]+\.png$/.test(file)) ids.add(file.slice(0, -4)); }
        catch { /* A namespace may be absent. */ }
      }
      for (const id of byId.keys()) if (!ids.has(id)) byId.delete(id);
      for (const id of ids) if (!byId.has(id)) byId.set(id, id.replaceAll("_", " "));
    }
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, locale === "de" ? "de" : "en"));
  }

  gui(name: string): Buffer | null {
    if (!/^(?:(?:health|food)_(?:full|half|empty)|slot_(?:head|chest|legs|feet|offhand))$/.test(name)) return null;
    for (const root of this.roots) {
      const file = path.join(root, "gui", `${name}.png`);
      if (existsSync(file)) return readFileSync(file);
    }
    return null;
  }

  /** PNG für eine Item-ID oder null */
  icon(id: string): Buffer | null {
    if (!SAFE_ID.test(id) || id.includes("..")) return null;
    const [namespace, name] = id.includes(":") ? id.split(":") as [string, string] : ["minecraft", id];
    const key = `${namespace}:${name}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    for (const dir of this.rendered) {
      const file = path.join(dir, namespace, `${name}.png`);
      if (existsSync(file)) {
        const bytes = readFileSync(file);
        this.cache.set(key, bytes);
        return bytes;
      }
    }
    // A modded item must never borrow a vanilla texture or collide in the cache.
    if (namespace !== "minecraft") {
      for (const root of this.roots) {
        const file = path.join(root, "assets", namespace, "textures", "item", `${name}.png`);
        if (existsSync(file)) return readFileSync(file);
      }
      return null;
    }
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
    this.cache.set(key, found);
    return found;
  }
}
