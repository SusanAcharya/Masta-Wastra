# DESIGN.md

Running Design Lounge log for Masta Wastra. Designed using [Design Lounge](https://www.designlounge.live).

## Brief

Request, word for word:
"Take a look at @MASTA-WASTRA-PROMPT-v1.0.md and let's start baby!!!"

Product: Masta Wastra, a smart wardrobe PWA. "Masta" is carefree, "wastra" is clothing (Nepali). Snap each item once, it is cut out on the phone, tagged once by Gemini, and every morning three outfit cards are dealt by rules from the weather and the occasion. Swipe to wear. Free tiers only, local first, AGPL-3.0.
For: one person getting dressed, phone in hand, in the first minute of the morning. They want to see three looks that fit today's weather and pick one.
World: washed linen, a hanger on a door, morning light
The one thing: the morning deck. Three outfit cards made of real cutouts of your own clothes, stacked like a dealt hand, swipe right to wear.
Ambition: finished, because the build prompt says "Design Lounge, ambitiously" for a daily tool.
Mode: Kit
Named aesthetic: none
Stack: Next.js 16 App Router, React 19, Tailwind 4, Motion, Dexie, Serwist (build prompt section 3)
Missing: app icon art, fixture garment photos. Source: https://github.com/SusanAcharya/Masta-Wastra

Hard limits:
- No stock photos. Garments are the user's own cutouts; anything else is drawn in CSS or SVG.
- No placeholder copy, no invented numbers. Example data in tests only.
- Works at 390 x 844, 360 x 800 and 1280 x 800.
- prefers-reduced-motion stills every effect (prompt 9.3). Every swipe has a button.
- No em dash or en dash in UI text.

Done means: all milestones in the build prompt, every screen opened in light, dark and at 200% text, fixed, and the closing block written.

## System sheet

```
Product: Masta Wastra
Who: one person, getting dressed, phone in hand
Decision: which of three looks to wear today
First thing they see: today's weather strip and the top card of the deck
Next action: swipe right (or tap Wear) to log the outfit
Job of this pass: M1, the system, the shell and empty screens
Scope: Today, Closet, Scan, History, Settings, About, Offline
Idea: The home is a dealt hand of three outfit cards built from cutouts of your own clothes, on linen.
Signature: the Lift. A photo's background dissolves under a linen scan beam and the garment peels off the page into the contact sheet.
Avoiding: a generic shopping app grid with a product sans and a purple "AI stylist" gradient.
Register: quiet in the shell, one effect: text-mask-line-reveal on titles
Show: no
Dials: variance 5 · motion 6 · density 3 (premium, calm; one wow moment)
Kind: product
Mode: new kit
Recipe: fashion · Direction: washed-linen (washed linen, a hanger, morning light; "Soft, natural, slow fashion")
Recent: no fashion or washed-linen pick in ~/.design-lounge/history.jsonl, so it stands
Theme: linen-shop (pair: atelier-noir)
Why this theme: flax, clay and sage read as a wardrobe, not a shop; the clay primary is warm on cutouts
Rejected: atelier-noir as the light default (too much night for a 7 am screen); paper-ink (used by InstantCV today)
Pairing: maison (Bodoni Moda + Tenor Sans)
Family: editorial (radius 2px, outline buttons, density air, shadow none)
Icons: Lounge Icons, 24px, stroke 1.75 (plus Lucide and one drawn icon, see Departures)
Motion: cubic-bezier(0.2, 0.7, 0.2, 1) · UI 200ms · layout 320ms · sheets 400ms · effect: text-mask-line-reveal
Density: air (page padding 20 on phone, stack gap 24, control 48px on phone)
Shell: none (phone tab bar), content column 720px
Panel: none
Nav: Outfit, Closet, Add, History, Settings
Phone nav: tabs (ios-glass-tab-bar), same labels on every width
Pieces: see Pieces per screen
Kept from their system: n/a, new kit
```

Pairing caution: Bodoni Moda is a high-contrast Didone. It is used only at 24px and above (h1, h2, `.display`). Everything under 24px, including h3, is Tenor Sans. Tenor Sans has one weight, so emphasis is size, colour and tracking. Numbers use the text face with `tabular-nums`.

## Lock (prompt 9.1)

| Slot | ID | Note |
|---|---|---|
| Recipe | `fashion` | web recipe; app shell borrows from `mobile-app` and `shop-app` (Departures) |
| Direction | `washed-linen` | Soft, natural, slow fashion |
| Theme (light) | `linen-shop` | `src/styles/theme-linen-shop.css`, numbers unchanged |
| Theme (dark) | `atelier-noir` | `src/styles/theme-atelier-noir.css`, numbers unchanged |
| Pairing | `maison` | `next/font/google`, self-hosted, works offline |
| Family | `editorial` | 2px radius, outline buttons, air, no shadow |
| Direction hero | `landing-fashion-atelier` | About page only |
| Direction effect | `text-mask-line-reveal` | item names and the Today title (M6) |
| Direction work | `luxe-product-detail` | item detail (M7) |
| Direction footer | `footer-centered-colophon` | About page |

## Pieces per screen (prompt 9.2)

Status: built, M# (later milestone), or adapted.

| Screen | Piece IDs | Status |
|---|---|---|
| App shell | `pwa-app-shell`, `ios-glass-tab-bar`, `m3-navigation-bar` (Android spacing reference), `phone-splash-launch`, `m3-snackbar`, `m3-dialog` | tab bar built M1; splash, snackbar M6/M8; dialog pattern built in the theme picker |
| Install | `pwa-install-sheet` | M8 |
| Onboarding / scan | `ios-onboarding-carousel`, `phone-permission-prompt`, `phone-qr-scanner`, `scan-page`, `upload-file-queue`, `card-progress-goals`, `diamond-badge-rail`, `gallery-contact-sheet` | M3, M6 |
| Today | `ios-weather-hourly-scrub`, `card-stacked-deck`, `tabs-morphing-underline`, `m3-modal-bottom-sheet`, `spring-deck` | M6; empty state built M1 |
| Closet grid | `mobile-filter-chips-list`, `masonry-gallery-captions`, `phone-search-results`, `phone-skeleton-list`, `mobile-list-empty`, `staggered-list-reveal` | empty state built M1; rest M7 |
| Item detail | `luxe-product-detail`, `phone-product-detail`, `shared-element-expand`, `ios-bottom-sheet-detents`, `toggle-switch-set` | M7 |
| History | `phone-calendar-agenda`, `card-polaroid-frames`, `charts-kpi-spark-row`, `widget-activity-rings`, `odometer-counter` | empty state built M1; rest M7 |
| Share | `button-copy-share`, `dropdown-share-menu` | M8 |
| Settings | `m3-settings-list`, `toggle-switch-set` | list and theme dialog built M1; more rows M2 to M8 |
| Errors / offline | `mobile-load-failed`, `mobile-list-empty` | offline page built M1 |
| About / landing | `landing-fashion-atelier`, `footer-centered-colophon` | built M1 |
| PWA (skill minimum) | `pwa-connectivity-banner`, `pwa-update-toast` | M8 |

## Motion (prompt 9.3)

Global: `useReducedMotion()` plus the in-app override. Under reduced motion: no translation over 8px, no scale, no parallax, no confetti; 120ms opacity fades. Durations under 400ms except the Lift.

| Name | Where | Spec | Reduced motion | Status |
|---|---|---|---|---|
| `lift-off` | cutout done | prompt 9.4, about 1.4s | 200ms crossfade | M3 |
| `deal-in` | Today load | from below, spring 260/26, 60ms stagger | fade together | M6 |
| `swipe-commit` | deck | dragElastic 0.6; commit past 35% or 600 px/s; max 8deg; stamp at 20% | buttons only, fade swap | M6 |
| `undo` | deck | springs back from exit side | fade back | M6 |
| `shared-expand` | grid to detail | `layoutId` on the cutout | page fade | M7 |
| `line-reveal` | titles | `text-mask-line-reveal`, 360ms, 40ms per line | none | M6 |
| `badge-pop` | badges | 0.6 to 1 spring, 12 particle linen confetti | fade + announce | M6 |
| `progress-fill` | scan bar | width spring, `odometer-counter` | width set | M6 |
| `sheet` | sheets | detents 40% / 90% | fade, no snap animation | M4 |
| tab lens | tab bar | 420ms `--ease-ios-sheet`, squash 1.22 x 0.9 at 35% | 1ms, no squash | built M1 |

## Departures

- **2026-10-14. Cross-recipe borrowing.** `fashion` is a web recipe; the app shell uses phone pieces from `mobile-app` and `shop-app` (`ios-glass-tab-bar`, `m3-*`, `phone-*`). Deliberate, per prompt 9.1.
- **2026-10-14. Glass tab bar on an editorial family.** The family rules forbid glass by default; the build prompt names `ios-glass-tab-bar` (their words win). Kept to the one element. Under `prefers-reduced-transparency` it becomes solid `--surface` with a `--line` border (prompt 12).
- **2026-10-14. Tab bar radius 2px, not a capsule.** The family sets radius over the piece brief. The bar, lens and focus rings use 2px.
- **2026-10-14. Five route links, not four ARIA tabs plus a search island.** Each item navigates to a page, so they are `<a aria-current="page">` in a `<nav>`, all in the Tab order. Scan is the centre item (prompt 9.2).
- **2026-10-14. Current tab label is `--ink`, icon is `--primary`.** `--primary` text on the `--primary-soft` lens is under 4.5:1 in linen-shop (axe 1.4.3). `--ink` on `--primary-soft` is a tested pair.
- **2026-10-14. Tab labels 11px**, not the brief's 10px, to stay inside the label role (11 to 12px).
- **2026-10-14. Buttons are 48px on phone, 44px minimum everywhere**, not the editorial 40px. Prompt 12 (touch targets) and density air (48 on phone). Still outlined, filling with `--primary` on hover or press.
- **2026-10-14. Contrast adjustments** in `src/styles/theme-adjustments.css` (lightness only, chroma and hue kept), checked by `tests/unit/contrast.test.ts`:
  - linen-shop `--ink-3` `#6f6154` to `#695b4e`: 4.17 to 4.57:1 on `--surface-2` (WCAG 1.4.3).
  - linen-shop `--line-strong` `#93877a` to `#8e8275`: 2.86 to 3.06:1 on `--bg` (WCAG 1.4.11).
  - atelier-noir `--ink-3` `#867d6e` to `#8f8576`: 4.08 to 4.57:1 on `--surface-2` (WCAG 1.4.3).
- **2026-10-14. Usage rules instead of colour changes:** `--primary` text never on `--surface-2` (4.22:1 in linen); `--ink-2` never on `--surface-3` (4.14:1 in linen).
- **2026-10-14. `--danger` equals `--primary` in linen-shop** (`#9d4b2c`). Primary never means an error; every error pairs the danger colour with an icon and words.
- **2026-10-14. Theme comment dashes swapped for colons** in the copied theme files, so the no long dash test can scan all of `src/`. No numbers changed.
- **2026-10-14. Icons outside Lounge Icons.** From Lucide (ISC, lucide-static 1.57.0), stroke set to 1.75: `thumbs-up`, `thumbs-down`, `cloud-rain` (as `rain`), `wind`, `thermometer`, `undo-2` (as `undo`). Drawn on the Lounge grid: `hanger` (closet tab). Today uses Lounge `sun`, Scan uses `camera`, History `calendar`, Settings `sliders`, more like this `spark`.
- **2026-10-14. Text links are underlined** (1px, offset 3px), not colour alone (WCAG 1.4.1, axe `link-in-text-block`). Buttons, tabs and list rows opt out.
- **2026-10-14. The Lift adds a shadow on an editorial (shadow none) family.** Prompt 9.4 asks the garment to "gain the family's shadow"; editorial has none, so the cutout gets a soft CSS `drop-shadow` only during and after the Lift, as an object shadow, never on cards. Logged now, built in M3.
- **2026-10-14. Root `/` redirects to `/today`** until M2 can read the closet; then it sends an empty closet to `/scan` (prompt 4).

- **2026-10-14. Clarity pass after Susan's review** ("clunky, on your face, I don't know what's going on, no icon, what does Today mean"). Their words win:
  - **Tabs renamed:** Today to **Outfits** (icon `layers`, a stacked deck), Scan to **Add** (icon `plus`). Routes stay `/today` and `/scan`.
  - **First open explains the app:** `/welcome`, three slides from `ios-onboarding-carousel` (Snap it once, Cut out on your phone, Three outfits every morning), then Add a piece. Seen once (`settings.introSeenAt`); `/` then goes to Outfits.
  - **No empty voids:** every tab has a header (small label, Didone title) and shows what will be there: an Example deck on Outfits, live Tops / Bottoms / Shoes slots on Closet and Outfits, this week's dates on History. Drawn data is labelled "Example". The example caption names no colours, because the drawing's colours change with the theme.
  - **The one primary button per view is filled** (`--primary`, `--primary-ink`), not outlined. Editorial's outline fills only on hover, and a phone has no hover, so it read as a secondary button. Other buttons stay outlined.
  - **App icon and favicon are the hanger object**, not a letter monogram. One mark everywhere, and it needs no text-to-path step. Master in `design/icons/app-icon.svg` (1024 square, light from the top, mark inside the middle 80%), rendered by `design/icons/render.mjs` and `make-ico.py`. Favicon SVG has a dark variant (gold on noir). Checked at 29px.
  - **Section titles under 24px** use a `.plain` text face class (pairing caution), so the Didone appears once per screen, in the header.

- **2026-10-14. Susan's flow replaces the morning deck.** The home tab is **Outfit**: "What should I wear?", the weather line, an occasion row, one primary **Pick my outfit**, then one card. `card-stacked-deck` keeps its point (drag with a stamp, flick to decide, buttons and arrow keys do the same) but shows one card at a time: right is Wear this, left is Show another. Reduced motion: buttons only, 120ms fades.
- **2026-10-14. No tag form when adding clothes** (Susan: "it needs to be smooth, just uploads and arranges where it fits"). After the Lift the piece files itself; a `loader-text-shimmer` placeholder shows while Gemini recognises it. The manual tag sheet (`ios-bottom-sheet-detents`, chips, a 5 stop warmth control) is only a one tap fix on the item.
- **2026-10-14. Weather strip without the hourly scrubber.** `ios-weather-hourly-scrub`'s point is the scrub; the snapshot keeps only the daytime range, so the strip is one line (place, feels like range, rain, wind) plus the Open-Meteo credit. Scrubber dropped, logged here.
- **2026-10-14. Item detail is a full screen layer on /closet** (`?item=`), so `shared-element-expand` can fly the tile into the stage (`layoutId`). Pieces: `luxe-product-detail` (stage left, name as largest type, facts list), `m3-dialog` for delete (Cancel outline, Delete the one solid button, in `--danger` with words).
- **2026-10-14. History** uses `phone-calendar-agenda` as a month grid with a cutout thumbnail per worn day, a `widget-activity-rings` single ring for closet use, KPI tiles from `charts-kpi-spark-row` without sparklines (one month of data rarely draws a line), and a colour mix bar in the closet's own colour families. `odometer-counter` and `card-polaroid-frames` not used: the calendar tiles already carry the pictures.
- **2026-10-14. Share card** is always drawn in the light theme (linen), so a shared picture looks the same for everyone.
- **2026-10-14. Switch handle off state uses `--ink-2`** on `--surface-2` (4.6:1), not `--line-strong` (under 3:1 for 1.4.11).

## Sources

- theme linen-shop: https://www.designlounge.live/themes/linen-shop
- theme atelier-noir: https://www.designlounge.live/themes/atelier-noir
- pairing maison: https://www.designlounge.live/type/maison
- family editorial: radius 2px
- ios-glass-tab-bar: component, https://www.designlounge.live/demo/ios-glass-tab-bar, point: kept (blurred under-scroll, sliding squash lens)
- pwa-app-shell: layout, https://www.designlounge.live/demo/pwa-app-shell, point: kept (shell paints first; hydration skeletons arrive with data in M2+)
- mobile-list-empty: component, https://www.designlounge.live/demo/mobile-list-empty, point: kept (label, h1 answer, one sentence, one action beside it)
- m3-settings-list: component, https://www.designlounge.live/demo/m3-settings-list, point: kept (flat list, primary section headers, single choice dialog that really re-themes)
- landing-fashion-atelier: layout, https://www.designlounge.live/demo/landing-fashion-atelier, point: kept (Didone name as largest type, drawn garment still, no photos)
- footer-centered-colophon: component, https://www.designlounge.live/demo/footer-centered-colophon, point: kept (centred italic wordmark, three links, credit)
- ios-onboarding-carousel: layout, https://www.designlounge.live/demo/ios-onboarding-carousel, point: kept (snapping slides, drawn art cards, stretching dots, Continue becomes the real action on the last slide); art radius 2px from the family, no glow
- card-stacked-deck: component, https://www.designlounge.live/demo/card-stacked-deck, point: kept (drag follows the pointer, stamp, flick or distance to decide, buttons and keys); one card at a time
- scan-page: motion, https://www.designlounge.live/demo/scan-page, point: kept (the beam sweeps over visible content) in the Lift and while a cutout runs
- gallery-contact-sheet: component, https://www.designlounge.live/demo/gallery-contact-sheet, point: kept (frames of colour fields become the session's cutouts)
- card-progress-goals + diamond-badge-rail: component, https://www.designlounge.live/demo/card-progress-goals, point: kept as one bar with the next badge at its end; rings and rail dropped for a phone column
- phone-permission-prompt: layout, https://www.designlounge.live/demo/phone-permission-prompt, point: kept (explain in our own words before any download or system prompt)
- ios-bottom-sheet-detents: component, https://www.designlounge.live/demo/ios-bottom-sheet-detents, point: kept (grabber, two detents, drag to resize or dismiss)
- mobile-filter-chips-list: component, https://www.designlounge.live/demo/mobile-filter-chips-list, point: kept (one scrolling chip row, counts in the chips, more in a sheet)
- masonry-gallery-captions: layout, https://www.designlounge.live/demo/masonry-gallery-captions, point: kept for the CSS columns wall; captions always visible (no hover on phones)
- luxe-product-detail: layout, https://www.designlounge.live/demo/luxe-product-detail, point: kept (the object on a stage, the name largest, then facts)
- m3-dialog: component, https://www.designlounge.live/demo/m3-dialog, point: kept (centred confirm, one destructive action)
- phone-calendar-agenda: layout, https://www.designlounge.live/demo/phone-calendar-agenda, point: kept (month grid, tap a day to see it)
- pwa-update-toast, pwa-connectivity-banner, pwa-install-sheet: component, https://www.designlounge.live/demo/pwa-install-sheet, point: kept (reload on tap only; offline as a one line state; install asked after the first success, snoozed three weeks)
- mobile-load-failed: component, https://www.designlounge.live/demo/mobile-load-failed, point: kept for the error screen (one line, one way on)

## Match (M1)

```
Column: 720px on Today, Closet, History, Settings, Scan, Offline; About uses the 1120px web frame (landing)
Page padding: 20px
Control height / radius: 48px / 2px
Amount face: Tenor Sans, tabular-nums (.num)
Shell: none (tab bar)
Panel: none
Nav: Outfit, Closet, Add, History, Settings
Phone nav: tabs · same labels at every width
Fails: none
```

## Closing block (M1)

```
Looked at: today, closet, history, settings, scan, about in phone (390x844) and web (1280x800), light and dark, 24 PNGs, with Playwright Chromium. Large text not looked yet (M6, phone-large-text-layout)
Remember after five seconds: "a Didone 'No looks yet' on washed linen above a glass tab bar" · could be anyone's: no
Correction: too much chrome. The About kicker repeated "Wastra" above "Masta Wastra" and again on the garment. Removed the kicker.
Still open: app icons and splash (M8), the 200% text check, every piece marked M2 to M9 above
```
