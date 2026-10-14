# Decisions

Choices the build prompt left open, in the order they were made. Format: date, decision, why.

## M0. Setup

- **2026-10-14. Repo root is this folder.** The prompt shows a `masta-wastra/` tree; the project folder ("Masta Wastra") is used as that root directly. Package name `masta-wastra`.
- **2026-10-14. Scaffolded with `create-next-app@16.4.0`** (App Router, `src/`, TypeScript, Tailwind, ESLint, npm). Its "Initial commit" is kept as the first commit.
- **2026-10-14. TypeScript 5.9.3, not 7.x.** npm `latest` is 7.0.2. Next 16.4 can build with TS 7, but `typescript-eslint@8.71.2` (used by `eslint-config-next`) requires `typescript <6.1.0`. 5.9.3 is the template pin and inside that range. Revisit when typescript-eslint supports 7.
- **2026-10-14. ESLint 9.x, not 10.x.** The template pins `^9`. `eslint-config-next@16.4.0` accepts `>=9`, so 10 is possible later.
- **2026-10-14. Tailwind through `@tailwindcss/turbopack`**, not `@tailwindcss/postcss`. That is what the Next 16.4 template ships, and Turbopack is the default bundler.
- **2026-10-14. Kept `cacheComponents: true` and `partialPrefetching: true`** from the template. Nearly every app screen is a client component reading IndexedDB, so this mostly affects the static shell.
- **2026-10-14. `turbopack.root` set to the project folder.** A stray `~/package-lock.json` outside the repo triggered a root detection warning.
- **2026-10-14. Node 22 LTS** locally (22.18.0); `engines.node >=22.12` (Vitest 5 floor). Vercel's default for new projects is 24.x, which satisfies it.
- **2026-10-14. Exact version pins** (`--save-exact`) for every runtime dependency and the test tools, matching the versions verified in `docs/VERIFICATIONS.md`.
- **2026-10-14. Dash test scans all of `src/` and `public/` text files**, not only UI strings. Stricter, and it needs no string extraction.
- **2026-10-14. Vitest runs in `node` environment by default.** Engine and server code are pure; DB tests use `fake-indexeddb`. Component tests, if any, opt in per file.
- **2026-10-14. Playwright projects:** 390 x 844 and 360 x 800 (mobile, touch) plus 1280 desktop, against `next start` on port 3100.
- **2026-10-14. Clean reinstall fixed rolldown's missing native binding** (npm optional dependency bug, npm/cli#4828). If `vitest` fails with "Cannot find native binding", delete `node_modules` and `package-lock.json` and run `npm install` again.
- **2026-10-14. `vite` is an explicit devDependency** (8.3.4), because Vitest 5 lists it as a peer.

## From verification (applies to later milestones)

- **2026-10-14. Model assets come from the IMG.LY CDN**, cached by our service worker (CacheFirst). The 1.7.0 data package is CDN only (285 MB tgz) and the library does no caching of its own. See VERIFICATIONS rows 5, 6, 10.
- **2026-10-14. Service worker via `@serwist/turbopack`**, not `@serwist/next`'s webpack plugin, so builds stay on Turbopack. Installed in M8.
- **2026-10-14. M8 "Lighthouse PWA" criterion replaced** by a Playwright check (manifest fields, SW registration, offline open) plus a manual Chrome DevTools Application panel check. Lighthouse 12 removed the PWA category.
- **2026-10-14. Gemini call shape:** `thinkingLevel: MINIMAL`, `mediaResolution: LOW`, `responseJsonSchema` from zod. See VERIFICATIONS rows 7d, 7e, 8.

## M1. Design system and shell

