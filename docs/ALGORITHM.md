# The outfit engine

How Masta Wastra picks an outfit. This is section 8 of the build prompt as implemented in
`src/engine` and `src/lib/weather.ts`, including the owner's M5 changes (one outfit per
tap, colour quality first). Where the prompt was open or ambiguous, the choice made is
marked **Decision**.

Everything in `src/engine` is pure TypeScript: no DOM, no Dexie, no clock, no randomness.
Time comes in as `localDate` (YYYY-MM-DD) or ISO strings, randomness as a numeric `seed`.
The same `(items, weights, history, weather, occasion, seed)` always gives the same result.

| Module | Job |
|---|---|
| `lib/weather.ts` | Open-Meteo forecast, city search, manual quick pick |
| `engine/warmth.ts` | bands, warmth targets, layer rules, weather flags |
| `engine/color.ts` | neutrals, pair harmony, outfit colour score, colour story |
| `engine/candidates.ts` | hard filters, slot pools, enumeration and beam |
| `engine/score.ts` | feature vector, score, repeats |
| `engine/deal.ts` | pick, show another, deal of n, outfits with this |
| `engine/learn.ts` | feedback updates, weekly decay, reset |
| `engine/explain.ts` | the one line reason |

## 1. Weather (`lib/weather.ts`)

One request to `https://api.open-meteo.com/v1/forecast` with `latitude`, `longitude`
(both rounded to 2 decimals before sending), `timezone=auto`, `forecast_days=1`,
`current=temperature_2m,apparent_temperature,weather_code`,
`hourly=apparent_temperature,precipitation_probability`,
`daily=apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max`.

`parseForecast(json, nowLocalHourISO?)` is pure:

- `feelsMin` / `feelsMax`: min and max hourly apparent temperature from 08:00 to 20:00
  inclusive on the forecast day. Falls back to the daily apparent min and max, then to any
  hourly value, then to 15.
- `tempNow`: `current.temperature_2m`, else `current.apparent_temperature`, else the hourly
  value at `nowLocalHourISO`.
- `precipProb`: `daily.precipitation_probability_max` (falls back to the hourly maximum).
  **Decision:** the daily value, as the prompt's parameters suggest, not the daytime window.
- `precipMm`, `windMax` (km/h), `uvMax`: the daily values. `code`: `current.weather_code`.
- `fetchedAt`: `current.time` (local) converted to UTC with `utc_offset_seconds`, so the
  parser needs no clock. `fetchForecast` overwrites it with the real fetch time, and the
  coordinates with the rounded request coordinates (the cache key).

`searchCity(name)` calls `https://geocoding-api.open-meteo.com/v1/search` (`count=5`,
`language=en`), and returns `{ name, label, lat, lon }` with coordinates rounded to 2
decimals. Fewer than 2 characters returns nothing.

`manualWeather(pick, rain)` is the offline quick pick. **Decision:** feels like ranges
cold 0 to 5, cool 6 to 12, mild 12 to 18, warm 17 to 24, hot 25 to 31 (each inside its
band, under 10 degrees wide so no shed rule), UV 1, 2, 3, 5, 7, rain = 80% and 5 mm,
`manual: true`. Caching is the caller's job.

## 2. Bands, warmth and layers (`engine/warmth.ts`)

Bands on `feelsMax` in °C, lower bound inclusive:

| Band | feelsMax | Target total warmth | Required layers (soft) | Prohibited (hard) |
|---|---|---|---|---|
| hot | ≥ 27 | 1 to 3 | base only | any mid, outer, or sweater worn as the top |
| warm | 21 to under 27 | 2 to 4 | base | mid, outer or sweater top with warmth > 2 |
| mild | 15 to under 21 | 4 to 6 | base + (mid or outer warmth ≤ 3) | none |
| cool | 8 to under 15 | 6 to 9 | base + mid + outer, or base + outer warmth ≥ 3 | none |
| cold | 0 to under 8 | 9 to 12 | base + mid + outer warmth ≥ 4 | none |
| freezing | under 0 | 11 to 15 | base + mid + outer warmth 5 | none |

