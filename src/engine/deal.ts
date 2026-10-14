// The deal (8.7), changed by the owner in M5 to "Pick my outfit": one best outfit, then
// "Show another" on request, each clearly different from everything already shown.
// `deal(input)` still returns up to `n` diverse outfits (default 3). Pure and deterministic
// for the same inputs and seed.
//
// Selection, for each pick after the first: only outfits sharing at most 1 core item with
// every outfit already picked or shown; value = S - λ · maxOverlap (Jaccard of core items),
// λ = 0.35 × S_max, minus 0.5 λ when it does not tell a different colour story or use a
// different template. Near ties (within 3% of S_max) are broken by the seed. Outfits whose
// colours clash (S_color < 0.5, or two bold patterns) are never picked while any outfit
// passes that floor.
import { colorStory, differentStory, type ColorStory } from "./color";
import { explain } from "./explain";
import { generateCandidates, type Candidate, type CandidateStats, type Limiting } from "./candidates";
import {
  accessoryDelta,
  buildScoreContext,
  coreOf,
  displayScore,
  scoreParts,
  signatureOf,
  type Parts,
  type Prep,
  type ScoreContext,
  type ScoreInput,
} from "./score";
import type { Band, FeatureVector, OutfitBase, Slot, TemplateId, Units } from "./types";

export const LAMBDA_FACTOR = 0.35;
export const NEAR_TIE = 0.03; // of S_max
export const SAME_STORY_PENALTY = 0.5; // × λ
export const MAX_OVERLAP = 1; // core items shared with an earlier pick
export const MAX_RESHUFFLES = 3; // "Deal again" per day (8.7.5), enforced by the caller
// An item at or below this affinity (about ten thumbs down) is held back while any outfit
// without it works, so it leaves the deal "unless the closet has no alternative" (8.6).
export const DISLIKED_AFFINITY = -0.75;

export interface DealInput extends ScoreInput {
  seed: number;
  n?: number; // how many outfits, default 3 (the Pick screen uses 1)
  exclude?: string[]; // signatures never to return
  shown?: string[]; // signatures already shown: never returned, and new picks stay clearly different
  units?: Units;
}

export interface DealtOutfit {
  itemIds: string[]; // outer, mid, top/dress, bottom, shoes, accessory
  signature: string; // sorted item ids joined with "|", as src/db/repo.ts outfitSignature
  coreSignature: string; // the same without the accessory
  template: TemplateId;
  base: OutfitBase;
  slots: Partial<Record<Slot, string>>;
  features: FeatureVector;
  breakdown: Record<string, number>;
  score: number; // raw S, for ranking
  displayScore: number; // 0..100
  reason: string;
  diverse: boolean; // false when the overlap rule had to be relaxed for this pick
}

export interface DealResult {
  outfits: DealtOutfit[];
  band: Band;
  sMax: number;
  candidateCount: number; // valid outfits before exclusions
  remaining: number; // valid outfits not yet shown, after this result
  limiting: Limiting | null; // the slot to grow, for "Add a pair of shoes to unlock more looks"
  relaxed: boolean; // some pick shares more than 1 core item with an earlier one
  colorRelaxed: boolean; // nothing passed the colour floor, so clashing outfits were allowed
  stats: CandidateStats;
}

/* Seeds and hashing */

// FNV-1a, 32 bit. Stable across platforms.
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Seed = hash(localDate + installId) (8.7.1).
export function dealSeed(localDate: string, installId: string): number {
  return hashString(localDate + installId);
}

export const canDealAgain = (reshuffles: number) => reshuffles < MAX_RESHUFFLES;

/* Ranking */

// Everything that does not depend on what was shown, so "Show another" can reuse it.
export interface Ranked {
  ctx: ScoreContext;
  sorted: Candidate[]; // best first, one per core signature
  accessories: Prep[];
  stats: CandidateStats;
}

export function rank(input: ScoreInput, force?: string): Ranked {
  const ctx = buildScoreContext(input);
  const set = generateCandidates(ctx, { force });
  const best = new Map<string, Candidate>();
  for (const c of set.candidates) {
    const prev = best.get(c.coreSig);
    if (!prev || c.score > prev.score) best.set(c.coreSig, c);
  }
  const sorted = [...best.values()].sort((a, b) => b.score - a.score || (a.coreSig < b.coreSig ? -1 : 1));
  return { ctx, sorted, accessories: set.accessories, stats: set.stats };
}

/* Shapes of outfits, for diversity */

export function baseOf(p: Parts): OutfitBase {
  return p.base.item.category === "dress" ? "B" : "A";
}

export function templateOf(p: Parts): TemplateId {
  return p.outer ? "D" : p.mid ? "C" : baseOf(p);
}

const templateKey = (p: Parts) => `${baseOf(p)}${p.mid ? "+mid" : ""}${p.outer ? "+outer" : ""}`;

interface Picked {
  core: Set<string>;
  story: ColorStory | null;
  key: string | null;
}

function pickedOf(parts: Parts): Picked {
  const core = coreOf(parts);
  return { core: new Set(core.map((p) => p.id)), story: colorStory(core, 0), key: templateKey(parts) };
}