- **2026-10-14. Design Lounge installed per project** with `npx skills add SusanAcharya/Design-Lounge -a claude-code -y` into `.claude/skills/design-lounge` (pinned by `skills-lock.json`).
- **2026-10-14. Tailwind through `@tailwindcss/postcss`** (supersedes the M0 `@tailwindcss/turbopack` choice). The template's Turbopack rule `"*.css" as "*.css"` also caught `*.module.css` and stripped CSS Modules. The PostCSS plugin is the documented Next setup (VERIFICATIONS row 2b).
- **2026-10-14. Tailwind's default palette, radii, shadows and fonts are removed** (`--color-*: initial` etc.), so only the locked tokens exist as utilities.
- **2026-10-14. Theme mode lives in `localStorage` (`mw-theme`)**, read by a tiny inline script in `<head>` before first paint, so there is no flash. Dexie settings (M2) mirror it; localStorage stays the source for first paint.
- **2026-10-14. Component CSS as CSS Modules** under `src/components/lounge/<piece-id>/`, layout utilities with Tailwind.
- **2026-10-14. Planned for M7: item detail becomes a full screen layer on `/closet` (`/closet?item=<id>`)**, instead of a `/closet/[id]` route. Items live in IndexedDB, so a dynamic route cannot be precached for offline use, and `shared-element-expand` (`layoutId`) needs grid and detail in one React tree. Revisit if it fights the router.
- **2026-10-14. Source link** points at `https://github.com/SusanAcharya/Masta-Wastra` (`SOURCE_URL` in `src/lib/copy.ts`). Repo created by Susan 2026-10-14 (`SusanAcharya/Masta-Wastra`); keep it public (AGPL).
- **2026-10-14. `.claude/skills/` is gitignored; `skills-lock.json` is committed.** The repo is public (AGPL) and Design Lounge asks not to republish the catalogue. Restore the skill with `npx skills experimental_install`.

## From the AI Studio rate limits (applies to M4)

- **2026-10-14. Global Gemini budget is 45 per Pacific day per model** (`GEMINI_RPD=45`, free tier is 50 RPD per project). One 15 item scan uses 15, so the app as a whole onboards about three closets a day before tagging rests. Manual tagging keeps the app fully usable.
- **2026-10-14. Fallback model `gemini-3.1-flash-lite` (`GEMINI_FALLBACK_MODEL`) takes over when the primary's daily budget is spent.** Its quota is separate (also 50 RPD), so about 90 tags a day in total. Budget counters are kept per model.
- **2026-10-14. Per install limit lowered to 30 tags per day** (prompt said 120), so one person cannot drain the shared budget. 20 per 10 minutes and 40 per IP per day stay as written.

## Deploy

- **2026-10-14. Deployed by Susan to Vercel Hobby at https://masta-wastra.vercel.app** from `main` (git integration, so every push deploys). At M4, set `ALLOWED_ORIGINS=https://masta-wastra.vercel.app` plus the Gemini and Upstash env vars on the Vercel project.
- **2026-10-14. Susan keeps the existing Gemini key** in "Default Gemini Project" (`gen-lang-client-0711233403`), shared with an older key, accepting the shared 50 RPD quota and the earlier screenshot exposure.
- **2026-10-14. Upstash Redis connected to the Vercel project** `masta-wastra` (Production + Preview) with env prefix `KV`, so the function reads `KV_REST_API_URL` and `KV_REST_API_TOKEN` (and also accepts `UPSTASH_REDIS_REST_URL` / `_TOKEN` if renamed). Local dev without these vars falls back to in-memory counters.

## M2. Data layer

- **2026-10-14. Dexie schema v2 on top of the prompt's v1.** v1 is the prompt's store list verbatim (`V1_STORES`). v2 removes the `archived` index, because IndexedDB cannot index booleans (the index silently never matches); archived items are filtered in memory. The v1 to v2 upgrade fills fields added since: `items.cutoutQuality`, `dealDays.shownOutfitIds`, and new settings defaults. Backup import runs the same per row migrations.
- **2026-10-14. Fields added to the prompt's model:** `Item.cutoutQuality` (6.5), `Item.price` (10.3), `Item.tagCheck` ("Check these", 7.2), `Item.neutralOverride`; `DealDay.shownOutfitIds` (so "Deal again" never repeats); `Feedback.dealMean` (centred updates, 8.6); `Weights.signals` and `decayedAt`; `Settings.installId` (local deal seed, exists without AI consent), `scanGoal`, `cardLayout`, `cutoutModel`, `modelReady`, `persistAsked`, `tagPausedUntil`, `neverWornBoostUntil`, `lastBackupAt`, `introSeenAt`.
- **2026-10-14. Closed vocabularies live in `src/engine/types.ts`:** 38 subtypes (each with its category and default layer, so one tap sets all three) and 24 colour names with hex anchors (the client names measured colours without AI).
- **2026-10-14. Backups never carry the install token**, and an import keeps the receiving install's `installId` and token. AI debug JSON (`aiRaw`) is stripped unless asked. Image bytes are stored uncompressed in the zip (already WebP or JPEG).
- **2026-10-14. Merge import rules:** items by id, newer `updatedAt` wins; images follow the winning item or fill gaps; an outfit whose signature exists locally keeps the local id and its wears, feedback and deal days are repointed; deal days, wears, feedback and tag jobs are added when absent; local settings win, badges combine. Replace keeps local identity only.
- **2026-10-14. Import limits:** zip over 1 GB is refused before unzipping; schema newer than the app is refused with "update the app first".
- **2026-10-14. `fake-indexeddb` loads from `tests/unit/setup.ts`** (Vitest `setupFiles`), because Dexie reads `indexedDB` when first imported. Config renamed to `vitest.config.mts` (Vite native loader warning).