So 26.9 is warm, 27 is hot, -0.1 is freezing, 0 is cold.

- **Total warmth** = top or dress + bottom + mid + outer + 0.5 × shoes. Accessories add
  nothing.
- **warmthFit** = `1 - |total - targetMid| / targetSpan`, clamped. **Decision:**
  `targetSpan` is the full width of the range (hi - lo), so any total inside the range
  scores at least 0.5.
- **Decision: layer prohibitions are hard, requirements are soft.** A closet without a coat
  still gets dressed in the cold (with `layerFit` 0). The prompt lists layer rules under
  hard filters; making requirements hard would leave small closets with nothing.
- **Decision: a sweater worn on its own counts as base + mid** for the layer rules, and
  nothing goes over it as a mid ("no sweater over a sweater"). "Light outer" in mild is
  warmth ≤ 3, "warm outer" in cool is warmth ≥ 3.
- **Shed rule:** when `feelsMax - feelsMin ≥ 10`, an outfit with a removable layer (outer,
  or a mid if there is no outer) is preferred. `layerFit` = 1 if required layers are met
  and it has a layer to shed, 0.5 if only one of the two, else 0. On those days
  **(Decision)** `warmthFit` takes the better of the outfit with and without that layer,
  because it can come off; otherwise a jacket would always lose on warmth.
- **Rain:** `precipProb ≥ 50` or `precipMm ≥ 2`. **Wind:** `windMax ≥ 35` km/h. **Hot
  UV:** hot band and `uvMax ≥ 7`.

## 3. Colour (`engine/color.ts`)

Colours are compared in OKLab / OKLCH (`lib/oklab.ts`). **Owner rule (M5): every item's
full palette is used** (`colors[]` with shares), not only the primary colour.

### Neutrals

A colour is neutral if chroma `C < 0.04`, or it is a known family:

- navy: `L < 0.35`, hue 240 to 275, `C < 0.12`
- beige, camel, khaki (and brown): hue 50 to 95, `C < 0.10`
- **olive (owner rule):** hue 95 to 130, `C < 0.08`
- by name: black, white, grey, charcoal, cream, navy, beige, camel, khaki, denim, olive,
  brown. **Decision:** the name wins, so a "white" shirt photographed slightly warm stays
  neutral.

An item is neutral if the user's override says so (`neutralOverride` set: `isNeutral`
wins), else if it is denim (subtype `jeans`, or first colour named denim or jeans), else by
its primary colour. In an item's palette the primary colour takes the item's flag; the
secondary colours use the colour rule.

### Pair harmony of two colours

Checked in this order (**Decision** on precedence):

1. **Echo**, OKLab distance `ΔE < 0.04` (the same colour repeated): 0.9.
2. **Near miss (owner rule)**: not an echo, `ΔL < 0.15`, and the two read as almost the
   same: both dark (`L < 0.4`, navy with black), or both low chroma (`C < 0.06`, two
   slightly different beiges, white with cream), or both chromatic (`C ≥ 0.04`) with hues
   within 30° (red with orange, a blue tee on denim): **0.4**, below both a clear match and
   a clear contrast. Same lightness but a different family (grey with camel) is not a near
   miss.
3. Both neutral: 0.75, or 0.8 with clear lightness contrast `ΔL ≥ 0.25`.
4. One neutral: 0.9.
5. Two non-neutrals, `Δ` = hue difference 0 to 180:
   - tonal, `Δ ≤ 15` and `ΔL ≥ 0.25`: 0.85 (wins over analogous, the more specific rule)
   - analogous `Δ ≤ 30`: 0.8 (only reached with `ΔL ≥ 0.15`; closer is a near miss)
   - complementary `150 ≤ Δ ≤ 180`: 0.9
   - split / triadic `110 ≤ Δ < 150`: 0.6
   - awkward `30 < Δ < 110`: 0.2

**Item pair harmony** = share weighted mean over every colour pair of the two palettes:
`Σ s_a · s_b · h(a, b)`. A navy and white striped shirt (60/40) with white sneakers gets
0.6 × navy/white + 0.4 × white/white (echo).

### Outfit colour score S_color