// Rebuilds slots from a stored signature, for outfits shown earlier.
export function partsFromIds(ctx: ScoreContext, ids: readonly string[]): Parts | null {
  const preps = ids.map((id) => ctx.byId.get(id)).filter((p): p is Prep => !!p);
  const find = (f: (p: Prep) => boolean) => preps.find(f);
  const dress = find((p) => p.item.category === "dress");
  const tops = preps.filter((p) => p.item.category === "top" && p.item.layer < 2);
  const base = dress ?? tops.find((p) => p.item.layer === 0) ?? tops[0];
  const shoes = find((p) => p.item.category === "shoes");
  if (!base || !shoes) return null;
  return {
    outer: find((p) => p.item.layer === 2 && (p.item.category === "outer" || p.item.category === "top")),
    mid: find((p) => p !== base && ((p.item.category === "outer" && p.item.layer < 2) || (p.item.category === "top" && p.item.layer === 1))),
    base,
    bottom: find((p) => p.item.category === "bottom"),
    shoes,
    accessory: find((p) => p.item.category === "accessory"),
  };
}

function coreSigOfSignature(ctx: ScoreContext, sig: string): string {
  const ids = sig.split("|").filter((id) => ctx.byId.get(id)?.item.category !== "accessory");
  return signatureOf(ids);
}

function overlapCount(a: Set<string>, core: Prep[]): number {
  let n = 0;
  for (const p of core) if (a.has(p.id)) n++;
  return n;
}

/* Selection */

export interface SelectOptions {
  seed: number;
  n?: number;
  exclude?: string[];
  shown?: string[];
  units?: Units;
  hardOverlap?: boolean; // default true; outfitsWith uses a soft overlap only
}

export function select(r: Ranked, opts: SelectOptions): DealResult {
  const { ctx } = r;
  const n = opts.n ?? 3;
  const lambda = LAMBDA_FACTOR * ctx.sMax;
  const tol = NEAR_TIE * ctx.sMax;
  const hard = opts.hardOverlap ?? true;

  const blocked = new Set<string>();
  for (const s of [...(opts.exclude ?? []), ...(opts.shown ?? [])]) blocked.add(coreSigOfSignature(ctx, s));
  const previous: Picked[] = [];
  for (const s of opts.shown ?? []) {
    const parts = partsFromIds(ctx, s.split("|"));
    if (parts) previous.push(pickedOf(parts));
    else previous.push({ core: new Set(s.split("|")), story: null, key: null });
  }

  // Preference tiers: no clash and nothing disliked; then no clash; then anything.
  let pool = r.sorted.filter((c) => !blocked.has(c.coreSig));
  const passing = pool.filter((c) => !c.clash);
  const colorRelaxed = passing.length === 0 && pool.length > 0;
  if (!colorRelaxed) pool = passing;
  const liked = pool.filter((c) => !c.core.some((p) => p.affinity <= DISLIKED_AFFINITY));
  if (liked.length) pool = liked;

  const picks: { c: Candidate; diverse: boolean }[] = [];
  let relaxed = false;
  const taken = new Set<string>();

  while (picks.length < n) {
    const choice = pickNext(pool, taken, previous, lambda, tol, opts.seed, hard);
    if (!choice) break;
    if (!choice.diverse) relaxed = true;
    picks.push(choice);
    taken.add(choice.c.coreSig);
    previous.push(pickedOf(choice.c.parts));
  }

  // Accessories do not repeat across one result: a later pick takes its next best, or none.
  const usedAcc = new Set<string>();
  const outfits = picks.map(({ c, diverse }) => {
    let parts = c.parts;
    if (parts.accessory && usedAcc.has(parts.accessory.id)) parts = swapAccessory(ctx, parts, r.accessories, usedAcc);
    if (parts.accessory) usedAcc.add(parts.accessory.id);
    return materialize(ctx, parts, diverse, opts.units);
  });

  return {
    outfits,
    band: ctx.flags.band,
    sMax: ctx.sMax,
    candidateCount: r.sorted.length,
    remaining: Math.max(0, pool.length - picks.length),
    limiting: r.stats.limiting,
    relaxed,
    colorRelaxed,
    stats: r.stats,
  };
}

