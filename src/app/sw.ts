/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Service worker (prompt 11), built by `serwist build` after `next build` (configurator mode,
// docs/DECISIONS.md M8). Precaches the app shell and every prerendered route.
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, CacheableResponsePlugin, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

// Cutout model and WASM (6.3): the library does no caching of its own, so we keep its files a
// year. The cache name carries the version; old ones are deleted on activate.
const MODEL_CACHE = "bgr-model-v1.7.0";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true, ignoreURLParametersMatching: [/.*/] },
  // Never take over mid-scan: the page shows "A fresh version is ready" and reloads on tap.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
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
      matcher: ({ url }) => url.hostname === "api.open-meteo.com" || url.hostname === "geocoding-api.open-meteo.com",
      handler: new StaleWhileRevalidate({
        cacheName: "open-meteo",
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 3600, maxEntries: 20 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

// Leave Web Worker scripts to the browser. Turbopack hands a worker its bootstrap config in
// the URL fragment (#params=...), and a worker served by a service worker sees the response
// URL, which has no fragment: the cutout worker then fails with "Missing worker bootstrap
// config". Registered before Serwist's listener, so Serwist never responds to these. Offline,
// the immutable chunk still comes from the HTTP cache.
self.addEventListener("fetch", (event) => {
  const d = event.request.destination;
  if (d === "worker" || d === "sharedworker") event.stopImmediatePropagation();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("bgr-model-") && k !== MODEL_CACHE).map((k) => caches.delete(k))),
    ),
  );
});

serwist.addEventListeners();