Over core pieces (outer, mid, top or dress, bottom, shoes). **Decision:** the mid layer is
a core piece everywhere (colour, repeats, overlap), because it is what you see.

`S_color` = mean item pair harmony, then:

| Rule | Adjust |
|---|---|
| exactly one non-neutral accent, the rest neutral | +0.10 |
| per non-neutral piece beyond 2 | -0.15 |
| two or more bold patterns (anything but solid and texture) | -0.20, and a clash (below) |
| **one bold pattern and the other pieces pick their colours from it (owner rule):** at least one piece echoes one of its colours and every colourful piece does | +0.05 |
| **colourful shoes that echo no colour in the rest of the outfit (owner rule)** | -0.30 |

Clamped to 0..1.

**Colour floor (owner rule):** an outfit is a *clash* when `S_color < 0.5` or it has two
bold patterns. A clash is never picked while any non-clashing outfit exists (it only
appears when the whole closet clashes, flagged `colorRelaxed`). On top of the weighted term,
a **colour guard** subtracts `3 × (0.65 - S_color)` below 0.65, so weak matches fall fast.

**Accessories** may only join if they are neutral or echo a colour already in the outfit.

**Colour story** (for "Show another"): the hue of the strongest non-neutral colour
(chroma × share), or none when all neutral, plus the main colour of the outermost piece.
Two stories differ when accents are at least 60° apart, one has an accent and the other is
all neutral, or two all neutral looks differ by `ΔE ≥ 0.2` in their main colour.

## 4. Candidates (`engine/candidates.ts`)

Templates: A top + bottom + shoes, B dress + shoes, C A or B + mid, D A, B or C + outer.
An item's slot comes from category and layer: a layer 0 top is a top, a layer 1 top
(sweater, cardigan, hoodie) can be the top or the mid, a layer 2 piece is outer, a layer 0
or 1 outer (vest) is a mid.

**Hard filters** per item:

1. Not archived.
2. Occasion: the item's `occasions` includes the day's occasion, or its vibes are
   compatible:

   | Occasion | Compatible vibes |
   |---|---|
   | work | smart, formal (casual items pass only when marked for work in `occasions`) |
   | formal | formal for core pieces; accessories formal or smart |
   | workout | sporty |
   | home | lounge, casual |
   | casual **(Decision)** | casual, smart, street, sporty |
   | date **(Decision)** | smart, casual, street, formal |
   | travel **(Decision)** | casual, sporty, lounge, street, smart |
   | festival **(Decision)** | traditional, smart, formal, casual |

3. Warmth sanity: hot, nothing with warmth ≥ 4 except shoes; cold and freezing, no shorts
   and no sandals.
4. Layer prohibitions per band (section 2).
5. Worn today or yesterday (core pieces): dropped, unless that slot has fewer than 3
   options after the other filters; then kept with a freshness penalty of 0.5 per piece.

**Accessory, at most one (Decision on the rules):** bag and belt always allowed; scarf and
gloves when cold or freezing; hat when hot with UV ≥ 7, or when cold; cap when hot with UV
≥ 7. A candidate takes the accessory that raises its score the most, and none if nothing
raises it (a bag with no affinity is not added). Within one result, accessories do not
repeat: a later outfit takes its next best, or none.

**Enumeration:** product = (tops × bottoms + dresses) × shoes × (mids + 1) × (outers + 1).

- Up to 5,000: every combination is scored.
- Over 5,000: each slot keeps its top 12 by item level score (0.5 × affinity + warmth fit
  to a per band ideal + occasion fit, minus a small recently worn nudge, plus a small never
  worn nudge). If that is still over 5,000 (cool and cold days with all layers open),
  **(Decision) a two stage beam**: score every top + bottom + shoes or dress + shoes core
  with an optimistic partial score (warmth that layers could still add counts as met,
  layer and rain rules count as met), keep the best 40 top based and 16 dress based cores,
  no item in more than 8 of them, then try every mid and outer option on each. A 300 item
  closet scores about 8,000 full candidates in about 15 ms in Node.

