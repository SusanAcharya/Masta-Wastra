# Masta Wastra: Claude Code Build Prompt

**Version:** 1.0
**Date:** 2026-10-14
**Owner:** Susan Acharya (github.com/SusanAcharya)
**Audience:** Claude Code, building end to end from an empty repo.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-14 | First complete build prompt. Verified on 2026-10-14: `@imgly/background-removal` 1.7.0 (AGPL-3.0, models ~40 MB / ~80 MB), Gemini free-tier model `gemini-3.5-flash-lite`, Open-Meteo free terms (non-commercial, 10,000 calls/day, CC BY 4.0), current npm versions of Next, Serwist, Dexie, Motion, `@google/genai`. Design Lounge IDs checked against the live repo. Unconfirmed items carry [VERIFY]. |

---

## 0. How to use this prompt (read first, Claude)

You are building **Masta Wastra** ("masta" = cool / carefree, "wastra" = clothing, Nepali), a smart wardrobe PWA. The user photographs each clothing item once. The app cuts it out in the browser, tags it once with Gemini vision, and every morning deals **3 outfit cards** chosen by **rules, not AI**, from weather and occasion. The user swipes to pick one.

Work rules:

1. **Verify before you pin.** Every version and limit below was checked on 2026-10-14. Before `npm install`, run `npm view <pkg> version` and read each package's current README for breaking changes. Anything marked **[VERIFY]** must be confirmed against the primary source and the result written to `docs/VERIFICATIONS.md` (fact, source URL, date, outcome). If a fact turned out different, follow the fallback given next to it.
2. **Free tiers only.** No paid service, no card on file. If a feature would need money, cut it and log the cut in `docs/DECISIONS.md`.
3. **Local first.** The app must work fully with no account and no network after first load (except new tagging and fresh weather). The server holds no user data.
4. **Gemini is called once per item, ever.** Never on a schedule, never for outfits, never on app open. Re-tag happens only when the user taps "Re-tag with AI" on one item.
5. **No long dashes in UI text.** No em dash (U+2014) or en dash (U+2013) in any user-facing string. Use a period, comma, colon or "to". Enforce with a test (section 15).
6. **Design Lounge, ambitiously.** Install with `npx skills add SusanAcharya/Design-Lounge`, read the skill's `SKILL.md`, and use the exact IDs in section 9. Keep `DESIGN.md` as a running log.
7. **Milestones in order** (section 14). Do not start a milestone until the previous one's acceptance criteria pass. Commit at the end of each one.
8. **Ask nothing you can decide.** Where this prompt is silent, choose the simplest free option, write it in `docs/DECISIONS.md`, and keep going.

---

## 1. Product in one screen

- **Closet scan (onboarding):** a playful run where the user snaps 10 to 15 items. A progress bar fills, badges pop at milestones, each photo turns into a clean cutout card that lands on a linen "contact sheet". More items can be added any time.
- **Today:** at a time the user chooses (default 07:00 local), opening the app shows today's weather strip and 3 outfit cards stacked as a deck. Swipe right to wear, left to skip, up for "more like this". Picking one logs a wear.
- **Closet:** grid of cutouts with filter chips (type, color, warmth, occasion, vibe, never worn). Tap for item detail with editable tags.
- **History:** calendar of past outfits, wear stats, "never worn" insights.
- **Share:** a client-rendered outfit card image (PNG) to save or share through the Web Share API.
- **Settings:** theme (light / dark / system), location, morning time, occasion defaults, units, data export and import, AI tagging consent, about and credits.

Out of scope for MVP (write as future flags in `src/lib/flags.ts`, all `false`): virtual try-on, 3D, full-body photos, social feed, shopping links, server-side push notifications, Supabase sync.

---

## 2. Verified facts and limits (2026-10-14)

### 2.1 Package versions (npm, checked 2026-10-14)

| Package | Version seen | License | Use |
|---|---|---|---|
| `next` | 16.4.0 | MIT | App Router, route handlers |
| `react` / `react-dom` | 19.x [VERIFY exact] | MIT | UI |
| `@imgly/background-removal` | 1.7.0 | AGPL-3.0 (npm says "SEE LICENSE IN LICENSE.md") | in-browser cutouts |
| `onnxruntime-web` | 1.30.0 (transitive) | MIT | inference runtime |
| `@google/genai` | 2.29.1 | Apache-2.0 | server-side Gemini call |
| `dexie` | 4.4.6 | Apache-2.0 | IndexedDB wrapper |
| `@serwist/next` | 9.5.13 | MIT | service worker / offline |
| `motion` | 14.2.0 | MIT | animation (`motion/react`) |
| `zod` | 4.x [VERIFY] | MIT | validation |
| `tailwindcss` | 4.x [VERIFY] | MIT | styling |
| `vitest`, `@playwright/test`, `fake-indexeddb`, `@axe-core/playwright` | latest [VERIFY] | MIT / Apache | tests |

