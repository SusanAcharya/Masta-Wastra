// Candidate generation (8.3). Pure.
//
// 1. Hard filters per item: not archived, occasion, warmth sanity.
// 2. Items go into slot pools; layer prohibitions per band; accessory rules.
// 3. Worn yesterday: dropped from a core slot unless that slot has fewer than 3 options.
// 4. Enumerate every combination when the product is at most 5,000. Otherwise keep the top
//    12 per slot by item level score, and if that is still over 5,000, run a two stage beam:
//    score top + bottom + shoes cores optimistically, keep the best (with a cap on how often
//    one item may appear), then try every mid and outer option on each kept core.
// 5. Each candidate takes at most one accessory, the one that raises its score most.
import { layerAllowed } from "./warmth";
import {
  FORMAL_ACCESSORY_VIBES,
  IDEAL_VIBE,
  OCCASION_VIBES,
  accessoryDelta,
  coreOf,
  scoreCore,
  signatureOf,
  type Parts,
  type Prep,
  type ScoreContext,
} from "./score";
import type { Band, Item, LimitingSlot, Occasion } from "./types";

export const ENUMERATE_LIMIT = 5000;
export const SLOT_CAP = 12;
export const CORE_BEAM_TOPS = 40; // cores built on top + bottom kept by the beam
export const CORE_BEAM_DRESSES = 16; // cores built on a dress kept by the beam
export const CORE_BEAM_ITEM_CAP = 8; // one item may appear in at most this many kept cores
export const SMALL_SLOT = 3; // fewer options than this: yesterday's piece stays, with a penalty

export type PoolSlot = "top" | "dress" | "bottom" | "shoes" | "mid" | "outer" | "accessory";
export type Pools = Record<PoolSlot, Prep[]>;

/* Item filters */

export const isCore = (item: Pick<Item, "category">) => item.category !== "accessory";

// 8.3 rule 2. An item passes when its own occasions name the day's occasion, or its vibes
// are compatible by OCCASION_VIBES. On a formal day only core pieces must be formal.
export function occasionOk(item: Pick<Item, "occasions" | "vibes" | "category">, occasion: Occasion): boolean {
  if (item.occasions.includes(occasion)) return true;
  const allowed = occasion === "formal" && !isCore(item) ? FORMAL_ACCESSORY_VIBES : OCCASION_VIBES[occasion];
  return item.vibes.some((v) => allowed.includes(v));
}

// 8.3 rule 3. Hot: nothing with warmth 4 or more except shoes. Cool, cold and freezing: no shorts
// and no sandals (the prompt said cold and colder; the journey test picked shorts at 13 to 19 °C,
// so cool joins, and mild days penalise them in score.ts).
export function warmthSane(item: Pick<Item, "warmth" | "category" | "subtype">, band: Band): boolean {
  if (band === "hot") return item.category === "shoes" || item.warmth < 4;
  if (band === "cool" || band === "cold" || band === "freezing") return item.subtype !== "shorts" && item.subtype !== "sandals";
  return true;
}

export function itemPasses(item: Item, occasion: Occasion, band: Band): boolean {
  return !item.archived && occasionOk(item, occasion) && warmthSane(item, band);
}

// Optional accessory (8.3): bag and belt always; scarf and gloves when cold; a hat when hot
// with high UV, or when cold; a cap when hot with high UV.
export function accessoryAllowed(subtype: string, band: Band, hotUv: boolean): boolean {
  const cold = band === "cold" || band === "freezing";
  switch (subtype) {
    case "bag":
    case "belt":
      return true;
    case "scarf":
    case "gloves":
      return cold;
    case "hat":
      return hotUv || cold;
    case "cap":
      return hotUv;
    default:
      return false;
  }
}

// The slots an item can fill.
export function slotsFor(item: Pick<Item, "category" | "layer">): PoolSlot[] {
  switch (item.category) {
    case "top":
      if (item.layer === 2) return ["outer"];
      return item.layer === 1 ? ["top", "mid"] : ["top"];
    case "outer":
      return item.layer === 2 ? ["outer"] : ["mid"];
    case "dress":
      return ["dress"];
    case "bottom":
      return ["bottom"];
    case "shoes":
      return ["shoes"];
    case "accessory":
      return ["accessory"];
  }
}

