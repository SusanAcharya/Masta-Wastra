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
- **2026-10-14. Source link** points at `https://github.com/SusanAcharya/masta-wastra` (`SOURCE_URL` in `src/lib/copy.ts`). The repo does not exist yet; create it public before deploy (AGPL).
- **2026-10-14. `.claude/skills/` is gitignored; `skills-lock.json` is committed.** The repo is public (AGPL) and Design Lounge asks not to republish the catalogue. Restore the skill with `npx skills experimental_install`.

## From the AI Studio rate limits (applies to M4)

- **2026-10-14. Global Gemini budget is 45 per Pacific day per model** (`GEMINI_RPD=45`, free tier is 50 RPD per project). One 15 item scan uses 15, so the app as a whole onboards about three closets a day before tagging rests. Manual tagging keeps the app fully usable.
- **2026-10-14. Fallback model `gemini-3.1-flash-lite` (`GEMINI_FALLBACK_MODEL`) takes over when the primary's daily budget is spent.** Its quota is separate (also 50 RPD), so about 90 tags a day in total. Budget counters are kept per model.
- **2026-10-14. Per install limit lowered to 30 tags per day** (prompt said 120), so one person cannot drain the shared budget. 20 per 10 minutes and 40 per IP per day stay as written.