Use npm, Node 22 LTS or newer [VERIFY Vercel's default Node].

### 2.2 `@imgly/background-removal`

- **License: AGPL-3.0.** IMG.LY: "free for use under the AGPL License", other licensing via support@img.ly. Because the code ships to and runs in users' browsers and the app is offered over a network, **the Masta Wastra repo must be published under AGPL-3.0 (or a compatible license) with a visible "Source" link in the app.** This is the MVP decision. Put `LICENSE` (AGPL-3.0) at the root and an `/about` link to the public repo. If Susan later wants closed source, the fallback is section 6.6 (swap the engine behind the same interface).
- **Models:** `isnet` (~80 MB, fp32), `isnet_fp16` (~80 MB, default), `isnet_quint8` (~40 MB, quantized, sometimes shows artifacts). Config: `publicPath`, `device: 'cpu' | 'gpu'` (gpu uses WebGPU when available), `model`, `output.{format,quality,type}`, `proxyToWorker` [VERIFY option still exists in 1.7.0].
- **Assets** (ONNX model + WASM) are fetched by default from `https://staticimgly.com/@imgly/background-removal-data/<version>/dist/`. Self-hosting is supported via `publicPath`. [VERIFY] whether the data package size fits in the Vercel deploy (see 6.3).

### 2.3 Gemini free tier

- Model to use: **`gemini-3.5-flash-lite`** (stable, image input, structured output supported, per Google's model page, updated July 2026). Google's model list says new projects should use 3.5 Flash-Lite or 3.8 Flash; 2.5 models are limited to prior users.
- Free tier limits are **no longer published in Google's docs** (the rate-limits page says see AI Studio). A third-party measurement lists `gemini-3.5-flash-lite` at **15 RPM, 500 RPD** and Flash models at 5 RPM / 20 RPD. **[VERIFY] in AI Studio > Rate limits for the actual project.** Code reads limits from env (`GEMINI_RPM`, `GEMINI_RPD`) with defaults 10 and 400 (a safety margin under the measured numbers).
- Limits are **per Google Cloud project, not per key.** RPD resets at **midnight Pacific time**.
- **Free tier data "Used to improve our products: Yes"** (pricing page). So: send only the cutout (background already removed, no faces, no room), downscaled, and get explicit consent first (section 7.5).
- Fallback model if 3.5 Flash-Lite is unavailable or limits are worse: `gemini-3.1-flash-lite` (same measured limits) [VERIFY]. Model id is the env var `GEMINI_MODEL`.

### 2.4 Open-Meteo

- Free API: **non-commercial use only**, fewer than **10,000 calls/day, 5,000/hour, 600/minute** (also listed as 300,000/month). No API key. CORS supported, so call it **directly from the browser**, not through our server.
- Data is **CC BY 4.0**: show "Weather data by Open-Meteo.com" with a link next to where weather is shown (Today screen weather strip and About).
- Commercial use needs a paid plan. Masta Wastra is a free, non-commercial personal project. If that ever changes, log it as a blocker.
- Geocoding API (city search) is free on the same terms.

### 2.5 Vercel Hobby [VERIFY all numbers on vercel.com/docs/limits and /pricing]

- Hobby is for **personal, non-commercial use**. Fits this project.
- Functions: about 1M invocations/month and a few hours of Active CPU per month included; default max duration is generous for one Gemini call (we target under 15 s per request). [VERIFY current numbers]
- Fast data transfer about 100 GB/month. [VERIFY]
- Static file per deployment upload limits apply. [VERIFY before self-hosting the ~40 MB model, see 6.3]
- Cron on Hobby is limited (once per day, imprecise timing). **We use no cron.** The morning deal is computed on the device.

### 2.6 Supabase (later, not MVP) [VERIFY]

Free plan has a small Postgres database, small file storage, a monthly active user cap, and projects **pause after about a week of inactivity**. That pause is why sync is optional and the app never depends on it.

---

## 3. Architecture

```
Phone browser (PWA, installed)
 ├─ UI: Next.js 16 App Router, client components for all app screens
 ├─ Service worker (Serwist): precache app shell, runtime cache weather, cache-first model files
 ├─ Web Worker: background removal (@imgly) + dominant color extraction
 ├─ IndexedDB (Dexie): items, images (Blobs), outfits, wears, feedback, weights, settings, queue
 ├─ Rules engine (pure TS, src/engine): candidates, scoring, deal of 3, learning
 ├─ Open-Meteo: fetched from the browser, cached per hour
 └─ POST /api/tag ──► Vercel route handler (Node runtime)
                        ├─ signed install token check (7.3)
                        ├─ rate limits (per install, per IP, global daily budget)
                        └─ Gemini gemini-3.5-flash-lite (key in env, never sent to client)
```

The **only** server code is `/api/tag` and `/api/install` (section 7). Everything else is static.

### 3.1 Why these choices

- **Next.js 16 on Vercel Hobby:** one repo, static app plus two tiny route handlers that hide the key. Use `output` default (not `export`) because we need route handlers.
- **Dexie over raw `idb`:** schema versions, migrations, compound indexes and `liveQuery` for reactive UI. Both are free and tiny.
- **Serwist over hand-rolled SW:** maintained successor to next-pwa with Next App Router support. [VERIFY Serwist's Next 16 setup notes; if it requires webpack, run `next build --webpack` and log it.]
- **Rules engine over AI for outfits:** zero cost per day, instant, offline, explainable ("Navy and camel: a classic pair. 12°C, so a layer.").

---

## 4. Folder structure

```
masta-wastra/
├─ LICENSE                       # AGPL-3.0 (required by @imgly, see 2.2)
├─ README.md                     # setup, env, deploy, credits
├─ DESIGN.md                     # Design Lounge log (section 9.8)
├─ docs/
│  ├─ DECISIONS.md               # every choice this prompt left open
│  ├─ VERIFICATIONS.md           # every [VERIFY] with source and date
│  ├─ ALGORITHM.md               # copy of section 8 kept in sync with code
│  └─ PRIVACY.md                 # what leaves the device and when
├─ public/
│  ├─ manifest.webmanifest
│  ├─ icons/                     # 192, 512, maskable 512, apple-touch 180
│  └─ screenshots/               # manifest screenshots (narrow + wide)
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx              # fonts, theme script, SW register, credit
│  │  ├─ page.tsx                # redirects: /scan if no items, else /today
│  │  ├─ (app)/today/page.tsx
│  │  ├─ (app)/closet/page.tsx
│  │  ├─ (app)/closet/[id]/page.tsx
│  │  ├─ (app)/history/page.tsx
│  │  ├─ (app)/settings/page.tsx
│  │  ├─ (app)/layout.tsx        # tab bar shell
│  │  ├─ scan/page.tsx           # closet scan onboarding + add item
│  │  ├─ about/page.tsx          # credits, licenses, source link
│  │  ├─ offline/page.tsx        # SW fallback
│  │  ├─ sw.ts                   # Serwist service worker source
│  │  └─ api/
│  │     ├─ install/route.ts     # issues signed install token
│  │     └─ tag/route.ts         # Gemini proxy
│  ├─ components/
│  │  ├─ lounge/                 # adapted Design Lounge pieces, one folder per piece ID
│  │  ├─ icons/                  # Lounge Icons wrapper
│  │  ├─ item-card.tsx           # cutout card
│  │  ├─ outfit-card.tsx         # flat-lay / stacked layout
│  │  ├─ outfit-deck.tsx         # swipe deck
│  │  ├─ tag-chip-editor.tsx
│  │  ├─ weather-strip.tsx
│  │  └─ share-card-canvas.ts
│  ├─ engine/                    # PURE, no DOM, no Dexie imports
│  │  ├─ color.ts                # hex → OKLCH, harmony
│  │  ├─ warmth.ts               # temperature bands, layering
│  │  ├─ candidates.ts           # build outfit candidates
│  │  ├─ score.ts                # scoring terms
│  │  ├─ deal.ts                 # pick 3 diverse outfits, seeded
│  │  ├─ learn.ts                # 👍/👎 weight updates
│  │  ├─ explain.ts              # one-line reasons
│  │  └─ types.ts
│  ├─ db/
│  │  ├─ schema.ts               # Dexie schema + migrations
│  │  ├─ repo.ts                 # typed queries
│  │  └─ backup.ts               # export / import
│  ├─ workers/
│  │  ├─ cutout.worker.ts        # @imgly + post-processing
│  │  └─ cutout-client.ts        # Comlink-style promise wrapper (hand-rolled postMessage is fine)
│  ├─ lib/
│  │  ├─ weather.ts              # Open-Meteo fetch + cache
│  │  ├─ tag-queue.ts            # client tagging queue, backoff
│  │  ├─ image.ts                # resize, EXIF orientation, WebP encode
│  │  ├─ flags.ts
│  │  ├─ copy.ts                 # all UI strings (dash test runs here)
│  │  └─ server/                 # only imported by route handlers
│  │     ├─ gemini.ts
│  │     ├─ ratelimit.ts
│  │     └─ token.ts
│  └─ styles/
│     ├─ globals.css
│     ├─ theme-linen-shop.css    # copied from Design Lounge, unchanged numbers
│     └─ theme-atelier-noir.css
├─ tests/
│  ├─ unit/                      # vitest: engine, db, queue, copy
│  ├─ e2e/                       # playwright: flows, offline, a11y
│  └─ fixtures/                  # 15 sample garment photos (license-free, own photos)
└─ vercel.json                   # headers only (CSP, cache), no cron
```

---

## 5. Data model (Dexie, `db/schema.ts`)

All ids are `crypto.randomUUID()`. All times are ISO strings in UTC plus a `localDate` (`YYYY-MM-DD` in the device zone) where days matter.

```ts
type Category = 'top' | 'bottom' | 'dress' | 'outer' | 'shoes' | 'accessory';
type Subtype = string;        // 'tshirt','shirt','sweater','hoodie','jeans','chinos','skirt','shorts','coat','jacket','blazer','sneakers','boots','loafers','sandals','scarf','hat','bag','belt', ... (closed list in engine/types.ts)
type Pattern = 'solid' | 'stripe' | 'check' | 'floral' | 'graphic' | 'print' | 'texture';
type Vibe = 'casual' | 'smart' | 'formal' | 'sporty' | 'lounge' | 'street' | 'traditional';
type Occasion = 'work' | 'casual' | 'date' | 'formal' | 'workout' | 'travel' | 'home' | 'festival';
type Warmth = 1 | 2 | 3 | 4 | 5;   // 1 = very light (linen tee), 5 = heavy (down coat)
type Layer = 0 | 1 | 2;            // 0 base, 1 mid (sweater, cardigan), 2 outer (coat)

interface Item {
  id: string;
  createdAt: string; updatedAt: string;
  name: string;                    // "Navy oxford shirt", editable
  category: Category; subtype: Subtype; layer: Layer;
  colors: { hex: string; name: string; share: number }[]; // 1 to 3, share sums to 1
  primaryHex: string;              // colors[0].hex, indexed
  isNeutral: boolean;              // derived from OKLCH chroma (8.2), user can override
  pattern: Pattern; warmth: Warmth;
  vibes: Vibe[];                   // 1 to 3
  occasions: Occasion[];           // derived from vibes, editable
  waterproof: boolean;             // for rain rule
  tagSource: 'ai' | 'manual' | 'ai-edited';
  tagStatus: 'pending' | 'queued' | 'done' | 'failed' | 'manual';
  aiRaw?: unknown;                 // last Gemini JSON, for debugging, stripped on export unless asked
  imageId: string; cutoutId: string; thumbId: string;
  archived: boolean;               // "Retired" items stay in history
  notes?: string;
}

interface ImageBlob { id: string; kind: 'original' | 'cutout' | 'thumb'; blob: Blob; w: number; h: number; mime: string; }
// original: max 1600px long edge, JPEG q0.82 (kept for re-cutout; user can choose "don't keep originals" to save space)
// cutout: max 1024px, WebP with alpha q0.85 (PNG fallback when WebP alpha encode unsupported)
// thumb: 320px WebP

interface Outfit {
  id: string;
  itemIds: string[];               // ordered: outer, top/dress, bottom, shoes, accessories
  signature: string;               // sorted itemIds joined, for repeat detection
  createdAt: string;
  source: 'deal' | 'manual';
  score?: number; breakdown?: Record<string, number>;
  reason?: string;
}

interface DealDay {                // one per localDate, so the 3 cards are stable all day
  localDate: string;               // PK
  occasion: Occasion;
  weather: WeatherSnapshot;
  outfitIds: [string, string, string] | string[]; // fewer than 3 if closet too small
  seed: number;
  pickedOutfitId?: string;
  reshuffles: number;              // max 3 per day
}

interface Wear { id: string; localDate: string; outfitId: string; itemIds: string[]; at: string; }
interface Feedback { id: string; outfitId: string; at: string; signal: 'up' | 'down' | 'skip' | 'wear' | 'more'; features: FeatureVector; }
interface Weights { id: 'current'; version: number; w: Record<FeatureKey, number>; itemAffinity: Record<string, number>; pairAffinity: Record<string, number>; updatedAt: string; }
interface WeatherSnapshot { fetchedAt: string; lat: number; lon: number; tempNow: number; feelsMin: number; feelsMax: number; precipProb: number; precipMm: number; windMax: number; uvMax: number; code: number; }
interface Settings { id: 'me'; themeMode: 'system' | 'light' | 'dark'; units: 'c' | 'f'; location?: { name: string; lat: number; lon: number; source: 'geo' | 'search' }; morningHour: number; defaultOccasionByWeekday: Occasion[]; aiConsent: boolean | null; keepOriginals: boolean; reducedMotion: 'system' | 'on'; installToken?: string; badges: string[]; onboardedAt?: string; }
interface TagJob { id: string; itemId: string; attempts: number; nextAt: string; lastError?: string; state: 'waiting' | 'running' | 'done' | 'dead'; }
```

Dexie stores and indexes:

```ts
db.version(1).stores({
  items: 'id, category, subtype, primaryHex, warmth, pattern, *vibes, *occasions, tagStatus, archived, createdAt',
  images: 'id, kind',
  outfits: 'id, &signature, createdAt',
  dealDays: 'localDate',
  wears: 'id, localDate, outfitId, *itemIds',
  feedback: 'id, outfitId, at, signal',
  weights: 'id',
  settings: 'id',
  tagJobs: 'id, itemId, state, nextAt',
});
```

Storage: call `navigator.storage.persist()` after the 3rd item is saved (explain why in a small sheet). Show usage from `navigator.storage.estimate()` in Settings. Budget: about 0.3 to 0.6 MB per item with originals, so 200 items is around 100 MB. Offer "Drop originals" to cut this by about two thirds.

---

## 6. Background removal (browser side)

### 6.1 Pipeline per photo (`workers/cutout.worker.ts`)

1. Capture with `<input type="file" accept="image/*" capture="environment">` (works on iOS and Android, no camera permission dialog to design around). Also allow picking from gallery (same input without `capture`, offered as "Choose photos", multiple).
2. Main thread: decode with `createImageBitmap(file, { imageOrientation: 'from-image' })`, resize to max 1024 px long edge on an `OffscreenCanvas` (fallback canvas), encode JPEG. Keep the 1600 px original only if `keepOriginals`.
3. Post the 1024 px blob to the worker. Worker runs `removeBackground(blob, config)`.
4. Post-process in the worker: trim transparent bounds plus 4% padding, add nothing else (the drop shadow is CSS). Compute dominant colors with k-means (k=4) on opaque pixels in OKLab, drop clusters under 8% share, keep top 3. Encode cutout WebP and a 320 px thumb.
5. Return blobs + colors. Save to Dexie in one transaction. Enqueue a tag job (section 7).

Config:

```ts
const config = {
  publicPath: MODEL_BASE_URL,            // see 6.3
  model: 'isnet_quint8',                 // ~40 MB, the default for phones
  device: supportsWebGPU ? 'gpu' : 'cpu',
  output: { format: 'image/webp', quality: 0.85, type: 'foreground' },
  progress: (key, current, total) => postMessage({ type: 'progress', key, current, total }),
};
```

Model choice: start on `isnet_quint8` for every device. In Settings > "Cutout quality", offer "High (downloads 80 MB once)" which switches to `isnet_fp16`. Only suggest it on Wi-Fi (`navigator.connection?.saveData` false and effectiveType `4g`, if available) and if `navigator.deviceMemory >= 4` when that API exists.

### 6.2 First-run download UX

- Before the first scan, a `phone-permission-prompt` style sheet: "One time setup. Masta Wastra downloads a 40 MB helper so your photos never leave your phone to get cut out. Best on Wi-Fi." Buttons: "Download now" / "Later". If the user has `saveData`, default focus on "Later" and allow manual-crop mode (6.5).
- Show real progress from the `progress` callback in the closet scan progress bar's secondary track.
- Prefetch the model while the user reads the onboarding carousel, only after they tapped "Let's scan" (never on the landing page).

### 6.3 Caching the model

- **Default:** keep IMG.LY's CDN as `publicPath` and cache its responses in the service worker with a **CacheFirst** strategy, cache name `bgr-model-v1.7.0`, max age 365 days, `cacheableResponse` statuses `[0, 200]`. When the package version changes, the cache name changes and old caches are deleted on SW activate.
- **[VERIFY]** IMG.LY's CDN sends CORS headers that allow our origin and permits this use. If not, self-host: copy the files from `@imgly/background-removal-data` (or the `dist` folder documented in "Custom Asset Serving") to `public/bgr/` at build time, only the `isnet_quint8` chunks plus WASM, and set `publicPath` to `/bgr/`. Check each file is under Vercel's static asset size limit [VERIFY]; the model is usually split into chunks.
- The library may also cache in its own way [VERIFY]. Do not double-store: if it uses Cache Storage itself, skip our runtime rule and document.
- ORT WASM threads need cross-origin isolation for multithreading. **Do not** enable COOP/COEP site-wide by default (it breaks the Web Share and some image flows); measure first. If single-thread is too slow on a mid phone (> 8 s per item), try COOP `same-origin` + COEP `credentialless` and test every flow, then log the result. [VERIFY]

### 6.4 Performance targets (measure on a real mid-range Android and an iPhone, record in `docs/VERIFICATIONS.md`)

| Metric | Target |
|---|---|
| Model first download | under 40 MB, once |
| Warm cutout time, 1024 px, mid Android | under 6 s (WASM), under 2.5 s (WebGPU) |
| Main thread blocked during cutout | under 50 ms per frame (all work in worker) |
| Memory | no crash after 15 items in a row; recreate the worker every 10 items to release memory |
| Batch | process one at a time; let the user keep shooting while the queue runs |

### 6.5 Failure and manual fallback

- If the worker fails (old Safari, out of memory, model not downloaded): save the item with a **soft rectangular crop** (user drags 4 corners on a `m3-modal-bottom-sheet`) on a linen card background, mark `cutoutQuality: 'manual'` [add this optional field], and offer "Try cutout again" later.
- Quality check: if the opaque area is under 5% or over 97% of the frame, show "That one did not cut cleanly. Retake or keep as is?"
- Shooting tips on the camera step: flat on a bed or hung on a door, plain background, daylight, whole item in frame.

### 6.6 Engine swap seam

`cutout-client.ts` exposes `cutout(blob): Promise<{ cutout, thumb, colors }>`. The worker imports the engine through `workers/engines/imgly.ts`. A second engine file can implement the same function (for example a permissively licensed segmentation model via `@huggingface/transformers` [VERIFY model license before use]). Do not build the second engine in MVP; just keep the seam.

---

## 7. Auto-tagging with Gemini (once per item)

### 7.1 Flow

1. After cutout, create `TagJob` with `state: 'waiting'`. The item shows on the grid at once with shimmering placeholder chips (`loader-text-shimmer`).
2. The client queue (`lib/tag-queue.ts`) sends at most **1 request at a time** and at most **`clientRpm = 6` per minute** per install, only when `navigator.onLine` and `aiConsent === true`.
3. Request: `POST /api/tag` with header `Authorization: Bearer <installToken>`, body `{ itemId, image: <base64 WebP>, colors: [{hex,share}] }`. Image is the **cutout composited onto mid grey, 512 px long edge, WebP q0.7** (about 20 to 40 KB). Composite onto grey because transparent pixels confuse color reading.
4. Response is validated with zod and written to the item with `tagSource: 'ai'`, `tagStatus: 'done'`.
5. The user can edit any tag with one tap (section 10.4). Editing sets `tagSource: 'ai-edited'`. Nothing ever re-calls Gemini automatically.

### 7.2 The prompt and schema (server, `lib/server/gemini.ts`)

Use `@google/genai` with `responseMimeType: 'application/json'` and a `responseSchema` (structured output). Temperature 0.2. Max output tokens 300. Thinking off or minimal [VERIFY parameter name for 3.5 Flash-Lite, e.g. `thinkingConfig: { thinkingBudget: 0 }`].

System text:

> You tag one clothing item photographed alone on a grey background. Return only JSON matching the schema. Use the closed vocabularies exactly. Warmth is 1 (very light, like a linen tee) to 5 (heavy winter coat). If the image is not a clothing item or accessory, set "isClothing": false. Name is 2 to 4 plain words, color first, no brand names.

Schema fields: `isClothing: boolean`, `name: string`, `category` (enum), `subtype` (enum), `layer` (0|1|2), `colorNames: string[1..3]` (from a 24-name palette list in `engine/types.ts`), `pattern` (enum), `warmth` (1..5), `vibes: Vibe[1..3]`, `waterproof: boolean`, `confidence: number 0..1`.

Server merges `colorNames` with the client's measured hex values (client colors are the truth for harmony math; Gemini names them). If `confidence < 0.5` or `isClothing === false`, the client marks tags as "Check these" with an amber dot.

Token budget per item: one image (about 258 tokens at this size [VERIFY]) plus about 250 tokens of prompt plus about 120 output. 15 items onboarding costs 15 requests total.

### 7.3 Keeping the key safe and limiting abuse

- `GEMINI_API_KEY` exists **only** as a Vercel environment variable (Production + Preview) and in `.env.local` (gitignored). It is read only in `lib/server/gemini.ts`, which starts with `import 'server-only'`. A test greps the client bundle (`.next/static`) for `AIza` and the env name and fails if found.
- Create the key in a **dedicated Google AI Studio project with no billing account linked**, so the worst case is hitting the free quota, never a bill. Write this into README.
- **Install token** (`/api/install`): on first consent, the client gets a token: `base64url(payload).HMAC_SHA256(payload, INSTALL_SECRET)`, payload `{ iid: uuid, iat }`. No account, no personal data. Stored in Settings. The route is limited to 3 tokens per IP per day.
- **Limits in `/api/tag`** (in order, reject early):
  1. Method POST, `Content-Type: application/json`, body under 200 KB, `Origin` matches the deployment host (allow list from `ALLOWED_ORIGINS`).
  2. Valid, unexpired install token (tokens live 180 days; re-issue silently).
  3. Per install: 20 tags / 10 min, 120 / day.
  4. Per IP (`x-forwarded-for` first hop): 40 / day.
  5. Global: `GEMINI_RPM` per minute and `GEMINI_RPD` per Pacific day, matching Google's reset.
  6. Image sniff: decoded header must be WebP or JPEG, max 640 px.
- **Where counters live:** free and stateless is the hard part. Use a fixed-window counter in **Upstash Redis free tier via Vercel Marketplace** if it is still free with no card [VERIFY], key prefix `mw:`. If it is not free, fall back to an in-memory map per function instance (best effort, documented as weak) plus the hard ceiling that Google itself enforces on the project. Either way, Google's quota is the final backstop and costs nothing when hit.
- Return `429` with `Retry-After` seconds and a JSON `{ code: 'rate_limited' | 'daily_budget' | 'global_budget' }`.
- Log only counts and error codes. Never log images or tags.

### 7.4 Client queue, backoff and manual fallback (`lib/tag-queue.ts`)

- State lives in Dexie `tagJobs`, so the queue survives reloads and offline.
- On `429` or `503`: wait `Retry-After` if present, else exponential backoff `min(2^attempts * 5 s, 15 min)` with ±20% jitter. On `daily_budget` or `global_budget`: pause the whole queue until next Pacific midnight + 5 min, and show one calm snackbar: "AI tagging is resting until tomorrow. Tag by hand now, or we will finish later."
- On `4xx` validation error: mark job `dead`, item `tagStatus: 'failed'`, prompt manual tags.
- After 6 attempts: `dead`.
- Triggers: app open, `online` event, after each new item, visibility change to visible. **No timers while hidden, no Background Sync dependency** (iOS lacks it).
- **Manual tagging is always available**, and it is fast: category tiles (6 big icons), then a 3-step chip sheet (warmth slider with 5 labelled stops, pattern, vibes). Colors are pre-filled from the client k-means, so manual tagging needs no AI at all. If `aiConsent === false`, manual is the only path and the app is fully usable.

### 7.5 Consent

Before the first AI tag, a sheet: "Tag with AI? We send only the cut-out picture of the item (no background) to Google Gemini to suggest tags. On Google's free tier, Google may use it to improve their products. You can say no and tag by hand." Buttons: "Use AI tags" / "I will tag by hand". Changeable in Settings. Record the choice in `docs/PRIVACY.md` wording too.

---

## 8. Outfit engine (rules, not AI)

All of `src/engine` is pure TypeScript, deterministic given `(items, weights, history, weather, occasion, seed)`, and fully unit-tested.

### 8.1 Weather input (`lib/weather.ts`)

One browser request to `https://api.open-meteo.com/v1/forecast` with `latitude`, `longitude`, `timezone=auto`, `forecast_days=1`, `current=temperature_2m,apparent_temperature,weather_code`, `hourly=apparent_temperature,precipitation_probability`, `daily=apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max`. [VERIFY parameter names against current docs.]

- Use the **daytime window 08:00 to 20:00** from hourly data to compute `feelsMin`/`feelsMax` (more useful than full-day min at 4 am).
- Cache per `(lat2dp, lon2dp, hour)` in Dexie and SW (`StaleWhileRevalidate`, 1 h). Expected use: 1 to 4 calls per user per day, far under the limits.
- Location: ask for geolocation only when the user taps "Use my location" (`phone-permission-prompt`), round to 2 decimals before sending. Or search a city via Open-Meteo Geocoding. Never ask on load.
- Offline or failure: use the last snapshot if under 24 h old with a "from earlier" label, else ask the user for a quick pick: "Cold / Cool / Mild / Warm / Hot" and "Rain?" toggle.

**Temperature bands** (on `feels`, °C internally):

| Band | feelsMax | Target total warmth | Required layers |
|---|---|---|---|
| hot | ≥ 27 | 1 to 3 | base only, no outer |
| warm | 21 to 26 | 2 to 4 | base, outer optional light (warmth ≤ 2) |
| mild | 15 to 20 | 4 to 6 | base + (mid or light outer) |
| cool | 8 to 14 | 6 to 9 | base + mid + outer, or base + warm outer |
| cold | 0 to 7 | 9 to 12 | base + mid + outer (outer warmth ≥ 4) |
| freezing | < 0 | 11 to 15 | base + mid + outer warmth 5, accessories encouraged |

If `feelsMax - feelsMin ≥ 10`, prefer an outfit with a removable outer layer ("layers you can shed"). Total warmth = sum of warmth of top/dress + bottom + mid + outer (shoes count as 0.5 × warmth).

Rain: if `precipProb ≥ 50` or `precipMm ≥ 2`, prefer waterproof outer and shoes, penalise suede-like (if tagged) and open shoes. Wind ≥ 35 km/h: penalise skirts/dresses lightly unless user up-votes them in wind (learned). UV ≥ 7 and hot: hat bonus.

### 8.2 Color math (`engine/color.ts`)

- Convert hex to **OKLCH**. An item color is **neutral** if chroma `C < 0.04`, or it is a known neutral family: black, white, grey, navy (L < 0.35, hue 240 to 275, C < 0.12), beige / camel / khaki (hue 50 to 95, C < 0.10), denim blue (tagged denim). User override wins.
- Pair harmony `h(a, b)` for the primary colors of two non-neutral items, with `Δ` = hue difference in degrees (0 to 180):
  - analogous `Δ ≤ 30`: 0.8
  - complementary `150 ≤ Δ ≤ 180`: 0.9 (classic accent)
  - split / triadic `110 ≤ Δ < 150`: 0.6
  - awkward `30 < Δ < 110`: 0.2
  - same hue with lightness contrast `ΔL ≥ 0.25` (tonal): 0.85
- Neutral with anything: 0.9. Neutral with neutral: 0.75 (safe, slightly dull). Two neutrals plus one accent is the ideal: bonus.
- Outfit color score `S_color` = mean of pairwise `h` over core pieces (top/dress, bottom, outer, shoes), then:
  - `+0.10` if exactly one non-neutral "accent" and the rest neutral
  - `-0.15` per extra non-neutral beyond 2
  - `-0.20` if two items with patterns other than `solid`/`texture` (pattern clash), unless one is stripe and the other is solid-ish small check (keep simple: any 2 bold patterns = clash)
  - clamp to 0..1

### 8.3 Candidate generation (`engine/candidates.ts`)

Templates (a candidate must fill one):

- A: top + bottom + shoes
- B: dress + shoes
- C: A or B + mid layer
- D: A, B or C + outer
- Optional accessory: at most 1 (scarf when cold, hat when hot UV, bag always allowed)

Hard filters (an item is excluded if it fails):
1. `archived` false.
2. Occasion: item `occasions` contains the day's occasion, or vibes compatible by table (`work` accepts smart, formal, and casual items marked "work ok"; `formal` accepts formal only for core pieces; `workout` accepts sporty only; `home` accepts lounge + casual).
3. Warmth sanity: in `hot`, no item warmth ≥ 4 except shoes; in `cold`/`freezing`, no shorts/sandals.
4. Layer rules per band (table above).
5. Worn in the last 1 day (yesterday) for core pieces: excluded, unless the closet is small (fewer than 3 options in that slot), then allowed with penalty.

Enumeration: for small closets enumerate all combos. Cap with **beam search** when the product exceeds 5,000: keep the top 12 per slot by item-level score (affinity + warmth fit + occasion fit), then combine. Target under 30 ms on a phone for 300 items.

### 8.4 Scoring (`engine/score.ts`)

Every candidate gets a feature vector `f` (all in 0..1) and a score `S = Σ w_k · f_k + affinity terms`:

| Feature key | Meaning | Default weight |
|---|---|---|
| `color` | `S_color` from 8.2 | 3.0 |
| `warmthFit` | `1 - |total - targetMid| / targetSpan`, clamped | 3.0 |
| `layerFit` | 1 if required layers met, 0.5 if layers sheddable on wide range, else 0 | 1.5 |
| `occasionFit` | share of items whose primary vibe is the ideal for the occasion | 2.0 |
| `freshness` | `1 - repeatPenalty` (8.5) | 2.0 |
| `rainFit` | 1 if rain-ready or no rain, else 0 | 1.5 when rain, else 0 |
| `neverWornBoost` | 1 if it includes an item never worn and older than 7 days | 0.6 |
| `patternBalance` | 1 if ≤ 1 bold pattern, else 0 | 1.0 |
| `vibeCohesion` | Jaccard of vibes across core items | 1.0 |

Affinity terms (learned, 8.6): `+ Σ itemAffinity[i]` over items (each clamped −1..1, scaled 0.5), `+ Σ pairAffinity[pairKey]` over item pairs (clamped −1..1, scaled 0.7).

Normalise final `S` into 0..100 for display (`Math.round(100 * S / S_max_possible)`), but keep the raw for ranking.

### 8.5 Recent repeats

- Outfit repeat: if the same `signature` was worn in the last 14 days, `repeatPenalty = 1 - (daysAgo / 14)`.
- Item repeat: for each core item worn in the last 7 days, add `0.15 × (1 - daysAgo/7)`; sum capped at 1.
- Same item as yesterday is filtered (8.3.5).

### 8.6 Learning from 👍/👎 (`engine/learn.ts`)

Signals and rewards `r`: wear (swipe right) `+1.0`, 👍 `+0.7`, "more like this" `+0.5`, skip (swipe left) `-0.2`, 👎 `-0.8`.

Update on each signal, with learning rate `η = 0.08`, decaying as `η_t = 0.08 / (1 + n/50)` where `n` = total signals:

```
for each feature k:  w_k ← clamp(w_k + η_t · r · (f_k - mean_f_k_of_that_deal), 0.2 × default_k, 3 × default_k)
for each item i:     itemAffinity[i] ← clamp(itemAffinity[i] + 0.10 · r, -1, 1)
for each pair p:     pairAffinity[p] ← clamp(pairAffinity[p] + 0.15 · r, -1, 1)
```

Centering on the deal's mean (`f_k - mean`) means a feature only gains weight when the chosen outfit had more of it than the alternatives. Weekly, decay all affinities toward 0 by 5% so old moods fade. Store the vector in `weights`. Settings has "Reset my taste" (restores defaults, keeps history). A unit test proves: after 10 simulated 👍 on high-contrast outfits, the `color` weight is unchanged but contrast-heavy pairs rank higher via pair affinity; after 10 👎 on a given item, it no longer appears in the top 3 unless the closet has no alternative.

### 8.7 The deal of 3 (`engine/deal.ts`)

1. Seed = hash(localDate + installId). Deterministic for the day.
2. Rank candidates by `S`.
3. Pick card 1 = best. Card 2 = best with item overlap ≤ 1 core item vs card 1. Card 3 = best with overlap ≤ 1 vs both, preferring a different color story (accent hue ≥ 60° away) or a different template ("a dress day"). This is MMR style: `S - λ · maxOverlap`, `λ = 0.35 × S_max`.
4. Among near ties (within 3% of each other), break ties with the seed so it does not look robotic.
5. Persist in `DealDay`. Reopening the app shows the same 3 cards all day. "Deal again" (max 3 per day) excludes all already shown outfits.
6. Occasion: default from `defaultOccasionByWeekday` (Mon to Fri `work`, Sat Sun `casual`), changeable with a chip row above the deck; changing it re-deals and counts as a reshuffle only after the first change.
7. Small closet: if fewer than 3 valid outfits, show what exists plus a card "Add a pair of shoes to unlock more looks" pointing to the slot that limits the most.
8. When: compute at first app open on or after `morningHour` local time. Before that hour, Today shows yesterday's pick and "Your looks arrive at 7:00". No push notifications in MVP (Web Push needs a server sender; future flag).

### 8.8 Explanations (`engine/explain.ts`)

One short line per card from the top 2 contributing features, written in plain words, no long dashes:
- "Navy and camel, a classic pair. 12°C, so a jacket on top."
- "Rain after 3. Your waterproof shell comes along."
- "You have not worn the green shirt yet."

---

## 9. Design Lounge kit

Install: `npx skills add SusanAcharya/Design-Lounge`. Read the skill's `SKILL.md` and follow its process (lock recipe, direction, theme, pairing, family before writing UI). Use pieces as references to adapt into React + Tailwind, not as iframes. All IDs below were checked against the repo on 2026-10-14.

### 9.1 Lock

| Slot | ID | Why |
|---|---|---|
| Recipe | `fashion` | Clothes deserve "linen and a Didone, not a product sans". |
| Direction | `washed-linen` ("Soft, natural, slow fashion") | Premium and calm; a wardrobe, not a shop. |
| Theme (light) | `linen-shop` | Flax, clay, sage. Primary `#9d4b2c`, bg `#efe7dc`, surface `#f8f2e8`, ink `#2a211b`. |
| Theme (dark) | `atelier-noir` | `linen-shop` names it as its pair. |
| Pairing | `maison` | Display Bodoni Moda (italic 400, tracking -0.02em), text Tenor Sans (tracking 0.04em, line height 1.55). |
| Family | `editorial` | Radius and shadow from the locked family. |
| Direction hero | `landing-fashion-atelier` | Landing / about page only. |
| Direction effect | `text-mask-line-reveal` | Item names and the "Today" title. |
| Direction work piece | `luxe-product-detail` | Item detail screen. |
| Direction footer | `footer-centered-colophon` | About page and credit line. |

The `fashion` recipe is a web recipe. The app shell borrows native-feel pieces from the `mobile-app` and `shop-app` recipes (listed per screen). Log this cross-recipe borrowing in `DESIGN.md` as a deliberate departure.

Rules from the theme file: colors only from the theme; fonts only from the pairing; radius and shadow only from the family. Feedback colors (`--success`, `--danger`, etc.) are for live state only, never decoration. Note: in `linen-shop`, `--danger` equals `--primary` (`#9d4b2c`). So **never use primary to mean an error**; errors always pair danger color with an icon and words. Log this.

Typography care: Bodoni Moda is a high-contrast Didone. Use it only at 24 px and above (titles, item names on detail, outfit card headline). Everything under 24 px is Tenor Sans. Tenor Sans has one weight, so emphasis is size, color and letterspacing, not bold. Numbers use the text face (`numbers: "text"`), with `font-variant-numeric: tabular-nums` in stats. Self-host both fonts via `next/font/google` so they work offline.

### 9.2 Pieces per screen

| Screen | Piece IDs |
|---|---|
| App shell | `pwa-app-shell`, `ios-glass-tab-bar` (iOS feel; tabs: Today, Closet, Scan (center), History, Settings), `m3-navigation-bar` as the reference for Android spacing, `phone-splash-launch`, `m3-snackbar`, `m3-dialog` |
| Install | `pwa-install-sheet` (after first outfit is picked, never on first load) |
| Onboarding / closet scan | `ios-onboarding-carousel` (3 slides), `phone-permission-prompt` (model download, location), `phone-qr-scanner` as the viewfinder frame reference, `scan-page` (the scan beam), `upload-file-queue` (items processing), `card-progress-goals` (progress), `diamond-badge-rail` (badges), `gallery-contact-sheet` (the growing closet) |
| Today | `ios-weather-hourly-scrub` (weather strip with hourly scrubber), `card-stacked-deck` (the 3 card deck with swipe and undo), `tabs-morphing-underline` (occasion chips), `m3-modal-bottom-sheet` (why this outfit), `spring-deck` (deck motion) |
| Closet grid | `mobile-filter-chips-list`, `masonry-gallery-captions` (grid), `phone-search-results`, `phone-skeleton-list`, `mobile-list-empty`, `staggered-list-reveal` |
| Item detail | `luxe-product-detail`, `phone-product-detail`, `shared-element-expand` (grid thumb to detail), `ios-bottom-sheet-detents` (tag editor), `toggle-switch-set` |
| History | `phone-calendar-agenda`, `card-polaroid-frames` (past outfit tiles), `charts-kpi-spark-row`, `widget-activity-rings` (wardrobe use rings), `odometer-counter` |
| Share | `button-copy-share`, `dropdown-share-menu` |
| Settings | `m3-settings-list`, `toggle-switch-set` |
| Errors / offline | `mobile-load-failed`, `mobile-list-empty` |
| About / landing | `landing-fashion-atelier`, `footer-centered-colophon` |

Before using any piece, open its file in the installed skill and confirm the ID and its props. If a piece is missing in the installed version, pick the nearest in the same category and log it.

### 9.3 Motion recipes (Motion `motion/react`, every one with a reduced-motion fallback)

Global: read `useReducedMotion()` and the in-app override. Under reduced motion: no translation over 8 px, no scale, no parallax, no confetti; use 120 ms opacity fades. Durations stay under 400 ms except the wow moment.

| Name | Where | Spec | Reduced motion |
|---|---|---|---|
| `lift-off` (wow, 9.4) | cutout done | see 9.4 | crossfade original to cutout, 200 ms |
| `deal-in` | Today load | cards enter from below in order, spring stiffness 260 damping 26, 60 ms stagger | fade in together |
| `swipe-commit` | deck | drag with `dragElastic 0.6`; commit past 35% width or velocity > 600; card rotates max 8°; "Wearing it" stamp fades in at 20% | buttons only (Wear / Skip / More like this), no drag needed, instant swap with fade |
| `undo` | deck | last card springs back from its exit side | fade back |
| `shared-expand` | grid → detail | `layoutId` on the cutout image | none, page fade |
| `line-reveal` | titles | `text-mask-line-reveal`, 360 ms, 40 ms per line | none |
| `badge-pop` | badges | scale 0.6 → 1, spring, a 12 particle linen confetti from the theme tertiary | badge appears with fade + announce |
| `progress-fill` | scan bar | width spring, number ticks via `odometer-counter` | width set, no ticking |
| `sheet` | sheets | `ios-bottom-sheet-detents` snap points 40% / 90% | fade + no drag snap animation |

All drag interactions have a button alternative (WCAG 2.5.7).

### 9.4 Signature wow moment: "The Lift"

When a photo finishes cutting out:

1. The raw photo sits in the viewfinder frame. A thin linen-colored **scan beam** (`scan-page`) sweeps top to bottom over 700 ms.
2. Behind the beam, the background dissolves (mask animates from the alpha matte: draw original, then cross-blend to cutout with a moving gradient mask).
3. The garment **lifts**: it scales to 1.04 and gains the family's shadow, like paper peeled off a page (300 ms spring).
4. It flies into its slot on the **contact sheet** (`gallery-contact-sheet`) below with a small rotation (±2°), the progress bar ticks, and Gemini's tag chips type in a moment later with `loader-text-shimmer` turning into words.
5. A short haptic `navigator.vibrate(12)` where supported (Android).

Total about 1.4 s. Reduced motion: 200 ms crossfade from photo to cutout, item appears in the sheet, a polite live region says "Navy oxford shirt added. 7 of 15."

### 9.5 Lounge Icons

Use Lounge Icons from the skill (check the installed skill for the icon set name, folder and import style [VERIFY exact path]). One stroke weight across the app, 24 px grid, `currentColor`. Map: today (sun-hanger or sun), closet (hanger), scan (camera / aperture), history (calendar), settings (sliders), wear (check), skip (x), more like this (sparkle), thumbs up/down, rain, wind, temperature, share, download, upload, edit, trash, lock (privacy). If an icon is missing, draw it on the same grid and stroke and log it in `DESIGN.md`. Icon-only buttons have `aria-label`.

### 9.6 Closet scan onboarding (fun, not a form)

- Carousel (3 slides): "Snap it once", "We cut it out on your phone", "Three looks every morning". Bodoni headlines with `line-reveal`.
- Goal picker: "Start with 10" (default) or "Go for 15".
- Shooting screen: viewfinder frame, a slot hint ("Next: a top") that rotates through top, bottom, shoes, outer to get a balanced starter closet. User can ignore it.
- Progress bar: `n / goal`, with the next badge shown at the end of the bar.
- **Badges** (stored in `settings.badges`, shown on `diamond-badge-rail`):
  - "First thread" (1 item), "Full outfit" (first top + bottom + shoes), "Layer up" (first outer), "Ten strong" (10 items), "Rainbow rack" (5 distinct color families), "Closet curator" (15 items), "Monsoon ready" (a waterproof outer), later: "Week of looks" (7 days picked in a row), "Rediscovered" (wore a never-worn item), "Hundred hangers" (100 items).
- Finish: "Your closet is ready" + first deal right away (even if before morning hour).

### 9.7 Credit line

Footer of About and the bottom of Settings: "Designed using Design Lounge" linking to https://www.designlounge.live (as the theme file states). Also in README.

### 9.8 `DESIGN.md` log

Start it in milestone 1 with: the lock table, the pieces table, the motion table, and a "Departures" list. Every time you deviate (piece missing, color tweak for contrast, cross-recipe borrowing, icon drawn), add a dated line: what, why, and the WCAG number if it was for contrast.

---

## 10. Screens in detail

### 10.1 Today (`/today`)
- Top: date in Tenor Sans caps, "Today" in Bodoni italic, weather strip (feels like range, rain chance, wind; scrub hourly). Attribution "Weather data by Open-Meteo.com" in small text under the strip.
- Occasion chip row.
- Deck of 3 outfit cards. Card layout: **flat-lay** (2 column collage: outer/top left, bottom right, shoes bottom, accessory top right) or **stacked** (vertical: outer, top, bottom, shoes, overlapped 18%). User toggles in Settings; default flat-lay. Cards show score bar (subtle), one reason line, 👍 and 👎.
- After picking: card shrinks to a "Wearing today" pill at top; deck replaced by "Good choice" + share button.

### 10.2 Closet grid (`/closet`)
- Filter chips: Category, Color (swatches), Warmth (1 to 5), Occasion, Vibe, Pattern, "Never worn", "Needs tags". Sorting: newest, most worn, least worn, color (hue order, lovely as a rainbow rack).
- Masonry grid of cutouts on surface cards. Count in header.
- Empty states for each filter.

### 10.3 Item detail (`/closet/[id]`)
- Large cutout, name (Bodoni), tag chips, wear count, last worn, "Outfits with this" strip (top 6 from engine with this item forced in), cost per wear (optional price field), Archive, Delete (confirm dialog), Re-cut, Re-tag with AI (explicit button, respects limits).

### 10.4 One-tap tag editing
- Tap a chip, a bottom sheet opens at 40% detent with that field's options as big chips; tap one, sheet closes, saved. Warmth uses a 5-stop segmented control with labels ("Feather", "Light", "Mid", "Warm", "Heavy"). Colors: tap a swatch to adjust with an eyedropper on the cutout or a palette.

### 10.5 History (`/history`)
- Month calendar (`phone-calendar-agenda`) with tiny outfit thumbnails per day. Tap a day: that outfit card.
- Stats: items worn this month, % of closet used (ring), most worn item, longest streak, color mix of worn outfits.
- **Never worn insights:** items never worn and added more than 14 days ago: "6 pieces waiting. Want them in tomorrow's deal?" Toggle that sets `neverWornBoost` weight × 3 for 7 days. Also "Not worn in 90 days" list with "Archive?" suggestion.

### 10.6 Share card (client only)
- Render on a 1080 × 1350 canvas: linen background from the theme, the outfit cutouts laid out flat-lay, date, weather glyph and temperature, optional reason line, and a small "Masta Wastra" wordmark. Fonts must be loaded (`document.fonts.ready`) before drawing.
- Export PNG via `canvas.toBlob`. Share with `navigator.share({ files: [file] })` when `navigator.canShare({ files })` is true; else download. No server.

### 10.7 Settings
- Theme mode, units, location, morning hour, weekday occasions, AI tagging consent, cutout quality, keep originals, reduced motion override, storage use, export, import, reset taste, delete everything (double confirm), about.

---

## 11. PWA and offline

- `manifest.webmanifest`: `name: "Masta Wastra"`, `short_name: "Wastra"`, `display: "standalone"`, `start_url: "/today?source=pwa"`, `scope: "/"`, `background_color` = linen-shop `--bg` `#efe7dc`, `theme_color` = `--surface` `#f8f2e8` (dark variant via `<meta name="theme-color" media="(prefers-color-scheme: dark)">` using atelier-noir bg), icons 192 / 512 / maskable 512, `screenshots` narrow and wide, `shortcuts`: "Scan an item" → `/scan`, "Today" → `/today`.
- iOS: `apple-touch-icon`, `apple-mobile-web-app-capable`, status bar style. Install sheet explains Share > Add to Home Screen on iOS (no `beforeinstallprompt` there).
- Service worker (Serwist): precache app shell, routes and fonts; `NetworkOnly` for `/api/*`; `StaleWhileRevalidate` for Open-Meteo; `CacheFirst` for model files (6.3); navigation fallback `/offline` only for routes not precached.
- Offline behaviour: all screens work. Scan works (cutout works offline once the model is cached; tagging queues). Today uses cached weather or the manual weather pick.
- Update flow: when a new SW is waiting, snackbar "A fresh version is ready. Reload". Never auto-reload mid-scan.

---

## 12. Accessibility

- WCAG 2.2 AA. Verify every text and UI color pair from the themes with a contrast check in a unit test (`tests/unit/contrast.test.ts`) for both themes. If a pair fails (check `--ink-3` on `--surface-2`), adjust lightness minimally and log in `DESIGN.md`.
- Touch targets ≥ 44 × 44 px. Tab bar labels always visible.
- Every swipe has buttons. Keyboard: arrow keys on the deck, Enter to wear.
- Images: cutouts have `alt` = item name + colors ("Navy oxford shirt, navy and white").
- Live regions: scan progress, tagging results, deal ready, errors.
- Dynamic type: layout holds at 200% text (`phone-large-text-layout` as reference).
- Focus visible with `--focus`. Sheets trap focus and restore it.
- Reduced motion as in 9.3. Also `prefers-reduced-transparency` → solid tab bar instead of glass.
- Color is never the only signal (tag status dots also have text).

---

## 13. Data export and backup

- **Export** (`db/backup.ts`): a single `.wastra.zip` built on the client (use `fflate`, MIT [VERIFY version]) containing `manifest.json` (`{ app: 'masta-wastra', schemaVersion, exportedAt, counts }`), `data.json` (all tables except images), and `images/<id>.webp|jpg`. Option "Without photos" for a tiny JSON-only backup. Share or download.
- **Import:** validate with zod, show a preview ("42 items, 18 outfits, 30 wears"), choose Merge (by id, newer `updatedAt` wins) or Replace. Run migrations if `schemaVersion` is older.
- Reminder: a gentle monthly card in Settings: "Last backup 34 days ago".
- Delete everything: clears Dexie, caches, and local storage, and unregisters the SW.

### 13.1 Later: Supabase sync (not MVP, flag `sync`)
Write `docs/SYNC.md` with the plan only: Supabase Auth (magic link), tables mirroring Dexie with `user_id` and RLS, images in Storage, last-write-wins by `updatedAt`, sync on open. Note the free project pause after inactivity [VERIFY] and that the app must keep working local first.

---

## 14. Milestones and acceptance criteria

**M0. Setup and verification**
- Next 16 app, TypeScript strict, Tailwind 4, ESLint, Vitest, Playwright. `LICENSE` AGPL-3.0. `docs/VERIFICATIONS.md` filled for every [VERIFY] in section 2.
- Accept: `npm run build` passes; verification file has source + date per fact; Gemini model id and free limits confirmed in AI Studio (Susan may need to read them; leave a clear checklist item if you cannot).

**M1. Design system and shell**
- Design Lounge installed, lock applied, themes as CSS variables, fonts via `next/font`, light/dark/system switch with no flash (inline script), tab bar shell, empty screens, `DESIGN.md` started, credit line.
- Accept: Lighthouse a11y ≥ 95 on the shell; contrast test passes for both themes; dash test passes.

**M2. Data layer**
- Dexie schema, repo functions, export/import, persist storage request.
- Accept: unit tests with `fake-indexeddb` for CRUD, migrations, export → import round trip equality.

**M3. Capture and cutout**
- Camera input, resize, worker, imgly with quint8, model download sheet, SW caching of model, manual crop fallback, color extraction, The Lift.
- Accept: 15 fixture photos process without crash in Playwright (Chromium); on a real phone: second-session cutout works offline; timings recorded; reduced motion version verified.

**M4. Tagging**
- `/api/install`, `/api/tag`, limits, queue with backoff, consent, manual tag sheets, one-tap editing.
- Accept: unit tests for queue backoff and budget pause; route tests for each 4xx/429 path; bundle grep test finds no key; with network off, items stay `queued` then finish when online; with consent off, no request ever leaves.

**M5. Engine**
- Weather fetch + cache + manual fallback, candidates, scoring, deal, explain, learning.
- Accept: unit tests (section 15.1) all green; 300 item synthetic closet deals in under 50 ms in Node; same inputs give the same 3 outfits.

**M6. Today and closet scan polish**
- Deck with swipe and buttons, occasion chips, deal again, wear logging, onboarding with progress and badges.
- Accept: e2e: fresh install → scan 10 fixtures → first deal shows 3 distinct outfits → swipe right logs a wear → reload shows same pick.

**M7. Closet, detail, history, insights**
- Accept: filters combine correctly (unit tested query builder); calendar shows wears; never-worn list correct for seeded data.

**M8. Share, PWA, offline**
- Share card, manifest, install sheet, SW update flow.
- Accept: Lighthouse PWA installable checks pass [VERIFY current Lighthouse PWA audits]; e2e offline test: after first visit, airplane mode, app opens and Today works with cached weather.

**M9. Hardening and deploy**
- CSP, headers, error boundaries, empty states, README, PRIVACY, deploy to Vercel Hobby.
- Accept: production URL works on iOS Safari and Android Chrome, installable; `/api/tag` returns 429 under a scripted burst; no console errors.

---

## 15. Testing plan

### 15.1 Unit (Vitest)
- `color`: hex→OKLCH known values; neutral detection for black, white, navy, camel, denim; harmony table edges (Δ = 30, 110, 150).
- `warmth`: band boundaries (−0.1, 0, 7.9, 8, 14.9, 15, 20.9, 21, 26.9, 27); total warmth math; shed-layer rule.
- `candidates`: hard filters (occasion, hot no coat, cold no shorts, yesterday exclusion with small-closet exception); beam cap kicks in.
- `score`: each feature isolated; pattern clash; repeat penalty curve.
- `deal`: determinism by seed; diversity (overlap ≤ 1 core item); fewer than 3 handling; reshuffle cap.
- `learn`: centered updates, clamps, decay, reset; the two behaviour tests in 8.6.
- `tag-queue`: backoff timings with fake timers, `Retry-After` respected, budget pause until Pacific midnight (test across DST).
- `server/ratelimit` and `token`: HMAC verify, expiry, each limit.
- `copy`: scan `lib/copy.ts` and all `.tsx` string literals for U+2014 and U+2013; fail if found.
- `contrast`: both themes, AA pairs.

### 15.2 End to end (Playwright, mobile viewports 390 × 844 and 360 × 800, plus 1280 desktop)
- Onboarding happy path with fixtures (mock `/api/tag` with a fixture responder; one test hits the real route in preview with a tiny budget, skipped in CI without the key).
- Manual tagging path with consent off.
- Swipe and button alternatives; keyboard deck control.
- Offline: `context.setOffline(true)` after warm-up.
- Export then import into a fresh context; data equal.
- axe checks on every screen in both themes (`@axe-core/playwright`), zero serious or critical.
- Reduced motion: `reducedMotion: 'reduce'` context; assert no transform animations on deck.

### 15.3 Manual device checklist (`docs/DEVICE-CHECKS.md`)
iPhone (Safari, installed PWA), mid Android (Chrome, installed). Camera capture, cutout timing, memory after 15 items, install, offline open, share sheet with image, haptic, dark mode, 200% text.

---

## 16. Security and privacy

- Headers via `vercel.json` / `next.config`: CSP (`default-src 'self'; img-src 'self' blob: data:; connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com https://staticimgly.com; worker-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'` plus what Next needs [VERIFY nonce approach]), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), geolocation=(self)`, `X-Content-Type-Options: nosniff`.
- No analytics in MVP. If added later, use Vercel Web Analytics free tier [VERIFY] and say so in PRIVACY.
- `docs/PRIVACY.md`: photos and closet stay on the device; the cutout goes to Google Gemini once per item only with consent, and the free tier may be used to improve Google products; rounded location goes to Open-Meteo; nothing is stored on our server; how to export and delete.

---

## 17. Deployment (Vercel Hobby)

1. Push to GitHub (public repo, AGPL-3.0).
2. Import into Vercel (Hobby). Framework preset Next.js. Node version [VERIFY].
3. Env vars (Production and Preview): `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.5-flash-lite`, `GEMINI_RPM=10`, `GEMINI_RPD=400`, `INSTALL_SECRET` (32 random bytes, base64url), `ALLOWED_ORIGINS` (comma list), and if used `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` [VERIFY free].
4. Route handlers: `export const runtime = 'nodejs'`, `export const maxDuration = 20`. [VERIFY Hobby allows this value.]
5. No cron jobs. No paid add-ons. Spend management not needed on Hobby, but confirm no payment method is attached.
6. Preview deploys use a separate Gemini key from a separate free project if possible, so tests cannot drain production quota.
7. After deploy: run the device checklist, record results.

README must include: what it is, screenshots, local setup (`npm i`, `.env.local`, `npm run dev`), how to create the Gemini key in a no-billing project, deploy steps, limits, privacy summary, licenses (AGPL-3.0 for this app because of `@imgly/background-removal`; Open-Meteo CC BY 4.0 attribution; fonts OFL), and the Design Lounge credit.

---

## 18. Definition of done

- All milestones accepted. All [VERIFY] items resolved in `docs/VERIFICATIONS.md`.
- A new user on a phone can install, scan 10 items, get 3 looks the next morning without any network except weather, pick one by swiping, see it in history, share an image, and export a backup.
- Gemini is called exactly once per item (asserted by a counter test across a simulated 30 day run with daily deals: 0 extra calls).
- No long dashes in UI. Credit line present. `DESIGN.md` complete.