/* Pools */

export interface PoolResult {
  pools: Pools;
  counts: Record<PoolSlot, number>; // options per slot after filters, before the yesterday rule
}

const emptyPools = (): Pools => ({ top: [], dress: [], bottom: [], shoes: [], mid: [], outer: [], accessory: [] });

export function buildPools(ctx: ScoreContext): PoolResult {
  const { band, hotUv } = ctx.flags;
  const pools = emptyPools();
  for (const p of ctx.preps) {
    if (!itemPasses(p.item, ctx.input.occasion, band)) continue;
    for (const slot of slotsFor(p.item)) {
      if (slot === "mid" || slot === "outer") {
        if (!layerAllowed(band, p.warmth)) continue;
      } else if (slot === "top" && p.item.layer === 1) {
        if (!layerAllowed(band, p.warmth)) continue; // a sweater on its own is still a layer
      } else if (slot === "accessory") {
        if (!accessoryAllowed(p.item.subtype, band, hotUv)) continue;
      }
      pools[slot].push(p);
    }
  }
  const counts = Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, v.length])) as Record<PoolSlot, number>;

  // 8.3 rule 5: yesterday's core pieces stay out unless the slot is small.
  for (const slot of ["top", "dress", "bottom", "shoes", "mid", "outer"] as const) {
    if (pools[slot].length >= SMALL_SLOT) pools[slot] = pools[slot].filter((p) => !p.wornYesterday);
  }
  return { pools, counts };
}

/* Limiting slot (8.7.7) */

export interface Limiting {
  slot: LimitingSlot;
  count: number;
}

// The slot with the fewest options among those today's outfit needs. A dress counts as both
// a top and a bottom. Layers count only in bands that need them. Null when every needed slot
// has at least 3 options. Ties go to the first in the order top, bottom, shoes, outer, mid.
export function limitingSlot(counts: Record<PoolSlot, number>, band: Band): Limiting | null {
  const needs: [LimitingSlot, number][] = [
    ["top", counts.top + counts.dress],
    ["bottom", counts.bottom + counts.dress],
    ["shoes", counts.shoes],
  ];
  if (band === "cool" || band === "cold" || band === "freezing") needs.push(["outer", counts.outer]);
  if (band === "cold" || band === "freezing") needs.push(["mid", counts.mid]);
  let best = needs[0];
  for (const n of needs) if (n[1] < best[1]) best = n;
  return best[1] >= SMALL_SLOT ? null : { slot: best[0], count: best[1] };
}

/* Item level score, for the per slot cap */

const SLOT_IDEAL_WARMTH: Record<Band, { base: number; mid: number; outer: number }> = {
  hot: { base: 1, mid: 1, outer: 1 },
  warm: { base: 1.5, mid: 1.5, outer: 1.5 },
  mild: { base: 2, mid: 2.5, outer: 2.5 },
  cool: { base: 2.5, mid: 3, outer: 3 },
  cold: { base: 3, mid: 3.5, outer: 4 },
  freezing: { base: 3.5, mid: 4, outer: 5 },
};

// Affinity + warmth fit + occasion fit (8.3), plus a small nudge for recently worn and never
// worn pieces so the cap does not keep the same twelve every day.
export function itemLevelScore(ctx: ScoreContext, p: Prep, slot: PoolSlot): number {
  const ideal = SLOT_IDEAL_WARMTH[ctx.flags.band][slot === "mid" ? "mid" : slot === "outer" ? "outer" : "base"];
  const warmth = 1 - Math.abs(p.warmth - ideal) / 4;
  const occasion = p.primaryVibe === IDEAL_VIBE[ctx.input.occasion] ? 1 : 0.5;
  const d = p.lastWornDaysAgo;
  const recent = d !== null && d < 7 ? 0.3 * (1 - d / 7) : 0;
  return 0.5 * p.affinity + warmth + occasion - recent + (p.neverWornOld ? 0.2 : 0);
}