## Product changes from Susan (2026-10-14)

- **No scheduled morning deal.** Replaces 8.7 steps 5 to 8 and the "Three outfits every morning" promise. The home tab is "Outfit": one button, **Pick my outfit**, reads location and today's weather and returns **one** outfit with a reason; **Show another** returns the next best that shares at most one core piece with everything shown and prefers a different colour story; **Wear this** logs it to History. No morning hour, no reshuffle cap. The engine keeps `deal()` but the UI uses `createPicker()` / `pickAnother()`.
- **Colour matching is the product.** The engine treats a colour clash as disqualifying while any non-clashing outfit exists (floor S_color 0.5), weighs every palette colour by share, penalises near misses, requires shoes and accessories to echo or be neutral, and explains what actually makes the outfit work. Details in docs/ALGORITHM.md.
- **No forms when adding clothes.** Upload is upload: each photo is cut out, recognised by Gemini (category, kind, colours, warmth, pattern, style) and filed automatically. The manual tag sheet stays only as a one tap fix from the item, never as a step. AI consent (7.5) is folded into the one time setup sheet as a visible sentence instead of a separate blocking sheet; it can be turned off in Settings, and then pieces wait as "Needs a tag" instead of interrupting the scan. Pieces still being recognised are never used in outfits.

## M3. Capture and cutout

- **2026-10-14. COOP `same-origin` + COEP `credentialless` site wide.** ORT WASM threads: warm cutouts 6.7 s to 2.0 s in Chromium (VERIFICATIONS, M3 measurements). Safari ignores `credentialless` and stays single threaded.
- **2026-10-14. imgly runs only inside a module Web Worker** (`src/workers/cutout.worker.ts`) behind the engine seam `src/workers/engines/` (6.6). Output is PNG from imgly; the worker trims (4% padding), extracts colours and re-encodes WebP (PNG when the browser cannot encode WebP).
- **2026-10-14. Colour extraction merges clusters of one cloth colour** (OKLab distance under 0.06, or the same colour name), so folds and shadows do not produce "camel and camel".
- **2026-10-14. No goal picker step.** The scan goal is 10, then 15 once 10 are in (9.6 offered a picker; removed to keep adding clothes frictionless).
- **2026-10-14. Test photos are synthetic** (`tests/fixtures/make-garments.py`): drawn garments on bedsheet, wood and door textures. No licence-free real photo set was available. Real photos are covered by the device checklist.
- **2026-10-14. Photos picked before settings load are queued, never dropped**, and `useSettings()` creates the settings row outside Dexie live queries (live queries are read only, so a first-run write inside one failed silently).

## M4. Tagging (server and queue, built by a helper agent)