function pickNext(
  pool: Candidate[],
  taken: Set<string>,
  previous: Picked[],
  lambda: number,
  tol: number,
  seed: number,
  hard: boolean,
): { c: Candidate; diverse: boolean } | null {
  const run = (strict: boolean) => {
    // pool is sorted by S, and value ≤ S, so stop once S cannot reach the best value.
    let bestValue = -Infinity;
    const scored: { c: Candidate; v: number }[] = [];
    for (const c of pool) {
      if (c.score < bestValue - tol) break;
      if (taken.has(c.coreSig)) continue;
      let maxOverlap = 0;
      let maxCount = 0;
      let distinct = true;
      let story: ColorStory | null = null;
      for (const p of previous) {
        const count = overlapCount(p.core, c.core);
        maxCount = Math.max(maxCount, count);
        maxOverlap = Math.max(maxOverlap, count / (p.core.size + c.core.length - count));
        if (distinct) {
          story ??= colorStory(c.core, 0);
          const sameStory = !p.story || !differentStory(story, p.story);
          const sameShape = p.key === null || p.key === templateKey(c.parts);
          if (sameStory && sameShape) distinct = false;
        }
      }
      if (strict && maxCount > MAX_OVERLAP) continue;
      const v = previous.length ? c.score - lambda * maxOverlap - (distinct ? 0 : SAME_STORY_PENALTY * lambda) : c.score;
      scored.push({ c, v });
      if (v > bestValue) bestValue = v;
    }
    if (!scored.length) return null;
    // Near ties: the seed decides, so equal looks do not always come out in the same order.
    let pick: Candidate | null = null;
    let pickHash = Infinity;
    for (const { c, v } of scored) {
      if (v < bestValue - tol) continue;
      const h = hashString(`${seed}:${c.coreSig}`);
      if (h < pickHash) {
        pickHash = h;
        pick = c;
      }
    }
    return pick;
  };

  const strict = hard && previous.length > 0;
  const c = run(strict);
  if (c) return { c, diverse: true };
  if (!strict) return null;
  const loose = run(false);
  return loose ? { c: loose, diverse: false } : null;
}

function swapAccessory(ctx: ScoreContext, parts: Parts, accessories: Prep[], used: Set<string>): Parts {
  const core = coreOf(parts);
  const coreNever = core.some((p) => p.neverWornOld);
  let best: Prep | undefined;
  let bestDelta = 0;
  for (const a of accessories) {
    if (used.has(a.id)) continue;
    const d = accessoryDelta(ctx, parts, a, coreNever);
    if (d !== null && d > bestDelta) {
      best = a;
      bestDelta = d;
    }
  }
  return { ...parts, accessory: best };
}

export function materialize(ctx: ScoreContext, parts: Parts, diverse = true, units?: Units): DealtOutfit {
  const detail = scoreParts(ctx, parts);
  const ordered = [...coreOf(parts), ...(parts.accessory ? [parts.accessory] : [])];
  const itemIds = ordered.map((p) => p.id);
  const slots: Partial<Record<Slot, string>> = {};
  if (parts.outer) slots.outer = parts.outer.id;
  if (parts.mid) slots.mid = parts.mid.id;
  slots[parts.base.item.category === "dress" ? "dress" : "top"] = parts.base.id;
  if (parts.bottom) slots.bottom = parts.bottom.id;
  slots.shoes = parts.shoes.id;
  if (parts.accessory) slots.accessory = parts.accessory.id;
  return {
    itemIds,
    signature: signatureOf(itemIds),
    coreSignature: signatureOf(coreOf(parts).map((p) => p.id)),
    template: templateOf(parts),
    base: baseOf(parts),
    slots,
    features: detail.features,
    breakdown: detail.breakdown,
    score: detail.score,
    displayScore: displayScore(detail.score, ctx.sMax),
    reason: explain({
      parts,
      detail,
      w: ctx.w,
      flags: ctx.flags,
      weather: ctx.input.weather,
      occasion: ctx.input.occasion,
      units,
    }),
    diverse,
  };
}

/* Public entry points */

// Up to n diverse outfits (default 3).
export function deal(input: DealInput): DealResult {
  return select(rank(input), input);
}

export interface PickResult {
  outfit: DealtOutfit | null;
  result: DealResult;
}

// "Pick my outfit": the single best outfit for today, and why.
export function pickOutfit(input: DealInput): PickResult {
  const result = select(rank(input), { ...input, n: 1 });
  return { outfit: result.outfits[0] ?? null, result };
}

// "Show another": the next best outfit that shares at most 1 core item with every outfit in
// `shownSignatures`, preferring a different colour story or template.
export function pickAnother(input: DealInput, shownSignatures: string[]): PickResult {
  const shown = [...(input.shown ?? []), ...shownSignatures];
  const result = select(rank(input), { ...input, shown, n: 1 });
  return { outfit: result.outfits[0] ?? null, result };
}

// Ranks once, then answers repeated "Show another" taps without recomputing candidates.
export function createPicker(input: Omit<DealInput, "seed"> & { seed?: number }) {
  const ranked = rank(input);
  return {
    ranked,
    pick(seed = input.seed ?? 0): PickResult {
      const result = select(ranked, { ...input, seed, n: 1 });
      return { outfit: result.outfits[0] ?? null, result };
    },
    another(shownSignatures: string[], seed = input.seed ?? 0): PickResult {
      const result = select(ranked, { ...input, seed, n: 1, shown: [...(input.shown ?? []), ...shownSignatures] });
      return { outfit: result.outfits[0] ?? null, result };
    },
  };
}

// "Outfits with this" (10.3): the top n outfits that include the item, kept varied with a
// soft overlap penalty (the forced item itself is always shared).
export function outfitsWith(itemId: string, input: DealInput, n = 6): DealtOutfit[] {
  return select(rank(input, itemId), { ...input, n, shown: [], exclude: input.exclude, hardOverlap: false }).outfits;
}