function capPool(ctx: ScoreContext, pool: Prep[], slot: PoolSlot, cap = SLOT_CAP): Prep[] {
  if (pool.length <= cap) return pool;
  return pool
    .map((p) => ({ p, s: itemLevelScore(ctx, p, slot) }))
    .sort((a, b) => b.s - a.s || (a.p.id < b.p.id ? -1 : 1))
    .slice(0, cap)
    .map((x) => x.p);
}

/* Enumeration */

export interface Candidate {
  parts: Parts;
  score: number; // raw S, accessory included
  color: number; // S_color
  clash: boolean; // S_color under the floor, or two bold patterns
  core: Prep[];
  coreSig: string; // signature of core pieces only
}

export interface CandidateStats {
  product: number; // combinations before any cap
  capped: boolean; // top 12 per slot applied
  beam: boolean; // two stage beam used
  counts: Record<PoolSlot, number>;
  limiting: Limiting | null;
}

export interface CandidateSet {
  candidates: Candidate[];
  accessories: Prep[]; // the accessory pool, so a deal can swap a repeated accessory
  stats: CandidateStats;
}

interface Shape {
  pools: Pools;
  midRequired: boolean;
  outerRequired: boolean;
  accessoryForced?: Prep;
}

function productOf(s: Shape): number {
  const { pools } = s;
  const bases = pools.top.length * pools.bottom.length + pools.dress.length;
  const mid = pools.mid.length + (s.midRequired ? 0 : 1);
  const outer = pools.outer.length + (s.outerRequired ? 0 : 1);
  return bases * pools.shoes.length * mid * outer;
}

interface Core {
  base: Prep;
  bottom?: Prep;
  shoes: Prep;
}

function coresOf(pools: Pools): Core[] {
  const cores: Core[] = [];
  for (const shoes of pools.shoes) {
    for (const top of pools.top) for (const bottom of pools.bottom) cores.push({ base: top, bottom, shoes });
    for (const dress of pools.dress) cores.push({ base: dress, shoes });
  }
  return cores;
}

function expand(ctx: ScoreContext, s: Shape, cores: Core[], out: Candidate[]) {
  const mids: (Prep | undefined)[] = s.midRequired ? [...s.pools.mid] : [undefined, ...s.pools.mid];
  const outers: (Prep | undefined)[] = s.outerRequired ? [...s.pools.outer] : [undefined, ...s.pools.outer];
  const sink = { color: 0, clash: false };
  for (const c of cores) {
    const sweaterTop = c.base.item.category === "top" && c.base.item.layer === 1;
    for (const mid of mids) {
      if (mid && (sweaterTop || mid.id === c.base.id)) continue; // no sweater over a sweater
      if (!mid && s.midRequired) continue;
      for (const outer of outers) {
        if (outer && (outer.id === c.base.id || outer.id === mid?.id)) continue;
        const parts: Parts = { outer, mid, base: c.base, bottom: c.bottom, shoes: c.shoes };
        const score = scoreCore(ctx, parts, "full", undefined, sink);
        out.push({ parts, score, color: sink.color, clash: sink.clash, core: coreOf(parts), coreSig: "" });
      }
    }
  }
}

// Two stage beam: keep the best cores (optimistic score), with diversity caps, then layers.
function beamCores(ctx: ScoreContext, pools: Pools): Core[] {
  const scored = coresOf(pools).map((c) => ({ c, s: scoreCore(ctx, { ...c }, "core") }));
  scored.sort((a, b) => b.s - a.s);
  const uses = new Map<string, number>();
  const kept: Core[] = [];
  let tops = 0;
  let dresses = 0;
  for (const { c } of scored) {
    const isDress = !c.bottom;
    if (isDress ? dresses >= CORE_BEAM_DRESSES : tops >= CORE_BEAM_TOPS) continue;
    const ids = [c.base.id, c.shoes.id, ...(c.bottom ? [c.bottom.id] : [])];
    if (ids.some((id) => (uses.get(id) ?? 0) >= CORE_BEAM_ITEM_CAP)) continue;
    for (const id of ids) uses.set(id, (uses.get(id) ?? 0) + 1);
    kept.push(c);
    if (isDress) dresses++;
    else tops++;
    if (tops >= CORE_BEAM_TOPS && dresses >= CORE_BEAM_DRESSES) break;
  }
  return kept;
}