- **2026-10-14. No `runtime` export in route handlers.** With `cacheComponents`, Next 16.4 rejects any route segment `runtime` ("not compatible with nextConfig.cacheComponents"), including `'nodejs'`. Node is the default. `maxDuration = 20` stays. Prompt 17 step 4 is superseded.
- **2026-10-14. Origin rule:** exact match in `ALLOWED_ORIGINS`, or the request's own host (covers previews and localhost). Missing or `null` Origin is refused.
- **2026-10-14. Order of checks in `/api/tag`:** method, Origin, configured, Content-Type, token, body size, JSON/zod, per install, per IP, global per model budget, image sniff. Every window counts in one Redis pipeline (1 to 2 HTTP calls per tag).
- **2026-10-14. Day windows follow the Pacific calendar day.** Per install 10 min gives `rate_limited`; per install and per IP days give `daily_budget`; both models spent gives `global_budget` with Retry-After to Pacific midnight + 5 min.
- **2026-10-14. Google 429:** a per day quota marks that model spent until midnight and tries the fallback; otherwise treated as a busy minute. Other Gemini errors or invalid JSON give 502 `upstream`. 8 s timeout per Gemini call.
- **2026-10-14. Redis:** `SET key 0 PX ttl NX` then `INCR` (works on every Redis). Store errors fall back to in-memory counters (fail open, logged).
- **2026-10-14. Tokens:** HMAC over the base64url payload, compared as text in constant time; `iat` more than 5 min in the future is refused; a re-issue with a valid old token keeps the same install id.
- **2026-10-14. Gemini mapping:** user turn "Tag this item."; subtype wins over a contradicting category; each measured colour takes the nearest unused Gemini name within OKLab 0.16, else `nearestColorName`.
- **2026-10-14. Queue:** backoff 10, 20, 40, 80, 160 s then dead at 6 attempts (no jitter on Retry-After); `not_configured` and `origin` pause like a budget instead of killing jobs; 401 re-issues the token once; user edits always win (an AI answer for an edited item is discarded); one run at a time per tab and across tabs (`navigator.locks`), jobs leased for 2 min.

## M5. Outfit engine (built by a helper agent; full text in docs/ALGORITHM.md)

- **2026-10-14. Layer prohibitions are hard, requirements soft** (via `layerFit`), so a closet without a coat still gets an outfit on a cold day. A sweater worn alone counts as base + mid.
- **2026-10-14. Harmony precedence:** echo (same colour) 0.9, near miss 0.4, neutral pairs 0.75 (0.8 with lightness contrast), neutral + colour 0.9, tonal (hues within 15°, ΔL ≥ 0.25) 0.85, then the hue table.
- **2026-10-14. Neutral names always win:** black, white, grey, charcoal, cream, navy, beige, camel, khaki, denim, olive, brown.
- **2026-10-14. Occasion table filled in** for casual, date, travel and festival (ALGORITHM.md).
- **2026-10-14. Accessories:** at most one, only when it raises the score; bag and belt always allowed, scarf and gloves in the cold, hat or cap in hot UV.
- **2026-10-14. rainFit is graded** (waterproof outer 0.5, shoes 0.5 / 0.3 / 0); wind penalises skirts and dresses additively.
- **2026-10-14. Repeats compare core pieces only**; "yesterday" means a wear dated today or yesterday.
- **2026-10-14. Disliked items** (affinity at or below -0.75, about ten thumbs down) are held back while any alternative exists.
- **2026-10-14. Weather "Rain after 3" timing is not available** (the snapshot has no hourly series); the reason says "Rain on the way."
- **2026-10-14. 300 item closet deals in about 14 ms in Node** (test asserts the median of 5 runs under 50 ms).

## M6 to M9 (one pass, after Susan's product changes)

