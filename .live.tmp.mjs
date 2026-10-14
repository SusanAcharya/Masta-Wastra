import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto("https://masta-wastra.vercel.app/");
await p.waitForURL(/welcome/);
await p.evaluate(async () => { await navigator.serviceWorker.ready; });
await p.reload();
await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
await p.waitForTimeout(3000);
await ctx.setOffline(true);
for (const path of ["/today", "/closet", "/history", "/scan", "/settings"]) {
  await p.goto("https://masta-wastra.vercel.app" + path);
  console.log("offline", path, "->", await p.locator("h1").first().textContent());
}
console.log("errors:", errors.length ? errors : "none", "| crossOriginIsolated:", await p.evaluate(() => crossOriginIsolated));
await b.close();
