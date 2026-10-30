// Install only rendering assets from the pinned 26.3 client / mirror, never sounds or server data.
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ZipReader } from "../src/server/zip.js";

const CLIENT = "https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar";
const CLIENT_SHA1 = "e877b6a07acd633fb3bb475002175cec036e7b87";
const MIRROR = "https://codeload.github.com/InventivetalentDev/minecraft-assets/zip/6c088630459d8ca369ef0d6c07636d7d63a3b0f1";
const MIRROR_SHA256 = "07a3845295adcf70dbfdd594937a5e8e7f83e4aac83f5bd75b29ad88bd68bbb8";
const destination = path.resolve(process.argv[2] || "game-assets");
const temporary = await mkdtemp(path.join(tmpdir(), "mcdash-models-"));
const allowed = /^assets\/[a-z0-9_.-]+\/(?:items|models|textures|atlases|blockstates)\/[a-zA-Z0-9_./-]+\.(?:json|png|png\.mcmeta)$/;
async function download(url: string, file: string, algorithm: string, expected: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
  if (!response.ok || !response.body) throw new Error(`Asset download failed: ${response.status}`);
  const hash = createHash(algorithm);
  let bytes = 0;
  const limit = new Transform({ transform(chunk, _encoding, next) {
    bytes += chunk.length;
    if (bytes > 512 * 1024 * 1024) return next(new Error("Model archive exceeds 512 MiB"));
    hash.update(chunk); next(null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body as never), limit, createWriteStream(file));
  if (hash.digest("hex") !== expected) throw new Error("Model archive checksum mismatch");
}
try {
  let archive = process.env.MINECRAFT_ASSET_ARCHIVE;
  if (archive) {
    const bytes = await readFile(archive);
    const client = createHash("sha1").update(bytes).digest("hex") === CLIENT_SHA1;
    const mirror = createHash("sha256").update(bytes).digest("hex") === MIRROR_SHA256;
    if (!client && !mirror) throw new Error("MINECRAFT_ASSET_ARCHIVE does not match the pinned 26.3 client or mirror");
  } else {
    archive = path.join(temporary, "assets.zip");
    console.log("Downloading pinned Minecraft 26.3 model assets …");
    try { await download(CLIENT, archive, "sha1", CLIENT_SHA1); }
    catch { console.log("Client host unavailable; using the pinned asset mirror …"); await download(MIRROR, archive, "sha256", MIRROR_SHA256); }
  }
  const zip = new ZipReader(archive);
  let count = 0, bytes = 0;
  try {
    for (const entry of zip.names()) {
      const name = entry.startsWith("assets/") ? entry : entry.slice(entry.indexOf("/") + 1);
      if (!allowed.test(name) || name.includes("..") || name.endsWith("/_list.json")) continue;
      const content = zip.get(entry)!;
      bytes += content.length;
      if (bytes > 192 * 1024 * 1024 || content.length > 16 * 1024 * 1024) throw new Error("Rendering assets exceed size limit");
      const file = path.join(destination, "vanilla", name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
      count++;
    }
  } finally { zip.close(); }
  if (count < 1000) throw new Error("Incomplete rendering asset pack");
  await writeFile(path.join(destination, "vanilla", "source.json"), JSON.stringify({ version: "26.3", client: CLIENT, sha1: CLIENT_SHA1, mirror: MIRROR, mirrorSha256: MIRROR_SHA256, files: count }, null, 2) + "\n");
  console.log(`Installed ${count} model/texture files (${Math.round(bytes / 1024 / 1024)} MiB) in ${destination}/vanilla`);
} finally { await rm(temporary, { recursive: true, force: true }); }
