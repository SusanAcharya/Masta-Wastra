// Scoring (8.4) and recent repeats (8.5). Pure.
//
// S = Σ w_k · f_k                       features, all 0..1
//   + 0.5 · Σ itemAffinity[i]           learned, each clamped -1..1
//   + 0.7 · Σ pairAffinity[i|j]         learned, each clamped -1..1
//   + weather                           hat or scarf bonus, light wind penalty on skirts and dresses
//   + colorGuard                        extra push down for weak colour matches (owner rule, M5)
//
// Items are "prepared" once per call (palette, flags, history) so scoring thousands of
// candidates stays cheap.
import { daysBetween } from "@/lib/dates";
import { echoOf, isBoldPattern, isNeutralItem, itemHarmony, itemPalette, outfitColor, type ColorBreakdown, type ColorPoint } from "./color";
import {
  layerFit as layerFitOf,
  layersMet,
  targetFor,
  totalWarmth,
  warmthFit as warmthFitOf,
  weatherFlags,
  type WeatherFlags,
} from "./warmth";
import {
  DEFAULT_WEIGHTS,
  FEATURE_KEYS,
  VIBES,
  type FeatureVector,
  type Item,
  type Occasion,
  type Vibe,
  type WeatherSnapshot,
  type Wear,
  type Weights,
} from "./types";

/* Occasion tables (8.3 rule 2, 8.4 occasionFit) */

// Vibes an item may have to pass the occasion filter when its own `occasions` list does not
// name the day's occasion. The prompt fixes work, formal, workout and home; the rest are ours.
export const OCCASION_VIBES: Record<Occasion, readonly Vibe[]> = {
  work: ["smart", "formal"],
  casual: ["casual", "smart", "street", "sporty"],
  date: ["smart", "casual", "street", "formal"],
  formal: ["formal"],
  workout: ["sporty"],
  travel: ["casual", "sporty", "lounge", "street", "smart"],
  home: ["lounge", "casual"],
  festival: ["traditional", "smart", "formal", "casual"],
};

// On a formal day accessories may also be smart (only core pieces must be formal).
export const FORMAL_ACCESSORY_VIBES: readonly Vibe[] = ["formal", "smart"];

// The one ideal primary vibe per occasion, for occasionFit.
export const IDEAL_VIBE: Record<Occasion, Vibe> = {
  work: "smart",
  casual: "casual",
  date: "smart",
  formal: "formal",
  workout: "sporty",
  travel: "casual",
  home: "lounge",
  festival: "traditional",
};

/* Constants */

export const ITEM_AFFINITY_SCALE = 0.5;
export const PAIR_AFFINITY_SCALE = 0.7;
export const NEVER_WORN_MIN_AGE = 7; // days; "older than 7 days"
export const NEVER_WORN_BOOST_FACTOR = 3; // 10.5, while the History toggle is on
export const OUTFIT_REPEAT_DAYS = 14;
export const ITEM_REPEAT_DAYS = 7;
export const ITEM_REPEAT_STEP = 0.15;
export const YESTERDAY_PENALTY = 0.5; // per core item worn yesterday, kept by the small closet rule
export const ACCESSORY_BONUS = 0.5; // hat on a hot high UV day, scarf, gloves or hat in the cold
export const WIND_PENALTY = 0.3; // per skirt or dress on a windy day
export const DRY_RAINWEAR_PENALTY = 0.4; // a raincoat on a dry day: fine, but any other fitting layer is better
export const COLOR_FLOOR = 0.5; // below this S_color, or with two bold patterns, an outfit is a clash (deal.ts keeps it out)
export const COLOR_GUARD_FROM = 0.65; // below this S_color the score drops faster
export const COLOR_GUARD_SLOPE = 3;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const clampAff = (x: number | undefined) => (x === undefined ? 0 : clamp(x, -1, 1));

/* Inputs */

export type EngineWeights = Pick<Weights, "w" | "itemAffinity" | "pairAffinity">;

export interface ScoreInput {
  items: Item[];
  weights?: EngineWeights; // defaults when absent
  wears?: Pick<Wear, "localDate" | "itemIds">[];
  weather: WeatherSnapshot;
  occasion: Occasion;
  localDate: string; // YYYY-MM-DD, "today" in the device zone
  neverWornBoostActive?: boolean; // 10.5: neverWornBoost weight × 3
}

