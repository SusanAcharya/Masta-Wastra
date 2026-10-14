// Learning from feedback (8.6). Pure: every function returns new Weights.
//
// for each feature k:  w_k ← clamp(w_k + η_t · r · (f_k - mean_k), 0.2 × default_k, 3 × default_k)
// for each item i:     itemAffinity[i] ← clamp(itemAffinity[i] + 0.10 · r, -1, 1)
// for each pair p:     pairAffinity[p] ← clamp(pairAffinity[p] + 0.15 · r, -1, 1)
// with η_t = 0.08 / (1 + n/50), n = signals so far, and mean = the mean features of the
// outfits shown alongside (centred update: a feature gains weight only when the chosen
// outfit had more of it than the alternatives).
import { pairKey } from "./score";
import { DEFAULT_WEIGHTS, FEATURE_KEYS, type FeatureVector, type Signal, type Weights } from "./types";

export const REWARDS: Record<Signal, number> = { wear: 1.0, up: 0.7, more: 0.5, skip: -0.2, down: -0.8 };
export const BASE_RATE = 0.08;
export const RATE_HALF_LIFE = 50;
export const ITEM_STEP = 0.1;
export const PAIR_STEP = 0.15;
export const MIN_FACTOR = 0.2;
export const MAX_FACTOR = 3;
export const AFFINITY_DECAY = 0.05; // per week, toward 0
export const DECAY_PERIOD_DAYS = 7;
const DROP_BELOW = 0.001; // affinities this small are removed after decay

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function learningRate(n: number): number {
  return BASE_RATE / (1 + n / RATE_HALF_LIFE);
}

// Mean feature vector of the outfits shown together (the deal, or everything shown so far).
export function meanFeatures(list: FeatureVector[]): FeatureVector {
  const out = Object.fromEntries(FEATURE_KEYS.map((k) => [k, 0])) as FeatureVector;
  if (!list.length) return out;
  for (const f of list) for (const k of FEATURE_KEYS) out[k] += f[k] / list.length;
  return out;
}

export interface FeedbackEvent {
  signal: Signal;
  features: FeatureVector;
  dealMean?: FeatureVector; // without it there is nothing to centre on, so weights stay put
  itemIds: string[];
}

export function applyFeedback(weights: Weights, ev: FeedbackEvent, at?: string): Weights {
  const r = REWARDS[ev.signal];
  const eta = learningRate(weights.signals ?? 0);
  const w = { ...DEFAULT_WEIGHTS, ...weights.w };
  if (ev.dealMean) {
    for (const k of FEATURE_KEYS) {
      const d = DEFAULT_WEIGHTS[k];
      w[k] = clamp(w[k] + eta * r * (ev.features[k] - ev.dealMean[k]), MIN_FACTOR * d, MAX_FACTOR * d);
    }
  }
  const ids = [...new Set(ev.itemIds)];
  const itemAffinity = { ...weights.itemAffinity };
  for (const id of ids) itemAffinity[id] = clamp((itemAffinity[id] ?? 0) + ITEM_STEP * r, -1, 1);
  const pairAffinity = { ...weights.pairAffinity };
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const key = pairKey(ids[i], ids[j]);
      pairAffinity[key] = clamp((pairAffinity[key] ?? 0) + PAIR_STEP * r, -1, 1);
    }
  return {
    ...weights,
    w,
    itemAffinity,
    pairAffinity,
    signals: (weights.signals ?? 0) + 1,
    updatedAt: at ?? weights.updatedAt,
  };
}

// Weekly decay of all affinities toward 0 by 5% (compounded per whole week missed). The
// first call only starts the clock. `nowISO` is passed in; the engine never reads the clock.
export function decayIfDue(weights: Weights, nowISO: string): Weights {
  if (!weights.decayedAt) return { ...weights, decayedAt: nowISO };
  const period = DECAY_PERIOD_DAYS * 86_400_000;
  const elapsed = Date.parse(nowISO) - Date.parse(weights.decayedAt);
  const weeks = Math.floor(elapsed / period);
  if (!(weeks >= 1)) return weights;
  const f = (1 - AFFINITY_DECAY) ** weeks;
  const decay = (m: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(m)) {
      const x = v * f;
      if (Math.abs(x) >= DROP_BELOW) out[k] = x;
    }
    return out;
  };
  return {
    ...weights,
    itemAffinity: decay(weights.itemAffinity),
    pairAffinity: decay(weights.pairAffinity),
    decayedAt: new Date(Date.parse(weights.decayedAt) + weeks * period).toISOString(),
  };
}

// Default weights, as src/db/repo.ts defaultWeights but without reading the clock.
export function defaultTaste(at: string): Weights {
  return {
    id: "current",
    version: 1,
    w: { ...DEFAULT_WEIGHTS },
    itemAffinity: {},
    pairAffinity: {},
    signals: 0,
    updatedAt: at,
  };
}

// "Reset my taste": defaults again. History (wears, feedback) lives elsewhere and is kept.
export function resetTaste(at: string, prev?: Pick<Weights, "version">): Weights {
  return { ...defaultTaste(at), version: prev?.version ?? 1 };
}
