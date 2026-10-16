/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Service worker (prompt 11). Bundled by scripts/build-sw.mjs into public/sw.js BEFORE
// `next build`, so it always ships (docs/DECISIONS.md). It does not depend on build output
// paths: on install it fetches every page and caches the static files each page references,
// whatever prefix the host serves them under.
import { CacheFirst, CacheableResponsePlugin, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

declare const self: ServiceWorkerGlobalScope;
declare const __SW_VERSION__: string;

const VERSION = __SW_VERSION__;
const PAGES = ["/", "/today", "/closet", "/history", "/settings", "/scan", "/about", "/welcome", "/offline"];
const PAGE_CACHE = `mw-pages-${VERSION}`;
const STATIC_CACHE = "mw-next-static"; // hashed, immutable files: safe to keep across versions
// Cutout model and WASM (6.3): the library does no caching of its own, so we keep its files a
// year. The cache name carries the version; old ones are deleted on activate.
const MODEL_CACHE = "bgr-model-v1.7.0";

const STATIC_ASSET = /(?:src|href)="(\/_next\/static\/[^"?#]+)"/g;

async function warm() {
  const pages = await caches.open(PAGE_CACHE);
  const statics = await caches.open(STATIC_CACHE);
  const assets = new Set<string>();
  for (const url of PAGES) {
    try {
      const res = await fetch(url, { cache: "reload", credentials: "same-origin" });
      if (!res.ok) continue;
      await pages.put(url, res.clone());
      for (const m of (await res.text()).matchAll(STATIC_ASSET)) assets.add(m[1]);
    } catch {
      // offline during install: what was cached before stays usable
    }
  }
  await Promise.all(
    [...assets].map(async (a) => {
      if (await statics.match(a)) return;
      try {
        const r = await fetch(a);
        if (r.ok) await statics.put(a, r);
      } catch {}
    }),
  );
}

// Leave Web Worker scripts to the browser. Turbopack hands a worker its bootstrap config in
// the URL fragment (#params=...), and a worker served by a service worker sees the response
// URL, which has no fragment: the cutout worker then fails with "Missing worker bootstrap
// config". Registered before Serwist's listener, so Serwist never responds to these. Offline,
// the immutable chunk still comes from the HTTP cache.
self.addEventListener("fetch", (event) => {
  const d = event.request.destination;
  if (d === "worker" || d === "sharedworker") event.stopImmediatePropagation();
});

self.addEventListener("install", (event) => event.waitUntil(warm()));

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => (k.startsWith("mw-pages-") && k !== PAGE_CACHE) || (k.startsWith("bgr-model-") && k !== MODEL_CACHE))
            .map((k) => caches.delete(k)),
        ),
      ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

const serwist = new Serwist({
  // Never take over mid-scan: the page shows "A fresh version is ready" and reloads on tap.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    { matcher: ({ url }) => url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    {
      matcher: ({ url }) => url.hostname === "staticimgly.com",
      handler: new CacheFirst({
        cacheName: MODEL_CACHE,
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxAgeSeconds: 365 * 24 * 3600, maxEntries: 120 }),
        ],
      }),
    },
    {
      // The clothes parser (about 29 MB from Hugging Face, which redirects to its CDN) and the
      // self-hosted ONNX runtime: downloaded once, kept a year.
      matcher: ({ url, sameOrigin }) => url.hostname === "huggingface.co" || url.hostname.endsWith(".hf.co") || (sameOrigin && url.pathname.startsWith("/ort/")),
      handler: new CacheFirst({
        cacheName: "clothes-model-v1",
        plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxAgeSeconds: 365 * 24 * 3600, maxEntries: 10 })],
      }),
    },
    {
      matcher: ({ url }) => url.hostname === "api.open-meteo.com" || url.hostname === "geocoding-api.open-meteo.com",
      handler: new StaleWhileRevalidate({
        cacheName: "open-meteo",
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 3600, maxEntries: 20 })],
      }),
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: STATIC_CACHE,
        plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 90 * 24 * 3600 })],
      }),
    },
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      // Online: always the latest page. Offline (or a slow network): the cached one.
      handler: new NetworkFirst({
        cacheName: PAGE_CACHE,
        networkTimeoutSeconds: 3,
        matchOptions: { ignoreSearch: true },
        // A page never cached (and no network): the offline page instead of a browser error.
        plugins: [{ handlerDidError: async () => (await (await caches.open(PAGE_CACHE)).match("/offline")) ?? Response.error() }],
      }),
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && (url.pathname.startsWith("/icons/") || /\.(png|svg|ico|webmanifest)$/.test(url.pathname)),
      handler: new StaleWhileRevalidate({ cacheName: "mw-assets" }),
    },
  ],
});

serwist.addEventListeners();
