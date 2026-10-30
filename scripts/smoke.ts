// Production UI smoke test. Starts an isolated mock server; requires downloaded assets and Chromium.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm, mkdir, writeFile, copyFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const temporary = await mkdtemp(path.join(tmpdir(), "mcdash-smoke-"));
const stub = createServer((_req, response) => response.end('<!doctype html><html><body><h1>BlueMap test map</h1></body></html>'));
stub.listen(0, "127.0.0.1");
await once(stub, "listening");
const stubAddress = stub.address();
assert(stubAddress && typeof stubAddress === "object");
const mapUrl = `http://127.0.0.1:${stubAddress.port}/?a=1&b=2#overworld`;
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const address = reservation.address();
assert(address && typeof address === "object");
await new Promise<void>((resolve) => reservation.close(() => resolve()));
const base = `http://127.0.0.1:${address.port}`;
// Local resource-pack and profile texture fixtures; no external skin requests.
const pack = path.join(temporary, "assets", "resourcepacks", "90-smoke");
await mkdir(path.join(pack, "assets", "smoke", "items"), { recursive: true });
await mkdir(path.join(pack, "assets", "smoke", "models", "item"), { recursive: true });
await writeFile(path.join(pack, "assets", "smoke", "items", "wand.json"), JSON.stringify({ model: { type: "minecraft:model", model: "smoke:item/wand" } }));
await writeFile(path.join(pack, "assets", "smoke", "models", "item", "wand.json"), JSON.stringify({ parent: "minecraft:item/generated", textures: { layer0: "minecraft:item/emerald" } }));
await mkdir(path.join(temporary, "assets", "skins"), { recursive: true });
await copyFile(path.join(root, "game-assets", "vanilla", "assets", "minecraft", "textures", "entity", "player", "wide", "alex.png"), path.join(temporary, "assets", "skins", `${"a".repeat(64)}.png`));
const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "dist/server/index.js"], {
  cwd: root,
  env: { ...process.env, MOCK: "true", DASHBOARD_PASSWORD: "mock", HOST: "127.0.0.1", PORT: String(address.port),
    DATA_DIR: temporary, ASSETS_DIR: path.join(temporary, "assets"), BUNDLED_ASSETS_DIR: path.join(root, "game-assets"),
    TRUST_PROXY: "false", COOKIE_SECURE: "false", LOG_LEVEL: "silent" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    if (await fetch(`${base}/healthz`).then((r) => r.ok).catch(() => false)) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, `Mock server did not start: ${serverOutput}`);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : "/usr/bin/google-chrome"), args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const context = await browser.newContext({ locale: "en-GB", viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(base);
  await page.getByRole("button", { name: "Log in", exact: true }).waitFor();
  await page.getByLabel("Language").selectOption("de");
  await page.getByRole("button", { name: "Anmelden", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Anmelden", exact: true }).waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "de");
  await page.getByLabel("Sprache").selectOption("en");
  await page.locator("#pw").fill("mock");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.locator(".top").waitFor();
  await page.getByRole("link", { name: "Players", exact: true }).waitFor();
  await page.goto(`${base}/#/players/36532b5e-c442-3dbb-a24c-c7e55d0f979a`);
  await page.locator(".slot").first().waitFor();
  await page.waitForFunction(() => {
    const icons = [...document.querySelectorAll<HTMLImageElement>(".slot img")];
    return icons.length > 10 && icons.every((icon) => icon.complete && icon.naturalWidth > 0);
  });
  await page.waitForFunction(() => document.querySelectorAll('.slot img[data-rendered="true"]').length >= 2, { timeout: 30000 });
  assert.equal(await page.locator(".inv .rows").count(), 3);
  await page.getByRole("button", { name: "Shield", exact: true }).waitFor();
  await page.getByRole("button", { name: /Excalibur/ }).click();
  await page.locator(".tt").waitFor();
  assert.match(await page.locator(".tt").innerText(), /Sharpness/);
  await page.keyboard.press("Escape");
  await page.getByLabel("Language").selectOption("de");
  await page.getByRole("button", { name: "Schild", exact: true }).waitFor();
  await page.getByRole("button", { name: /Excalibur/ }).click();
  assert.match(await page.locator(".tt").innerText(), /Schärfe/);
  await page.keyboard.press("Escape");
  await page.getByLabel("Sprache").selectOption("en");
  const allIcons = await context.request.get(`${base}/api/items?lang=en`).then((response) => response.json()) as { id: string; name: string }[];
  assert(allIcons.length >= 1500, `Incomplete item catalog: ${allIcons.length}`);
  for (const id of ["chest", "ender_chest", "shield", "white_banner", "red_bed", "player_head", "grass_block"]) {
    const response = await context.request.get(`${base}/api/icon/${id}`);
    assert.equal(response.status(), 200, id);
    const bytes = await response.body();
    assert(bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")), id);
  }
  await page.goto(`${base}/#/map`);
  await page.getByRole("button", { name: "Configure BlueMap" }).click();
  await page.getByLabel("BlueMap URL").fill(mapUrl);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.frameLocator('iframe[title="BlueMap"]').frameLocator('iframe[title="BlueMap"]').getByRole("heading", { name: "BlueMap test map" }).waitFor();
  assert.equal(await page.locator(".map-view").isVisible(), false);
  await page.reload();
  await page.frameLocator('iframe[title="BlueMap"]').frameLocator('iframe[title="BlueMap"]').getByRole("heading", { name: "BlueMap test map" }).waitFor();
  await page.getByRole("button", { name: "Coordinate map" }).click();
  assert.equal(await page.locator(".map-view").isVisible(), true);
  await page.goto(`${base}/#/world`);
  await page.getByRole("heading", { name: "Weather", exact: true }).waitFor();
  await page.getByLabel("Language").selectOption("de");
  await page.getByRole("heading", { name: "Wetter", exact: true }).waitFor();
  await page.getByRole("tab", { name: "Nachrichten", exact: true }).waitFor();
  await page.getByLabel("Sprache").selectOption("en");
  await page.getByRole("tab", { name: "Messages", exact: true }).waitFor();
  await page.goto(`${base}/#/console`);
  await page.getByLabel("Command", { exact: true }).fill("stop");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("heading", { name: "Confirm command" }).waitFor();
  assert.match(await page.locator("dialog[open]").innerText(), /classified as dangerous/);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  // Render component variants through the real local resource/texture endpoints.
  const visual = (slot: number, id: string, name: string, components: Record<string, unknown>, skin?: string) => ({
    slot, id: `minecraft:${id}`, count: 1, name: [{ text: name }], hasCustomName: true,
    enchantments: [], storedEnchantments: [], details: [], glint: false, appearance: { components, ...(skin ? { skin } : {}) },
  });
  const variants = [
    visual(9, "leather_chestplate", "Red leather", { dyed_color: 0xff0000 }),
    visual(10, "leather_chestplate", "Blue leather", { dyed_color: 0x0000ff }),
    visual(11, "potion", "Red potion", { potion_contents: { custom_color: 0xff0000 } }),
    visual(12, "potion", "Blue potion", { potion_contents: { custom_color: 0x0000ff } }),
    visual(13, "shield", "Plain shield", { base_color: "blue" }),
    visual(14, "shield", "Patterned shield", { base_color: "blue", banner_patterns: [{ pattern: "minecraft:stripe_center", color: "white" }] }),
    visual(15, "player_head", "Profile head", {}, "a".repeat(64)),
    visual(16, "stick", "Custom wand", { item_model: "smoke:wand" }),
    visual(17, "leather_chestplate", "Trimmed leather", { dyed_color: 0xff0000, trim: { material: "minecraft:gold", pattern: "minecraft:coast" } }),
    visual(18, "white_banner", "Red banner", { banner_patterns: [{ pattern: "minecraft:stripe_center", color: "red" }] }),
    visual(19, "white_banner", "Blue banner", { banner_patterns: [{ pattern: "minecraft:stripe_center", color: "blue" }] }),
  ];
  await page.route("**/api/players/36532b5e-c442-3dbb-a24c-c7e55d0f979a", async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.data.inventory = variants;
    detail.data.armor = { head: null, chest: null, legs: null, feet: null };
    detail.data.offhand = null; detail.data.enderChest = [];
    await route.fulfill({ response, json: detail });
  });
  await page.goto(`${base}/#/players/36532b5e-c442-3dbb-a24c-c7e55d0f979a`);
  for (const variant of variants) await page.getByRole("button", { name: variant.name[0]!.text, exact: true }).locator('img[data-rendered="true"]').waitFor({ timeout: 30000 });
  const image = async (name: string) => page.getByRole("button", { name, exact: true }).locator("img").getAttribute("src");
  assert.notEqual(await image("Red leather"), await image("Blue leather"));
  assert.notEqual(await image("Red potion"), await image("Blue potion"));
  assert.notEqual(await image("Plain shield"), await image("Patterned shield"));
  assert.notEqual(await image("Red leather"), await image("Trimmed leather"));
  assert.notEqual(await image("Red banner"), await image("Blue banner"));
  const color = async (name: string) => page.getByRole("button", { name, exact: true }).locator("img").evaluate((element) => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!; context.drawImage(element as HTMLImageElement, 0, 0);
    const values = context.getImageData(0, 0, 64, 64).data;
    const sum = { r: 0, g: 0, b: 0 };
    for (let i = 0; i < values.length; i += 4) if (values[i + 3]! > 128) { sum.r += values[i]!; sum.g += values[i + 1]!; sum.b += values[i + 2]!; }
    return sum;
  });
  const red = await color("Red leather"), blue = await color("Blue leather"), wand = await color("Custom wand");
  assert(red.r > red.b && blue.b > blue.r, "Armor dyes were not applied");
  assert(wand.g > wand.r && wand.g > wand.b, "Resource-pack item_model override was not applied");
  await page.unroute("**/api/players/36532b5e-c442-3dbb-a24c-c7e55d0f979a");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${base}/#/players/36532b5e-c442-3dbb-a24c-c7e55d0f979a`);
  await page.locator(".slot").first().waitFor();
  assert(await page.getByLabel("Language").isVisible());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile inventory overflows the viewport");
  await page.goto(`${base}/#/map`);
  await page.getByRole("button", { name: "Configure BlueMap" }).click();
  await page.getByRole("button", { name: "Remove BlueMap" }).click();
  await page.locator(".map-view").waitFor({ state: "visible" });
  const settings = await context.request.get(`${base}/api/settings/bluemap`).then((response) => response.json());
  assert.deepEqual(settings, { url: null });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/#/users`);
  await page.getByRole("heading", { name: "Database backups", exact: true }).waitFor();
  const backupResponse = page.waitForResponse((response) => response.url().endsWith("/api/backups") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Create backup", exact: true }).click();
  const snapshot = await (await backupResponse).json();
  const downloaded = await context.request.get(`${base}/api/backups/${snapshot.name}`);
  assert.equal(downloaded.status(), 200);
  assert((await downloaded.body()).subarray(0, 16).equals(Buffer.from("SQLite format 3\0")));
  const account = await context.request.post(`${base}/api/users`, { data: { username: "smoke-viewer", password: "viewer-smoke-password", role: "viewer" } }).then((response) => response.json());
  const viewer = await browser.newContext({ locale: "en-GB" });
  const viewerPage = await viewer.newPage();
  await viewerPage.goto(base);
  await viewerPage.locator("#username").fill("smoke-viewer");
  await viewerPage.locator("#pw").fill("viewer-smoke-password");
  await viewerPage.getByRole("button", { name: "Log in", exact: true }).click();
  await viewerPage.locator(".top").waitFor();
  assert.equal(await viewerPage.getByRole("link", { name: "Console", exact: true }).count(), 0);
  assert.equal(await viewerPage.getByRole("link", { name: "Users", exact: true }).count(), 0);
  assert.equal((await viewer.request.post(`${base}/api/action`, { data: { action: { type: "heal", uuid: "36532b5e-c442-3dbb-a24c-c7e55d0f979a" } } })).status(), 403);
  await viewerPage.goto(`${base}/#/players/36532b5e-c442-3dbb-a24c-c7e55d0f979a`);
  await viewerPage.locator(".slot").first().waitFor();
  assert.equal(await viewerPage.locator(".player-actions").count(), 0);
  await viewerPage.evaluate(() => new Promise<void>((resolve) => {
    const state = window as unknown as { smokeEvents: string[]; smokeSource: EventSource };
    state.smokeEvents = []; state.smokeSource = new EventSource("/api/events");
    state.smokeSource.onmessage = (event) => { state.smokeEvents.push(JSON.parse(event.data).type); if (state.smokeEvents.length >= 2) resolve(); };
  }));
  await context.request.post(`${base}/api/console`, { data: { command: "list" } });
  await viewerPage.waitForTimeout(100);
  const events = await viewerPage.evaluate(() => (window as unknown as { smokeEvents: string[] }).smokeEvents);
  assert(!events.includes("console") && !events.includes("audit"), "Viewer received administrative SSE events");
  await context.request.patch(`${base}/api/users/${account.id}`, { data: { role: "viewer", enabled: false } });
  await context.request.post(`${base}/api/pause`, { data: { paused: true } });
  await viewerPage.locator("#pw").waitFor();
  await context.request.post(`${base}/api/pause`, { data: { paused: false } });
  await viewer.close();
  assert.deepEqual(errors, [], "Browser errors");
  console.log(`Browser smoke passed: language persistence, localized inventory/tooltips, ${allIcons.length} catalog items, rendered icons, BlueMap configuration/embedding, world tabs, command confirmation, mobile layout, component variants, viewer permissions/SSE revocation, and verified backup downloads.`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  if (server.exitCode === null) await once(server, "exit");
  await new Promise<void>((resolve) => stub.close(() => resolve()));
  await rm(temporary, { recursive: true, force: true });
}