/* Prepared items */

export interface Prep {
  item: Item;
  id: string;
  ix: number; // index into the context caches
  palette: ColorPoint[];
  neutral: boolean;
  bold: boolean;
  vibeMask: number;
  primaryVibe: Vibe | undefined;
  warmth: number;
  affinity: number; // clamped, unscaled
  lastWornDaysAgo: number | null;
  neverWornOld: boolean;
  wornYesterday: boolean; // worn today or yesterday (8.3 rule 5)
  inRecentOutfit: boolean; // part of an outfit worn in the last 14 days
  suede: boolean;
  openShoe: boolean;
  isShoes: boolean;
}

// The pieces of one outfit. `base` is the top or the dress.
export interface Parts {
  outer?: Prep;
  mid?: Prep;
  base: Prep;
  bottom?: Prep;
  shoes: Prep;
  accessory?: Prep;
}

export interface ScoreContext {
  input: ScoreInput;
  flags: WeatherFlags;
  w: FeatureVector; // effective weights for today
  sMax: number; // S when every feature is 1, no affinity
  preps: Prep[];
  byId: Map<string, Prep>;
  pairAff: Map<string, Map<string, number>>; // id -> partner id -> clamped affinity
  recentSig: Map<string, number>; // core signature -> days ago, last 14 days
  harmony: Float64Array; // item pair harmony cache, NaN = not computed
  echo: Int8Array; // item pair echo cache, -1 = not computed, else 0/1
}

const VIBE_BIT = new Map(VIBES.map((v, i) => [v, 1 << i]));

export function vibeMask(vibes: readonly Vibe[]): number {
  let m = 0;
  for (const v of vibes) m |= VIBE_BIT.get(v) ?? 0;
  return m;
}

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Same as src/db/repo.ts outfitSignature: sorted ids joined with "|".
export function signatureOf(ids: readonly string[]): string {
  return [...ids].sort().join("|");
}

// Effective weights for today: rainFit counts only on rain days; neverWornBoost × 3 while
// the History toggle is on.
export function effectiveWeights(w: FeatureVector, rain: boolean, neverWornBoostActive = false): FeatureVector {
  const out = { ...DEFAULT_WEIGHTS, ...w };
  if (!rain) out.rainFit = 0;
  if (neverWornBoostActive) out.neverWornBoost *= NEVER_WORN_BOOST_FACTOR;
  return out;
}

export function sMaxOf(w: FeatureVector): number {
  let s = 0;
  for (const k of FEATURE_KEYS) s += w[k];
  return s;
}

// Display score 0..100 = round(100 × S / S_max), clamped. Ranking always uses the raw S.
export function displayScore(score: number, sMax: number): number {
  if (sMax <= 0) return 0;
  return clamp(Math.round((100 * score) / sMax), 0, 100);
}

