// @ts-check
// Configurator mode: `serwist build` runs after `next build`, so every prerendered route
// (including /offline, the navigation fallback) is precached and Turbopack stays the bundler.
// No additionalPrecacheEntries: a duplicate URL with another revision makes install fail.
import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "src/app/sw.ts",
  // Into Next's own build output, served at /sw.js by a rewrite (next.config.ts): Vercel collects
  // public/ before this step finishes, so a worker written there never shipped.
  swDest: ".next/static/sw.js",
  // The worker must not precache its own script.
  manifestTransforms: [async (entries) => ({ manifest: entries.filter((e) => !/\/sw\.js$/.test(e.url)), warnings: [] })],
});
