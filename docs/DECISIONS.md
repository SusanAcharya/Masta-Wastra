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