export function buildScoreContext(input: ScoreInput): ScoreContext {
  const weights = input.weights ?? { w: DEFAULT_WEIGHTS, itemAffinity: {}, pairAffinity: {} };
  const flags = weatherFlags(input.weather);
  const w = effectiveWeights(weights.w, flags.rain, input.neverWornBoostActive);

  // History: last wear per item, recent outfit signatures.
  const lastWorn = new Map<string, number>();
  const everWorn = new Set<string>();
  const recentSig = new Map<string, number>();
  const recentItems = new Set<string>();
  const coreOf = new Map(input.items.map((i) => [i.id, i.category !== "accessory"]));
  for (const wear of input.wears ?? []) {
    for (const id of wear.itemIds) everWorn.add(id);
    const d = daysBetween(wear.localDate, input.localDate);
    if (d < 0) continue; // a wear logged for a later day does not count yet
    for (const id of wear.itemIds) {
      const prev = lastWorn.get(id);
      if (prev === undefined || d < prev) lastWorn.set(id, d);
    }
    if (d < OUTFIT_REPEAT_DAYS) {
      // Outfit repeats compare core pieces only, so swapping a bag is not a new outfit.
      const core = wear.itemIds.filter((id) => coreOf.get(id) ?? true);
      const sig = signatureOf(core);
      const prev = recentSig.get(sig);
      if (prev === undefined || d < prev) recentSig.set(sig, d);
      for (const id of core) recentItems.add(id);
    }
  }

  const preps = input.items.map((item, ix): Prep => {
    const last = lastWorn.get(item.id);
    const createdDate = item.createdAt.slice(0, 10);
    const age = /^\d{4}-\d{2}-\d{2}$/.test(createdDate) ? daysBetween(createdDate, input.localDate) : 0;
    const text = `${item.name} ${item.notes ?? ""}`;
    return {
      item,
      id: item.id,
      ix,
      palette: itemPalette(item),
      neutral: isNeutralItem(item),
      bold: isBoldPattern(item.pattern),
      vibeMask: vibeMask(item.vibes),
      primaryVibe: item.vibes[0],
      warmth: item.warmth,
      affinity: clampAff(weights.itemAffinity[item.id]),
      lastWornDaysAgo: last ?? null,
      neverWornOld: !everWorn.has(item.id) && age > NEVER_WORN_MIN_AGE,
      wornYesterday: last !== undefined && last <= 1,
      inRecentOutfit: recentItems.has(item.id),
      suede: /suede/i.test(text),
      openShoe: item.subtype === "sandals",
      isShoes: item.category === "shoes",
    };
  });

  const pairAff = new Map<string, Map<string, number>>();
  for (const [key, value] of Object.entries(weights.pairAffinity)) {
    const [a, b] = key.split("|");
    if (!a || !b || !value) continue;
    const v = clampAff(value);
    if (!pairAff.has(a)) pairAff.set(a, new Map());
    if (!pairAff.has(b)) pairAff.set(b, new Map());
    pairAff.get(a)!.set(b, v);
    pairAff.get(b)!.set(a, v);
  }

  const n = preps.length;
  return {
    input,
    flags,
    w,
    sMax: sMaxOf(w),
    preps,
    byId: new Map(preps.map((p) => [p.id, p])),
    pairAff,
    recentSig,
    harmony: new Float64Array(n * n).fill(NaN),
    echo: new Int8Array(n * n).fill(-1),
  };
}

/* Cached pair maths */

export function harmonyCached(ctx: ScoreContext, a: Prep, b: Prep): number {
  const k = a.ix * ctx.preps.length + b.ix;
  let h = ctx.harmony[k];
  if (Number.isNaN(h)) {
    h = itemHarmony(a.palette, b.palette);
    ctx.harmony[k] = h;
    ctx.harmony[b.ix * ctx.preps.length + a.ix] = h;
  }
  return h;
}

// Does b repeat a colour of a? (Symmetric.)
export function echoCached(ctx: ScoreContext, a: Prep, b: Prep): boolean {
  const k = a.ix * ctx.preps.length + b.ix;
  let e = ctx.echo[k];
  if (e < 0) {
    e = echoOf(a.palette, b.palette) ? 1 : 0;
    ctx.echo[k] = e;
    ctx.echo[b.ix * ctx.preps.length + a.ix] = e;
  }
  return e === 1;
}

function pairAffinity(ctx: ScoreContext, a: Prep, b: Prep): number {
  return ctx.pairAff.get(a.id)?.get(b.id) ?? 0;
}

/* Parts helpers */

// Core pieces in display order: outer, mid, top/dress, bottom, shoes.
export function coreOf(p: Parts): Prep[] {
  const out: Prep[] = [];
  if (p.outer) out.push(p.outer);
  if (p.mid) out.push(p.mid);
  out.push(p.base);
  if (p.bottom) out.push(p.bottom);
  out.push(p.shoes);
  return out;
}

export function allOf(p: Parts): Prep[] {
  const core = coreOf(p);
  if (p.accessory) core.push(p.accessory);
  return core;
}

export const topIsMid = (p: Parts) => p.base.item.category === "top" && p.base.item.layer === 1;

/* Repeats (8.5) */

export function repeatPenalty(ctx: ScoreContext, core: Prep[]): number {
  let outfit = 0;
  if (ctx.recentSig.size && core.some((p) => p.inRecentOutfit)) {
    const d = ctx.recentSig.get(signatureOf(core.map((p) => p.id)));
    if (d !== undefined) outfit = 1 - d / OUTFIT_REPEAT_DAYS;
  }
  let items = 0;
  for (const p of core) {
    const d = p.lastWornDaysAgo;
    if (d !== null && d < ITEM_REPEAT_DAYS) items += ITEM_REPEAT_STEP * (1 - d / ITEM_REPEAT_DAYS);
    if (p.wornYesterday) items += YESTERDAY_PENALTY;
  }
  items = Math.min(1, items);
  return clamp(Math.max(outfit, items), 0, 1);
}