function generateShape(ctx: ScoreContext, shape: Shape, stats: CandidateStats, out: Candidate[]) {
  const product = productOf(shape);
  stats.product += product;
  if (product === 0) return;
  if (product <= ENUMERATE_LIMIT) {
    expand(ctx, shape, coresOf(shape.pools), out);
    return;
  }
  stats.capped = true;
  const pools = { ...shape.pools };
  for (const slot of Object.keys(pools) as PoolSlot[]) pools[slot] = capPool(ctx, pools[slot], slot);
  const capped: Shape = { ...shape, pools };
  if (productOf(capped) <= ENUMERATE_LIMIT) {
    expand(ctx, capped, coresOf(pools), out);
    return;
  }
  stats.beam = true;
  expand(ctx, capped, beamCores(ctx, pools), out);
}

// Adds the best accessory to each candidate (only when it raises the score), and the core
// signature. A forced accessory always joins.
function finish(ctx: ScoreContext, shape: Shape, list: Candidate[]) {
  const accessories = shape.accessoryForced ? [shape.accessoryForced] : shape.pools.accessory;
  for (const c of list) {
    c.coreSig = signatureOf(c.core.map((p) => p.id));
    if (!accessories.length) continue;
    const coreNever = c.core.some((p) => p.neverWornOld);
    let best: Prep | undefined;
    let bestDelta = 0;
    for (const a of accessories) {
      const d = accessoryDelta(ctx, c.parts, a, coreNever);
      if (shape.accessoryForced) {
        best = a;
        bestDelta = d ?? 0;
      } else if (d !== null && d > bestDelta) {
        best = a;
        bestDelta = d;
      }
    }
    if (best) {
      c.parts = { ...c.parts, accessory: best };
      c.score += bestDelta;
    }
  }
}

export interface GenerateOptions {
  force?: string; // item id that every candidate must include ("Outfits with this", 10.3)
}

export function generateCandidates(ctx: ScoreContext, opts: GenerateOptions = {}): CandidateSet {
  const { pools, counts } = buildPools(ctx);
  const stats: CandidateStats = {
    product: 0,
    capped: false,
    beam: false,
    counts,
    limiting: limitingSlot(counts, ctx.flags.band),
  };
  const shapes: Shape[] = [];

  if (!opts.force) {
    shapes.push({ pools, midRequired: false, outerRequired: false });
  } else {
    // The forced item skips the item filters (it was asked for), but not archiving.
    const forced = ctx.byId.get(opts.force);
    if (!forced || forced.item.archived) return { candidates: [], accessories: [], stats };
    for (const slot of slotsFor(forced.item)) {
      const p: Pools = { ...pools, [slot]: [forced] };
      if (slot === "dress") {
        p.top = [];
        p.bottom = [];
      }
      if (slot === "top" || slot === "bottom") p.dress = [];
      // Never let the forced item fill a second slot as well.
      for (const other of Object.keys(p) as PoolSlot[])
        if (other !== slot) p[other] = p[other].filter((x) => x.id !== forced.id);
      shapes.push({
        pools: p,
        midRequired: slot === "mid",
        outerRequired: slot === "outer",
        accessoryForced: slot === "accessory" ? forced : undefined,
      });
    }
  }

  const candidates: Candidate[] = [];
  for (const shape of shapes) {
    const list: Candidate[] = [];
    generateShape(ctx, shape, stats, list);
    finish(ctx, shape, list);
    candidates.push(...list);
  }
  return { candidates, accessories: pools.accessory, stats };
}