**Limiting slot** (for "Add a pair of shoes to unlock more looks"): the slot with the
fewest options among top (tops + dresses), bottom (bottoms + dresses), shoes, plus outer in
cool, cold and freezing, plus mid in cold and freezing. Null when every needed slot has at
least 3. Ties go top, bottom, shoes, outer, mid.

## 5. Score (`engine/score.ts`)

```
S = Σ w_k · f_k
  + 0.5 · Σ itemAffinity[i]      each clamped -1..1, over all items
  + 0.7 · Σ pairAffinity[i|j]    each clamped -1..1, over all item pairs
  + weather                      +0.5 hat or cap on a hot high UV day; +0.5 scarf, gloves
                                 or hat in the cold; -0.3 per skirt or dress on a windy day
  + colorGuard                   -3 × (0.65 - S_color) below 0.65
```

| Feature | Meaning | Default weight |
|---|---|---|
| `color` | S_color | 3.0 |
| `warmthFit` | section 2 | 3.0 |
| `layerFit` | section 2 | 1.5 |
| `occasionFit` | share of core pieces whose first vibe is the ideal one: work smart, casual casual, date smart, formal formal, workout sporty, travel casual, home lounge, festival traditional | 2.0 |
| `freshness` | 1 - repeat penalty | 2.0 |
| `rainFit` | dry day 1; rain day: 0.5 for a waterproof outer + shoes (waterproof 0.5, closed and not suede 0.3, sandals or suede 0) | 1.5 on rain days, else 0 |
| `neverWornBoost` | 1 if any item was never worn and was added more than 7 days ago | 0.6, × 3 while the History toggle is on |
| `patternBalance` | 1 if at most one bold pattern | 1.0 |
| `vibeCohesion` | mean pairwise Jaccard of vibes over core pieces | 1.0 |

**Decisions:** `rainFit` is graded (the prompt says 1 or 0) so a raincoat with sandals
scores below a raincoat with boots; "suede" is found in the item name or notes. Vibe
cohesion is the mean of pairwise Jaccards, because the Jaccard of all pieces at once is
almost always 0. "Older than 7 days" uses the UTC date of `createdAt`. The wind penalty and
accessory bonus are additive terms like affinity, not features, so learning does not move
them (up votes on a windy dress still lift it through item affinity).

**Repeats:** outfit repeat `1 - daysAgo/14` if the same core signature was worn in the last
14 days; item repeat `0.15 × (1 - daysAgo/7)` per core piece worn in the last 7 days, plus
0.5 per piece kept from yesterday by the small closet rule, summed and capped at 1.
**Decision:** repeat penalty = max(outfit repeat, item repeat), so one wear is not counted
twice; outfit repeats compare core pieces only, so swapping a bag is not a fresh outfit.

**Display score** = `round(100 × S / S_max)`, clamped to 0..100, where `S_max` is the sum
of today's effective weights (rain weight 0 on dry days, never worn × 3 when on). Raw `S`
is kept for ranking.

## 6. Picking (`engine/deal.ts`)

**Owner change (M5):** no morning deal of 3. "Pick my outfit" returns the single best
outfit; "Show another" returns the next best that is clearly different. `deal(input)`
still returns up to `n` (default 3) with the same rules.

1. Candidates are ranked by raw S, one per core signature.
2. Excluded: every signature in `exclude` and `shown` (matched on core pieces).
3. Preference tiers: no clash and nothing disliked; then no clash; then anything.
   **Decision:** an item with affinity ≤ -0.75 (about ten thumbs down) is "disliked" and
   held back while any outfit without it exists. Without this, the diversity penalty
   (below) could pull a disliked item back in a small closet.
