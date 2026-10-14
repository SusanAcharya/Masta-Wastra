# Masta Wastra

*Masta* means carefree, *wastra* means clothing (Nepali). A smart wardrobe that lives on your phone.

1. **Add your clothes.** Take or pick photos, as many as you like. Each one is cut out on the phone and recognised automatically: what it is, its colours, warmth, pattern and style. No forms.
2. **Ask for an outfit.** Tap **Pick my outfit**. It reads today's weather where you are and picks one outfit from your own clothes, with a line on why it works. **Show another** gives a clearly different one.
3. **Wear it.** The outfit is saved to History, the app learns what you like, and you can share the outfit as a picture.

Live: https://masta-wastra.vercel.app

## How it works

- **Next.js 16** (App Router, Turbopack, Cache Components), React 19, Tailwind 4, Motion.
- **Local first.** Closet, photos, outfits and history live in IndexedDB (Dexie) on the device. No account. The app works offline after the first load (a Serwist service worker precaches every page).
- **Background removal on the device** with `@imgly/background-removal` in a Web Worker (WASM, threads via cross-origin isolation, WebGPU when present). The 45 MB model is downloaded once from IMG.LY's CDN and cached.
- **Recognition with Gemini, once per piece.** The cut-out (no background, 512 px) goes to `/api/tag`, a Vercel route that holds the key and calls `gemini-3.5-flash-lite` (fallback `gemini-3.1-flash-lite`) with a strict JSON schema. Gemini is never called for outfits, on a schedule, or on app open.
- **Outfits come from rules, not AI**: colour harmony in OKLCH (the most important part), warmth bands from the feels-like temperature, layers, rain, wind, occasion, repeats and what you liked. Instant, free, offline. See [docs/ALGORITHM.md](docs/ALGORITHM.md).
- **Weather** from Open-Meteo, called straight from the browser.

## Local setup

Needs Node 22.12 or newer.

```bash
npm install
cp .env.example .env.local   # then fill it in, see below
npm run dev                  # http://localhost:3000
```

Production build, the way Vercel runs it (also builds the service worker):

```bash
npm run build && npm start
```

### Environment

| Variable | What |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key. **Create it in a project with no billing account linked**, so the worst case is hitting the free quota, never a bill. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.1-flash-lite` (`none` to turn off) |
| `GEMINI_RPM`, `GEMINI_RPD` | Global budget per model, a margin under the free tier: `10` and `45` |
| `INSTALL_SECRET` | 32+ random characters: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `ALLOWED_ORIGINS` | Comma list, e.g. `https://masta-wastra.vercel.app` (the deployment's own host is always allowed) |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (free, Vercel Marketplace, prefix `KV`). Without them, rate limit counters are in memory per instance. |

Without `GEMINI_API_KEY` and `INSTALL_SECRET` the app still works: new pieces wait as "Needs a tag" and can be tagged by hand with one tap.

### Gemini key in a no-billing project

1. Open https://aistudio.google.com, **Projects**, **Create project** (name it `masta-wastra`). Do not set up billing.
2. **API keys**, **Create API key** in that project.
3. **Rate limit** shows the project's free limits. On 2026-10-14 they were 15 requests a minute and 50 a day per model, which is why `GEMINI_RPD` is 45.

## Deploy (Vercel Hobby)

1. Push to GitHub. The repo must stay public (AGPL, see Licences).
2. Import into Vercel, framework Next.js. Default Node (24.x) is fine.
3. Add the environment variables above for Production and Preview. Ideally use a second Gemini key from a second free project for Preview, so tests cannot use up production's daily quota.
4. Vercel Marketplace, **Upstash for Redis**, Free plan, connect to the project with prefix `KV`.
5. Deploy. No cron jobs, no paid add-ons.

## Limits (free tiers)

- Gemini free tier: about 50 recognitions a day per model per project, shared by every user. With the fallback model, about 90 a day. When both are spent, recognition rests until midnight Pacific time and picks up again by itself. Manual tagging always works.
- Per install: 20 recognitions per 10 minutes, 30 a day. Per IP: 40 a day.
- Open-Meteo: free for non-commercial use, under 10,000 calls a day. The app makes at most one call per place per hour.
- Upstash free: 500,000 commands a month.

## Privacy

Photos, closet and history never leave the phone. The only things that do: one cut-out per piece to Google Gemini (with the on-screen notice; Google's free tier may use it to improve their products; it can be turned off in Settings), and your rounded location to Open-Meteo. The server stores nothing about you. Details: [docs/PRIVACY.md](docs/PRIVACY.md).

## Tests

```bash
npm test            # unit: engine, colour, data layer, backup, queue, server routes, contrast, no long dashes
npm run test:e2e    # Playwright: shell, accessibility (axe, both themes), scan, pick, offline
npm run typecheck && npm run lint
```

Test photos in `tests/fixtures/garments` are synthetic (drawn garments on household textures, `tests/fixtures/make-garments.py`).

## Project notes

- [docs/DECISIONS.md](docs/DECISIONS.md): every choice the build prompt left open, and every product change.
- [docs/VERIFICATIONS.md](docs/VERIFICATIONS.md): every external fact checked, with source and date.
- [docs/DEVICE-CHECKS.md](docs/DEVICE-CHECKS.md): the real phone checklist.
- [DESIGN.md](DESIGN.md): the Design Lounge system, pieces, motion and every departure.

## Licences and credits

- **Masta Wastra is free software under the GNU AGPL 3.0** ([LICENSE](LICENSE)), because it ships `@imgly/background-removal` (AGPL 3.0) to the browser. The app links to this source from About.
- Weather data by [Open-Meteo.com](https://open-meteo.com/), CC BY 4.0.
- Fonts: Bodoni Moda and Tenor Sans, SIL Open Font License.
- Icons: Lounge Icons, plus a few from [Lucide](https://lucide.dev) (ISC).
- Designed using [Design Lounge](https://www.designlounge.live).
