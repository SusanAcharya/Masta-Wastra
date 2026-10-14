// @ts-check
// Configurator mode: `serwist build` runs after `next build` and Turbopack stays the bundler.
import { readFileSync } from "node:fs";
import { serwist } from "@serwist/next/config";

// Every page, listed explicitly: on Vercel the prerendered output is not where Serwist looks,
// so automatic detection found none and the app did not open offline. The build id revisions
// them, so each deploy refreshes the cached pages.
const revision = readFileSync(".next/BUILD_ID", "utf8").trim();
const PAGES = ["/", "/today", "/closet", "/history", "/settings", "/scan", "/about", "/welcome", "/offline"];

export default serwist({
  swSrc: "src/app/sw.ts",
  // Into Next's own build output, served at /sw.js by a rewrite (next.config.ts): Vercel collects
  // public/ before this step finishes, so a worker written there never shipped.
  swDest: ".next/static/sw.js",
  precachePrerendered: false,
  additionalPrecacheEntries: PAGES.map((url) => ({ url, revision })),
  // The worker must not precache its own script.
  manifestTransforms: [async (entries) => ({ manifest: entries.filter((e) => !/\/sw\.js$/.test(e.url)), warnings: [] })],
});
