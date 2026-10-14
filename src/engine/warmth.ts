// Temperature bands, warmth targets and weather flags (8.1). Pure. All temperatures are
// "feels like" in °C; wind in km/h; rain in % and mm.
import type { Band, WeatherSnapshot } from "./types";

export interface BandSpec {
  min: number; // feelsMax lower bound, inclusive (-Infinity for freezing)
  target: [number, number]; // target total warmth, lo..hi
}

export const BAND_SPECS: Record<Band, BandSpec> = {
  freezing: { min: -Infinity, target: [11, 15] },
  cold: { min: 0, target: [9, 12] },
  cool: { min: 8, target: [6, 9] },
  mild: { min: 15, target: [4, 6] },
  warm: { min: 21, target: [2, 4] },
  hot: { min: 27, target: [1, 3] },
};

// Band on feelsMax: hot ≥ 27, warm 21 to under 27, mild 15 to under 21, cool 8 to under 15,
// cold 0 to under 8, freezing under 0. Fractional values fall in the band below the next
// whole boundary (26.9 is warm).
export function bandFor(feelsMax: number): Band {
  if (feelsMax >= 27) return "hot";
  if (feelsMax >= 21) return "warm";
  if (feelsMax >= 15) return "mild";
  if (feelsMax >= 8) return "cool";
  if (feelsMax >= 0) return "cold";
  return "freezing";
}

export function targetFor(band: Band) {
  const [lo, hi] = BAND_SPECS[band].target;
  return { lo, hi, mid: (lo + hi) / 2, span: hi - lo };
}

export interface WarmthPieces {
  base?: { warmth: number }; // top or dress
  bottom?: { warmth: number };
  mid?: { warmth: number };
  outer?: { warmth: number };
  shoes?: { warmth: number };
}

// Total warmth = top/dress + bottom + mid + outer + 0.5 × shoes. Accessories do not count.
export function totalWarmth(p: WarmthPieces): number {
  return (
    (p.base?.warmth ?? 0) +
    (p.bottom?.warmth ?? 0) +
    (p.mid?.warmth ?? 0) +
    (p.outer?.warmth ?? 0) +
    0.5 * (p.shoes?.warmth ?? 0)
  );
}

// warmthFit = 1 - |total - targetMid| / targetSpan, clamped to 0..1. The span is the full
// width of the target range, so any total inside the range scores at least 0.5.
export function warmthFit(total: number, band: Band): number {
  const t = targetFor(band);
  return Math.min(1, Math.max(0, 1 - Math.abs(total - t.mid) / t.span));
}

/* Weather flags */

export const SHED_RANGE = 10; // feelsMax - feelsMin at or above this: layers you can shed
export const RAIN_PROB = 50;
export const RAIN_MM = 2;
export const WINDY_KMH = 35;
export const HIGH_UV = 7;

export const isWideRange = (w: Pick<WeatherSnapshot, "feelsMin" | "feelsMax">) => w.feelsMax - w.feelsMin >= SHED_RANGE;
export const isRainy = (w: Pick<WeatherSnapshot, "precipProb" | "precipMm">) =>
  w.precipProb >= RAIN_PROB || w.precipMm >= RAIN_MM;
export const isWindy = (w: Pick<WeatherSnapshot, "windMax">) => w.windMax >= WINDY_KMH;

export interface WeatherFlags {
  band: Band;
  wide: boolean;
  rain: boolean;
  wind: boolean;
  hotUv: boolean; // UV ≥ 7 on a hot day: hat bonus
}

export function weatherFlags(w: WeatherSnapshot): WeatherFlags {
  const band = bandFor(w.feelsMax);
  return {
    band,
    wide: isWideRange(w),
    rain: isRainy(w),
    wind: isWindy(w),
    hotUv: band === "hot" && w.uvMax >= HIGH_UV,
  };
}

/* Layer rules per band (8.1 table) */

export interface LayerShape {
  topIsMid: boolean; // the top is a layer 1 piece (a sweater worn on its own)
  hasMid: boolean; // a separate mid layer over the base
  outerWarmth?: number; // warmth of the outer layer, when there is one
}

// Required layers met? A sweater worn as the top counts as base + mid.
export function layersMet(band: Band, s: LayerShape): boolean {
  const mid = s.hasMid || s.topIsMid;
  const outer = s.outerWarmth;
  switch (band) {
    case "hot":
    case "warm":
      return true; // base only; the hard filters keep heavy layers out
    case "mild":
      return mid || (outer !== undefined && outer <= 3);
    case "cool":
      return (mid && outer !== undefined) || (outer !== undefined && outer >= 3);
    case "cold":
      return mid && outer !== undefined && outer >= 4;
    case "freezing":
      return mid && outer !== undefined && outer >= 5;
  }
}

// Hard layer prohibitions per band (8.3 rule 4), for a mid layer, an outer layer, or a
// sweater worn as the top. Requirements are soft (layerFit), so a closet without a coat
// still gets dressed in the cold, just with a low score.
export function layerAllowed(band: Band, warmth: number): boolean {
  if (band === "hot") return false; // base only, no outer
  if (band === "warm") return warmth <= 2; // outer optional and light
  return true;
}

// layerFit (8.4): 1 if required layers are met. On a wide range day (≥ 10° between morning
// and afternoon) an outfit also needs a layer it can shed to score 1; meeting only one of the
// two scores 0.5; neither scores 0.
export function layerFit(met: boolean, wide: boolean, sheddable: boolean): number {
  if (!wide) return met ? 1 : 0;
  if (met && sheddable) return 1;
  return met || sheddable ? 0.5 : 0;
}
