// @ts-check
// Configurator mode: `serwist build` runs after `next build`, so every prerendered route
// (including /offline, the navigation fallback) is precached and Turbopack stays the bundler.
// No additionalPrecacheEntries: a duplicate URL with another revision makes install fail.
import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
});
