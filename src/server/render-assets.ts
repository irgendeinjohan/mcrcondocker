// Index only renderable game files. User packs take priority; nothing is fetched from arbitrary URLs.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ZipReader } from "./zip.js";
import type { RenderIndex } from "../shared/appearance.js";

const SAFE = /^assets\/[a-z0-9_.-]+\/(?:models|items|textures|atlases|blockstates)\/[a-zA-Z0-9_./-]+\.(?:json|png|png\.mcmeta)$/;
interface Entry { file?: string; zip?: ZipReader; entry?: string }
export class RenderAssets {
  private files = new Map<string, Entry>();
  private zips: ZipReader[] = [];
  private version: string;
  private custom = false;
  private revision: string;
  constructor(private readonly userDir: string, bundledDir: string, version = "26.3") {
    this.version = version;
    const sources: string[] = [];
    this.folder(path.join(bundledDir, "vanilla"), sources);
    // The user may supply a matching client JAR as the vanilla base.
    if (existsSync(userDir)) for (const file of readdirSync(userDir).filter((file) => file.endsWith(".jar")).sort()) this.archive(path.join(userDir, file), sources);
    this.folder(userDir, sources);
    if (existsSync(path.join(userDir, "assets"))) this.custom = true;
    const packs = path.join(userDir, "resourcepacks");
    if (existsSync(packs)) for (const file of readdirSync(packs).sort()) {
      const pack = path.join(packs, file);
      if (file.endsWith(".zip")) { this.archive(pack, sources); this.custom = true; }
      else if (statSync(pack).isDirectory()) { this.folder(pack, sources); this.custom = true; }
    }
    this.revision = createHash("sha256").update(sources.join("\n")).digest("hex").slice(0, 24);
  }
  private folder(root: string, sources: string[]) {
    const base = path.join(root, "assets");
    if (!existsSync(base)) return;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) walk(file);
        else {
          const relative = path.relative(root, file).split(path.sep).join("/");
          if (!SAFE.test(relative) || relative.includes("..") || entry.name === "_list.json") continue;
          const stat = statSync(file);
          if (stat.size > 16 * 1024 * 1024) continue;
          this.files.set(relative, { file });
          sources.push(`${file}:${stat.size}:${stat.mtimeMs}`);
        }
      }
    };
    walk(base);
  }
  private archive(file: string, sources: string[]) {
    const zip = new ZipReader(file);
    this.zips.push(zip);
    const stat = statSync(file); sources.push(`${file}:${stat.size}:${stat.mtimeMs}`);
    for (const name of zip.names()) if (SAFE.test(name) && !name.includes("..") && !name.endsWith("/_list.json") && (zip.size(name) ?? Infinity) <= 16 * 1024 * 1024) this.files.set(name, { zip, entry: name });
  }
  info(): RenderIndex { return { enabled: [...this.files.keys()].some((file) => file.startsWith("assets/minecraft/items/") || file.startsWith("assets/minecraft/models/item/")), version: this.version, revision: this.revision, files: [...this.files.keys()].sort(), custom: this.custom, skins: existsSync(path.join(this.userDir, "skins")) ? readdirSync(path.join(this.userDir, "skins")).filter((file) => /^[a-f0-9]{64}\.png$/.test(file)).map((file) => file.slice(0, -4)) : [] }; }
  read(name: string): Buffer | null {
    if (!SAFE.test(name) || name.includes("..")) return null;
    const entry = this.files.get(name);
    if (!entry) return null;
    const content = entry.file ? readFileSync(entry.file) : entry.zip!.get(entry.entry!)!;
    return content.length <= 16 * 1024 * 1024 ? content : null;
  }
  skin(hash: string): Buffer | null {
    if (!/^[a-f0-9]{64}$/.test(hash)) return null;
    const file = path.join(this.userDir, "skins", `${hash}.png`);
    if (!existsSync(file) || statSync(file).size > 1024 * 1024) return null;
    const bytes = readFileSync(file);
    if (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return null;
    return bytes;
  }
  close(): void { for (const zip of this.zips) zip.close(); }
}
