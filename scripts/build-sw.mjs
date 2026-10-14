// Bundles src/app/sw.ts into public/sw.js before `next build` (see the header of sw.ts).
// The version is the deploy's commit on Vercel, else a timestamp, so each deploy refreshes
// the cached pages.
import { build } from "esbuild";

const version = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 12) || `local-${Date.now()}`;

await build({
  entryPoints: ["src/app/sw.ts"],
  outfile: "public/sw.js",
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  define: { __SW_VERSION__: JSON.stringify(version), "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
console.log(`service worker built: public/sw.js (version ${version})`);
