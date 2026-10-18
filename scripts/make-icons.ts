// Erzeugt die PNG-Icons aus icons/icon.svg (einmalig, Ergebnis wird committet).
// Aufruf: npx tsx scripts/make-icons.ts   (CHROMIUM_PATH optional)
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const dir = "src/web/public/icons";
const svg = readFileSync(`${dir}/icon.svg`, "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const shots: [string, number, boolean][] = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["apple-touch-icon.png", 180, true],
  ["icon-maskable-512.png", 512, true],
];
for (const [name, size, full] of shots) {
  // "full": randloses Quadrat (iOS rundet selbst ab, maskable braucht Sicherheitsrand)
  const inner = full ? svg.replace('rx="14"', 'rx="0"') : svg;
  const pad = name.includes("maskable") ? Math.round(size * 0.1) : 0;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:${full ? "#16181d" : "transparent"}"><div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">` +
      `<div style="width:${size - 2 * pad}px;height:${size - 2 * pad}px">${inner.replace("<svg ", '<svg width="100%" height="100%" ')}</div></div></body></html>`,
  );
  await page.screenshot({ path: `${dir}/${name}`, omitBackground: !full });
  console.log("geschrieben:", name);
}
await browser.close();
