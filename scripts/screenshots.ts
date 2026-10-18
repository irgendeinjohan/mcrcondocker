// UI-Screenshots im Mock-Modus (Entwicklung): tsx scripts/screenshots.ts <baseUrl> <ausgabeordner>
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

const base = process.argv[2] ?? "http://localhost:8099";
const out = process.argv[3] ?? "screenshots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const errors: string[] = [];

async function login(page: Page) {
  await page.goto(base + "/");
  await page.fill("#pw", process.env.PW ?? "mock");
  await page.click("button[type=submit]");
  await page.waitForSelector(".top");
  await page.waitForTimeout(1500);
}

async function run(name: string, viewport: { width: number; height: number }, mobile: boolean) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`[${name}] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`[${name}] ${e.message}`));
  await page.goto(base + "/");
  await page.waitForSelector("#pw");
  await page.screenshot({ path: `${out}/${name}-01-login.png` });
  await login(page);
  await page.goto(base + "/#/players");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}-02-players.png`, fullPage: true });
  await page.goto(base + "/#/players/36532b5e-c442-3dbb-a24c-c7e55d0f979a");
  await page.waitForSelector(".slot");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}-03-detail.png`, fullPage: true });
  // Tooltip: Excalibur (Hotbar 0) und Shulkerkiste (Hotbar 4)
  const hotbar = page.locator(".mc-grid .rows").nth(1).locator(".slot");
  if (mobile) await hotbar.nth(0).tap();
  else await hotbar.nth(0).hover();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}-04-tooltip.png` });
  if (mobile) await hotbar.nth(4).tap();
  else await hotbar.nth(4).hover();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}-05-tooltip-shulker.png` });
  if (mobile) await page.mouse.click(5, 300);
  await page.goto(base + "/#/players/00000000-0000-0000-0009-01f5f0fa4c3b");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}-06-bedrock.png`, fullPage: true });
  await page.goto(base + "/#/map/minecraft:overworld");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${name}-07-map.png` });
  await page.goto(base + "/#/map/minecraft:the_nether");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}-08-map-nether.png` });
  await page.goto(base + "/#/console");
  await page.waitForSelector(".input input");
  for (const c of ["list", "colors", "foo"]) {
    await page.fill(".input input", c);
    await page.press(".input input", "Enter");
    await page.waitForTimeout(300);
  }
  await page.fill(".input input", "stop");
  await page.press(".input input", "Enter");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}-09-console-confirm.png` });
  await page.click("dialog .btn:not(.danger)");
  await page.waitForTimeout(200);
  await page.press(".input input", "ArrowUp");
  await page.screenshot({ path: `${out}/${name}-10-console.png` });
  await page.goto(base + "/#/sessions/36532b5e-c442-3dbb-a24c-c7e55d0f979a");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${name}-11-sessions.png`, fullPage: true });
  await page.goto(base + "/#/debug");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/${name}-12-debug.png`, fullPage: false });
  await page.click(".pause");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}-13-paused.png` });
  await page.click(".pause");
  await page.waitForTimeout(500);
  await ctx.close();
}

await run("desktop", { width: 1400, height: 900 }, false);
await run("iphone", { width: 390, height: 844 }, true);
await browser.close();
console.log(errors.length ? "Browser-Fehler:\n" + errors.join("\n") : "Keine Browser-Fehler");
