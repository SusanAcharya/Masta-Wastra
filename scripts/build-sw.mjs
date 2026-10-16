// Bundles src/app/sw.ts into public/sw.js before `next build` (see the header of sw.ts), and
// copies the ONNX runtime the clothes parser loads.
// The version is the deploy's commit on Vercel, else a timestamp, so each deploy refreshes
// the cached pages.
import { copyFileSync, mkdirSync } from "node:fs";
import { build } from "esbuild";

// onnxruntime-web 1.21.0 runtime for the clothes parser, served from our own origin (/ort/).
mkdirSync("public/ort", { recursive: true });
for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) {
  copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `public/ort/${f}`);
}

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
