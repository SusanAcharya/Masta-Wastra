import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Content Security Policy (prompt 16). Static, not nonce based: a nonce would force every page
// to render dynamically and is incompatible with partial prerendering (VERIFICATIONS row 16).
// 'unsafe-inline' covers Next's inline bootstrap and the no-flash theme script; WASM needs
// 'wasm-unsafe-eval'; the cutout runtime loads its .mjs and .wasm from the IMG.LY CDN.
const policy = (evalAllowed: boolean) =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://staticimgly.com${evalAllowed ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' blob: data: https://api.open-meteo.com https://geocoding-api.open-meteo.com https://staticimgly.com https://huggingface.co https://*.hf.co${dev ? " ws:" : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

// The pages never need eval. The cutout worker does: a library inside the background removal
// runtime compiles code with `new Function`. A worker follows the CSP of its own script
// response (and onnxruntime's blob workers inherit it), so only that script gets 'unsafe-eval'.
// Locally the chunk is under /_next/static/chunks/, on Vercel under /_next/static/immutable/chunks/.
const WORKER_CHUNK = "_next/static/(?:immutable/)?chunks/turbopack-worker";

const shared = [
  // Cross-origin isolation lets onnxruntime use WASM threads: warm cutouts went from about
  // 6.7 s to 2 s in Chromium (docs/VERIFICATIONS.md, M3). `credentialless` keeps cross-origin
  // fetches working without CORP on every response. Safari ignores it and stays single
  // threaded, which still works.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: `/((?!${WORKER_CHUNK}).*)`,
        headers: [...shared, { key: "Content-Security-Policy", value: policy(dev) }],
      },
      {
        source: "/_next/static/chunks/turbopack-worker:rest(.*)",
        headers: [...shared, { key: "Content-Security-Policy", value: policy(true) }],
      },
      {
        source: "/_next/static/immutable/chunks/turbopack-worker:rest(.*)",
        headers: [...shared, { key: "Content-Security-Policy", value: policy(true) }],
      },
      {
        // The service worker must never be cached by the HTTP layer, or updates stall.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  turbopack: {
    // A stray lockfile in the home folder confuses root detection.
    root: __dirname,
  },
};

export default nextConfig;