/* Rain */

// rainFit on rain days: half for a waterproof outer, half for the shoes (waterproof 0.5,
// closed and not suede 0.3, open or suede 0). Every outfit scores 1 on a dry day.
export function rainFitOf(ctx: ScoreContext, p: Parts, optimisticOuter = false): number {
  if (!ctx.flags.rain) return 1;
  const outer = optimisticOuter || (p.outer?.item.waterproof ?? false) ? 0.5 : 0;
  const s = p.shoes;
  const shoes = s.item.waterproof ? 0.5 : s.openShoe || s.suede ? 0 : 0.3;
  return outer + shoes;
}

/* Accessories and wind */

export function accessoryBonus(ctx: ScoreContext, acc: Prep): number {
  const sub = acc.item.subtype;
  const cold = ctx.flags.band === "cold" || ctx.flags.band === "freezing";
  if ((sub === "hat" || sub === "cap") && ctx.flags.hotUv) return ACCESSORY_BONUS;
  if ((sub === "scarf" || sub === "gloves" || sub === "hat") && cold) return ACCESSORY_BONUS;
  return 0;
}

function windPenalty(ctx: ScoreContext, core: Prep[]): number {
  if (!ctx.flags.wind) return 0;
  let n = 0;
  for (const p of core) if (p.item.category === "dress" || p.item.subtype === "skirt") n++;
  return -WIND_PENALTY * n;
}

// Rain gear is rewarded on rain days (rainFit) but was never discouraged on dry ones, so a
// raincoat could win a sunny day on warmth alone.
function dryRainwear(ctx: ScoreContext, core: Prep[]): number {
  if (ctx.flags.rain) return 0;
  return core.some((p) => p.item.subtype === "raincoat") ? -DRY_RAINWEAR_PENALTY : 0;
}

/* The score */

export interface ScoreDetail {
  features: FeatureVector;
  breakdown: Record<string, number>;
  color: ColorBreakdown;
  totalWarmth: number;
  score: number;
}

export type ScoreMode = "full" | "core";