- **2026-10-15. One card, on demand.** `createPicker` ranks once per occasion, weather and closet; each tap gets a fresh seed. Every shown outfit is saved (`saveOutfit`) and today's shown list is kept in `dealDays` so History and learning have the context. "Show another" counts as a skip (-0.2), Wear as +1.0, thumbs as +0.7 / -0.8, all centred on the session's mean features.
- **2026-10-15. Pieces still being recognised never join outfits** (`isDressable`): only AI done, manual, or user-edited pieces. Pick shows how many are waiting.
- **2026-10-15. Weather cache in localStorage** (one snapshot per place and hour, reused offline for 24 h, labelled "From earlier"), plus the service worker's StaleWhileRevalidate on Open-Meteo. Location: "Use my location" (asked only on tap, rounded to 2 decimals), city search, or a quick manual pick.
- **2026-10-15. Closet filters are one pure query builder** (`lib/closet-filter.ts`): OR within a group, AND across groups; colour families are the badge families.
- **2026-10-15. Never worn boost** is a History action that sets `settings.neverWornBoostUntil` to 7 days ahead; the engine triples the never worn weight while it lasts.
- **2026-10-15. Service worker in Serwist configurator mode** (`@serwist/next/config` + `@serwist/cli`, `next build && serwist build`), not `@serwist/turbopack`: its route handler exports route segment config (`dynamic`, `revalidate`) that Cache Components rejects. Configurator mode also precaches every prerendered route. `skipWaiting` is off: the update toast reloads only on tap, never mid-scan.
- **2026-10-15. Static CSP in `next.config.ts`** with `'unsafe-inline'` scripts (Next bootstrap and the theme script) and `'wasm-unsafe-eval'`; `https://staticimgly.com` and `blob:` allowed for the cutout runtime. A nonce would make every page dynamic and is incompatible with partial prerendering.
- **2026-10-15. The install sheet waits for the first worn outfit**, never the first load; "Not now" snoozes it for 21 days (localStorage). iOS gets the three Share steps instead of a button.
- **2026-10-15. AI consent:** the one time setup sheet states what goes to Gemini; continuing either way turns recognition on (`aiConsent: true`), Settings turns it off. Prompt 7.5 asked for a separate sheet; folded in per Susan's "no friction" instruction and disclosed in About > Privacy and docs/PRIVACY.md.
- **2026-10-15. The service worker never answers Web Worker script requests.** Turbopack passes a worker its bootstrap config in the URL fragment; a worker served by a service worker sees the response URL (no fragment) and fails with "Missing worker bootstrap config". A fetch listener before Serwist's stops propagation for `destination` worker / sharedworker. Offline, the immutable chunk comes from the HTTP cache.
- **2026-10-15. CSP split by path:** pages get no `'unsafe-eval'`; only `/_next/static/chunks/turbopack-worker*` (the cutout worker's script) does, because a library inside the background removal runtime compiles code with `new Function`. A worker follows its own script's CSP and ORT's blob workers inherit it.
- **2026-10-15. No duplicate precache entries:** `/offline` is prerendered, so it is not added again (a duplicate URL with another revision made the service worker install fail).
- **2026-10-15. First install never reloads the page;** the update toast's Reload is the only thing that does (`controllerchange` also fires on first install via `clientsClaim`).
- **2026-10-15. Storage persistence is requested silently** after the third piece (no sheet mid batch, per Susan). Chrome and Edge decide without a prompt; Firefox shows its own; installed Safari apps get it.
- **2026-10-15. WebGPU only with a real adapter** (`navigator.gpu.requestAdapter()` resolves non-null), else WASM threads.
- **2026-10-15. `serwist.config.js` stays `.js`** (the CLI only looks for that name); Node prints a module type warning during build, harmless.
- **2026-10-15. Pages are precached from an explicit list** (revision = build id) with `precachePrerendered: false`: on Vercel, Serwist found no prerendered output and nothing opened offline.
- **2026-10-15. The service worker is written to `.next/static/sw.js` and served at `/sw.js` by a rewrite.** On Vercel, `public/` is collected before `serwist build` finishes, so a worker written to `public/` was a 404 in production. The worker filters itself out of its own precache.
- **2026-10-15. Engine: a raincoat loses 0.4 on dry days** (found in the journey test: a mild dry day picked the raincoat on warmth alone). Rain days still prefer it.
- **2026-10-15. When nothing fits the occasion, Pick relaxes the occasion** (every recognised piece may join; colour, weather and layers still rule) and says "Nothing in your closet is quite right for work, so this is the closest match." Pick never comes back empty while the closet can dress you.
- **2026-10-15. Zod runs `jitless` in the browser**, so it never probes `Function("")` (blocked by the page CSP, reported by Chrome as an issue).
- **2026-10-15. Service worker rebuilt to be host independent** (supersedes the Serwist configurator and the `.next/static` rewrite). Vercel serves Next 16 static files under `/_next/static/immutable/` and collects build output when `next build` ends, so a manifest built from local paths, or a worker written after the build, never matched production. Now `scripts/build-sw.mjs` (esbuild) writes `public/sw.js` before `next build`; on install the worker fetches every page and caches the static files each page references; pages are NetworkFirst (3 s timeout) with a cached `/offline` fallback; `/_next/static/*` is CacheFirst. Only the `serwist` runtime is kept.
- **2026-10-15. The cutout worker's CSP exception matches both `/_next/static/chunks/` and `/_next/static/immutable/chunks/`** (production uses the second; with only the first, cutouts would have failed in production).