4. First pick: the best S. Each later pick (and every pick after `shown` outfits): only
   outfits sharing at most 1 core item with every earlier or shown outfit; value =
   `S - λ · maxOverlap - (0.5 λ if not distinct)`, `λ = 0.35 × S_max`.
   **Decisions:** `maxOverlap` is the Jaccard of core item sets (1 shared of 3 and 3 is
   0.2); "distinct" means a different colour story or a different template shape (top or
   dress, with or without mid and outer) from every earlier pick, and is preferred softly
   for every pick after the first (the owner asked for a different colour story on "Show
   another"; the prompt only asked it of card 3).
5. Near ties: among outfits within 3% of `S_max` of the best value, the one with the lowest
   `hash(seed, coreSignature)` wins.
6. If no outfit meets the overlap rule, the best remaining one is used and flagged
   (`relaxed`, `diverse: false`). Fewer results than asked when the closet runs out.

Seeds: `dealSeed(localDate, installId)` = FNV-1a 32 bit of `localDate + installId`. The
caller may pass a fresh seed per tap.

API: `pickOutfit(input)`, `pickAnother(input, shownSignatures)`, `createPicker(input)`
(ranks once; `.pick()` and `.another(shown)` reuse the ranking for repeated taps),
`deal(input)`, `outfitsWith(itemId, input, n = 6)` (10.3: every outfit includes the item,
which skips the item filters except archiving; varied with the soft overlap penalty only),
`canDealAgain(reshuffles)` with `MAX_RESHUFFLES = 3`.

Each outfit carries `itemIds` ordered outer, mid, top or dress, bottom, shoes, accessory
(**Decision:** mid sits between outer and top), `signature` (sorted ids joined with "|",
the same as `outfitSignature` in `src/db/repo.ts`), `coreSignature`, `template`, `base`,
`slots`, `features`, `breakdown` (each `w · f` plus `itemAffinity`, `pairAffinity`,
`weather`, `colorGuard`), raw `score`, `displayScore`, `reason`, `diverse`. The result also
carries the band, `limiting` slot, `relaxed`, `colorRelaxed` and candidate stats.

## 7. Learning (`engine/learn.ts`)

Rewards: wear +1.0, up +0.7, more like this +0.5, skip -0.2, down -0.8.
Learning rate `η_t = 0.08 / (1 + n/50)`, n = signals so far.

```
w_k            ← clamp(w_k + η_t · r · (f_k - mean_k), 0.2 × default_k, 3 × default_k)
itemAffinity_i ← clamp(itemAffinity_i + 0.10 · r, -1, 1)
pairAffinity_p ← clamp(pairAffinity_p + 0.15 · r, -1, 1)    p = the two ids sorted, "a|b"
```

`mean` is the mean feature vector of what was shown alongside (`meanFeatures`).
**Decision:** with no mean given, feature weights do not move (there is nothing to centre
on); affinities still do. With one outfit per tap, the caller should pass the mean of the
outfits shown so far in that session.

**Weekly decay:** `decayIfDue(weights, nowISO)` multiplies every affinity by 0.95 per whole
week since `decayedAt` (compounded for missed weeks), drops values under 0.001, and moves
`decayedAt` forward by whole weeks. The first call only starts the clock. `resetTaste(at)`
restores the defaults; history is kept elsewhere.

Proven by tests: 10 thumbs up on high contrast outfits leave the colour weight exactly
unchanged (centred) while the black and white pair ranks first via pair affinity; 10
thumbs down on an item remove it from the top 3 unless no alternative exists.

## 8. Explanations (`engine/explain.ts`)

One or two short sentences, plain words, no long dashes, temperatures in the user's units
(`units: "c" | "f"`). Colours are named from the item's colour names (or the nearest of the
24 palette names).

- **A good colour match (S_color ≥ 0.75) always leads (Decision, owner priority)**, and
  says what actually makes it work: "White sneakers pick up the white stripe." (pattern
  echo), "Red blouse with navy and white, one clear accent." (one accent), or the main pair
  (top and bottom, or a dress and what is over it): "Navy and camel, a classic pair.",
  "Green on navy, an easy match.", "Tonal red, light with dark.", "Red and teal, a bold
  classic contrast.". Near misses and awkward pairs get no colour praise.
- The second sentence is the most salient other reason, salience = `w · (f - typical f)`:
  warmth and layers ("12°C, so a jacket on top.", "8 to 19°C today, a jacket you can take
  off."), rain ("Rain on the way. Your waterproof raincoat comes along."), never worn ("You
  have not worn the green shirt yet."), hat or scarf, occasion ("Sharp enough for work."),
  freshness, one shared vibe, one calm pattern.
