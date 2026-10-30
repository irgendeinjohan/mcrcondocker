// Download a reproducible, local-only vanilla icon pack. Never runs at server startup.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ZipReader } from "../src/server/zip.js";

const ICON_REV = "bc96011714c0eb3770bd641a3b86459ad5f860c7"; // Minecraft 26.3 release
const ICON_SHA256 = "e874e9aa63cad67ec1c3a2366866aa5c333006f309146c1b34b7bc1a6ba1d553";
const GAME_REV = "6c088630459d8ca369ef0d6c07636d7d63a3b0f1"; // 26.3 assets + languages
const destination = path.resolve(process.argv[2] || "game-assets");
const gameBase = `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/${GAME_REV}/assets/minecraft`;
const gui: Record<string, string> = {
  health_full: "hud/heart/full", health_half: "hud/heart/half", health_empty: "hud/heart/container",
  food_full: "hud/food_full", food_half: "hud/food_half", food_empty: "hud/food_empty",
  slot_head: "container/slot/helmet", slot_chest: "container/slot/chestplate",
  slot_legs: "container/slot/leggings", slot_feet: "container/slot/boots", slot_offhand: "container/slot/shield",
};
const PNG = Buffer.from("89504e470d0a1a0a", "hex");

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 64 * 1024 * 1024) throw new Error("Asset download exceeds 64 MiB");
  return bytes;
}
async function save(relative: string, bytes: Buffer) {
  const file = path.join(destination, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, bytes);
  await rename(`${file}.tmp`, file);
}
function assertPng(bytes: Buffer, name: string) {
  if (!bytes.subarray(0, 8).equals(PNG)) throw new Error(`Not a PNG: ${name}`);
}

const temporary = await mkdtemp(path.join(tmpdir(), "mcdash-icons-"));
try {
  console.log("Downloading Minecraft 26.3 inventory icons …");
  const archive = await download(`https://codeload.github.com/Owen1212055/mc-assets/zip/${ICON_REV}`);
  if (createHash("sha256").update(archive).digest("hex") !== ICON_SHA256) throw new Error("Icon archive checksum mismatch");
  const zipPath = path.join(temporary, "icons.zip");
  await writeFile(zipPath, archive);
  const zip = new ZipReader(zipPath);
  let count = 0;
  try {
    for (const entry of zip.names()) {
      const match = /^[^/]+\/item-assets\/([A-Z0-9_]+)\.png$/.exec(entry);
      if (!match) continue;
      const bytes = zip.get(entry)!;
      assertPng(bytes, entry);
      await save(`icons/minecraft/${match[1]!.toLowerCase()}.png`, bytes);
      count++;
    }
  } finally { zip.close(); }
  if (count < 1000) throw new Error(`Incomplete icon archive (${count} items)`);
  await Promise.all(Object.entries(gui).map(async ([name, asset]) => {
    const bytes = await download(`${gameBase}/textures/gui/sprites/${asset}.png`);
    assertPng(bytes, name);
    await save(`gui/${name}.png`, bytes);
  }));
  await Promise.all(["en_us", "de_de"].map(async (locale) => {
    const bytes = await download(`${gameBase}/lang/${locale}.json`);
    const data: unknown = JSON.parse(bytes.toString("utf8"));
    if (!data || typeof data !== "object" || !('item.minecraft.diamond_sword' in data)) throw new Error(`Invalid language: ${locale}`);
    await save(`lang/${locale}.json`, bytes);
  }));
  await save("sources.json", Buffer.from(JSON.stringify({
    minecraftVersion: "26.3", icons: count,
    inventory: `https://github.com/Owen1212055/mc-assets/tree/${ICON_REV}`,
    gameAssets: `https://github.com/InventivetalentDev/minecraft-assets/tree/${GAME_REV}`,
    archiveSha256: ICON_SHA256,
    attribution: "Minecraft textures, names, and rendered game assets belong to Mojang Studios / Microsoft. This project is not affiliated with or endorsed by them.",
  }, null, 2) + "\n"));
  console.log(`Installed ${count} inventory icons, HUD sprites, and English/German game names in ${destination}`);
} finally { await rm(temporary, { recursive: true, force: true }); }
