// Renders the icon master to the PNG sizes the manifest, iOS and favicon.ico need.
// Run: node design/icons/render.mjs   (uses Playwright's Chromium)
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync(new URL("./app-icon.svg", import.meta.url), "utf8");
const out = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/maskable-512.png", 512],
  ["src/app/apple-icon.png", 180],
  ["design/icons/icon-1024.png", 1024],
  ["design/icons/icon-29.png", 29],
  ["design/icons/fav-32.png", 32],
  ["design/icons/fav-16.png", 16],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('width="1024" height="1024"', `width="${size}" height="${size}"`)}</body></html>`,
  );
  await page.locator("svg").screenshot({ path: file, omitBackground: true });
}
await browser.close();

console.log("PNGs written. Now run: python3 design/icons/make-ico.py");