// Scores the core of an outfit (no accessory). Mode "core" is the optimistic partial score
// the beam uses before layers are chosen: warmth that layers could still add counts as met,
// layer and rain rules count as met.
export function scoreCore(
  ctx: ScoreContext,
  p: Parts,
  mode: ScoreMode = "full",
  detail?: ScoreDetail,
  sink?: { color: number; clash: boolean },
): number {
  const core = coreOf(p);
  const { w, flags } = ctx;
  const target = targetFor(flags.band);

  // Colour
  const color = outfitColor(
    core,
    (i, j) => harmonyCached(ctx, core[i], core[j]),
    (i, j) => echoCached(ctx, core[i], core[j]),
  );
  const fColor = color.score;
  if (sink) {
    sink.color = fColor;
    sink.clash = fColor < COLOR_FLOOR || color.patternClash;
  }

  // Warmth and layers
  const total = totalWarmth(p);
  const shed = p.outer ?? p.mid;
  let fWarmth: number;
  let fLayer: number;
  if (mode === "core") {
    fWarmth = total <= target.mid && flags.band !== "hot" ? 1 : warmthFitOf(total, flags.band);
    fLayer = 1;
  } else {
    fWarmth = warmthFitOf(total, flags.band);
    if (flags.wide && shed) fWarmth = Math.max(fWarmth, warmthFitOf(total - shed.warmth, flags.band));
    const met = layersMet(flags.band, { topIsMid: topIsMid(p), hasMid: !!p.mid, outerWarmth: p.outer?.warmth });
    fLayer = layerFitOf(met, flags.wide, !!shed);
  }

  // Occasion, vibes, patterns
  const ideal = IDEAL_VIBE[ctx.input.occasion];
  let idealCount = 0;
  let bold = 0;
  for (const c of core) {
    if (c.primaryVibe === ideal) idealCount++;
    if (c.bold) bold++;
  }
  const fOccasion = idealCount / core.length;
  const fPattern = bold <= 1 ? 1 : 0;
  let jac = 0;
  let pairs = 0;
  let pairAff = 0;
  for (let i = 0; i < core.length; i++)
    for (let j = i + 1; j < core.length; j++) {
      const union = core[i].vibeMask | core[j].vibeMask;
      jac += union ? popcount(core[i].vibeMask & core[j].vibeMask) / popcount(union) : 0;
      pairs++;
      if (ctx.pairAff.size) pairAff += pairAffinity(ctx, core[i], core[j]);
    }
  const fVibe = pairs ? jac / pairs : 0;

  // Freshness, rain, never worn
  const fFresh = 1 - repeatPenalty(ctx, core);
  const fRain = rainFitOf(ctx, p, mode === "core");
  let fNever = 0;
  let itemAff = 0;
  for (const c of core) {
    if (c.neverWornOld) fNever = 1;
    itemAff += c.affinity;
  }

  const sFeatures =
    w.color * fColor +
    w.warmthFit * fWarmth +
    w.layerFit * fLayer +
    w.occasionFit * fOccasion +
    w.freshness * fFresh +
    w.rainFit * fRain +
    w.neverWornBoost * fNever +
    w.patternBalance * fPattern +
    w.vibeCohesion * fVibe;
  const weather = windPenalty(ctx, core) + dryRainwear(ctx, core);
  const guard = -COLOR_GUARD_SLOPE * Math.max(0, COLOR_GUARD_FROM - fColor);
  const score = sFeatures + ITEM_AFFINITY_SCALE * itemAff + PAIR_AFFINITY_SCALE * pairAff + weather + guard;

  if (detail) {
    const f: FeatureVector = {
      color: fColor,
      warmthFit: fWarmth,
      layerFit: fLayer,
      occasionFit: fOccasion,
      freshness: fFresh,
      rainFit: fRain,
      neverWornBoost: fNever,
      patternBalance: fPattern,
      vibeCohesion: fVibe,
    };
    detail.features = f;
    detail.breakdown = {};
    for (const k of FEATURE_KEYS) detail.breakdown[k] = w[k] * f[k];
    detail.breakdown.itemAffinity = ITEM_AFFINITY_SCALE * itemAff;
    detail.breakdown.pairAffinity = PAIR_AFFINITY_SCALE * pairAff;
    detail.breakdown.weather = weather;
    detail.breakdown.colorGuard = guard;
    detail.color = color;
    detail.totalWarmth = total;
    detail.score = score;
  }
  return score;
}

// What an accessory adds to a core outfit, or null when it may not join (it must be neutral
// or repeat a colour already in the outfit).
export function accessoryDelta(ctx: ScoreContext, p: Parts, acc: Prep, coreHasNeverWorn: boolean): number | null {
  const core = coreOf(p);
  if (!acc.neutral && !core.some((c) => echoCached(ctx, c, acc))) return null;
  let d = ITEM_AFFINITY_SCALE * acc.affinity + accessoryBonus(ctx, acc);
  if (!coreHasNeverWorn && acc.neverWornOld) d += ctx.w.neverWornBoost;
  if (ctx.pairAff.size) for (const c of core) d += PAIR_AFFINITY_SCALE * pairAffinity(ctx, c, acc);
  return d;
}

// Full detail for one outfit, accessory included.
export function scoreParts(ctx: ScoreContext, p: Parts): ScoreDetail {
  const detail = {} as ScoreDetail;
  scoreCore(ctx, p, "full", detail);
  if (p.accessory) {
    const coreNever = detail.features.neverWornBoost === 1;
    const acc = p.accessory;
    const pairs = ctx.pairAff.size ? coreOf(p).reduce((s, c) => s + pairAffinity(ctx, c, acc), 0) : 0;
    const bonus = accessoryBonus(ctx, acc);
    if (!coreNever && acc.neverWornOld) {
      detail.features.neverWornBoost = 1;
      detail.breakdown.neverWornBoost = ctx.w.neverWornBoost;
    }
    detail.breakdown.itemAffinity += ITEM_AFFINITY_SCALE * acc.affinity;
    detail.breakdown.pairAffinity += PAIR_AFFINITY_SCALE * pairs;
    detail.breakdown.weather += bonus;
    detail.score += (accessoryDelta(ctx, p, acc, coreNever) ?? 0);
  }
  return detail;
}

// Convenience for tests and screens: feature vector of an outfit given as items.
export function featuresOf(ctx: ScoreContext, p: Parts): FeatureVector {
  return scoreParts(ctx, p).features;
}

