// Colour math for outfits (8.2). Pure. Colours are compared in OKLab / OKLCH, using each
// item's whole palette (colors[] with shares), not only the primary colour, so a navy and
// white striped shirt "knows" it has white in it and pairs with white sneakers.
import { deltaE, hexToOklab, hueDelta, labToLch, nearestColorName, type Lab, type Lch } from "@/lib/oklab";
import type { Item, ItemColor, Pattern } from "./types";

/* Neutrals */

export const NEUTRAL_CHROMA = 0.04;

// Colour names that are neutral families whatever the measured hex says (8.2, plus charcoal
// and cream as shades of grey and white, olive and brown as low chroma earth tones).
const NEUTRAL_NAMES = new Set([
  "black",
  "white",
  "grey",
  "gray",
  "charcoal",
  "cream",
  "navy",
  "beige",
  "camel",
  "khaki",
  "denim",
  "olive",
  "brown",
]);

// Subtypes that are denim by nature. Denim behaves as a neutral (8.2).
const DENIM_SUBTYPES = new Set(["jeans"]);

// Is one colour neutral? Chroma under 0.04, or a known neutral family.
export function colorIsNeutral(hex: string, name?: string): boolean {
  if (name && NEUTRAL_NAMES.has(name.toLowerCase())) return true;
  const { L, C, h } = labToLch(hexToOklab(hex));
  if (C < NEUTRAL_CHROMA) return true;
  if (L < 0.35 && h >= 240 && h <= 275 && C < 0.12) return true; // navy
  if (h >= 50 && h <= 95 && C < 0.1) return true; // beige, camel, khaki (and brown)
  if (h > 95 && h <= 130 && C < 0.08) return true; // olive, low chroma only
  return false;
}

type NeutralFields = Pick<Item, "isNeutral" | "neutralOverride" | "subtype" | "colors" | "primaryHex">;

export function isDenim(item: Pick<Item, "subtype" | "colors">): boolean {
  if (DENIM_SUBTYPES.has(item.subtype)) return true;
  const name = item.colors[0]?.name?.toLowerCase();
  return name === "denim" || name === "jeans";
}

// Item level neutral flag. A user override always wins, then denim, then the primary colour.
export function isNeutralItem(item: NeutralFields): boolean {
  if (item.neutralOverride) return item.isNeutral;
  if (isDenim(item)) return true;
  return colorIsNeutral(item.primaryHex || item.colors[0]?.hex || "#808080", item.colors[0]?.name);
}

/* Prepared colours */

export interface ColorPoint {
  hex: string;
  name: string; // a colour name for explanations
  share: number;
  lab: Lab;
  lch: Lch;
  neutral: boolean;
}

// An item's palette, ready for pair maths. The primary colour takes the item level neutral
// flag (so overrides and denim apply); secondary colours use the colour rule.
export function itemPalette(item: NeutralFields): ColorPoint[] {
  const colors: ItemColor[] = item.colors.length
    ? item.colors
    : [{ hex: item.primaryHex || "#808080", name: "", share: 1 }];
  const total = colors.reduce((s, c) => s + (c.share > 0 ? c.share : 0), 0) || 1;
  const itemNeutral = isNeutralItem(item);
  return colors.map((c, i) => {
    const lab = hexToOklab(c.hex);
    return {
      hex: c.hex,
      name: c.name || nearestColorName(c.hex),
      share: (c.share > 0 ? c.share : 0) / total || 1 / colors.length,
      lab,
      lch: labToLch(lab),
      neutral: i === 0 ? itemNeutral : colorIsNeutral(c.hex, c.name),
    };
  });
}

/* Pair harmony */

// Two colours this close in OKLab read as the same colour repeated ("echo").
export const ECHO_DE = 0.04;
// Near miss: two colours of nearly the same lightness (ΔL < 0.15) that are not an echo and
// read as "almost the same": both dark (L < 0.4, navy with black), both low chroma
// (C < 0.06, two slightly different beiges, white with cream), or both chromatic with hues
// within 30° (red with orange, a blue tee on denim). Looks like a failed match, so it scores
// below both a clear match and a clear contrast.
export const NEAR_MISS_DL = 0.15;
export const NEAR_MISS_DARK_L = 0.4;
export const NEAR_MISS_LOW_C = 0.06;
export const NEAR_MISS_HUE = 30;
const CHROMATIC_C = 0.04;
export const TONAL_HUE = 15;
export const TONAL_DL = 0.25;

export const HARMONY = {
  echo: 0.9,
  nearMiss: 0.4,
  neutralPair: 0.75,
  neutralContrast: 0.8, // two neutrals with clear lightness contrast (ΔL ≥ 0.25)
  neutralAccent: 0.9,
  analogous: 0.8,
  complementary: 0.9,
  split: 0.6,
  awkward: 0.2,
  tonal: 0.85,
} as const;

export type HarmonyKind = keyof typeof HARMONY;

// Hue table for two non-neutral colours, Δ in degrees 0..180 (8.2).
export function hueHarmony(delta: number): number {
  if (delta <= 30) return HARMONY.analogous;
  if (delta >= 150) return HARMONY.complementary;
  if (delta >= 110) return HARMONY.split;
  return HARMONY.awkward;
}

export function isEcho(a: ColorPoint, b: ColorPoint): boolean {
  return deltaE(a.lab, b.lab) < ECHO_DE;
}

export function isNearMiss(a: ColorPoint, b: ColorPoint): boolean {
  if (Math.abs(a.lab.L - b.lab.L) >= NEAR_MISS_DL || isEcho(a, b)) return false;
  if (a.lab.L < NEAR_MISS_DARK_L && b.lab.L < NEAR_MISS_DARK_L) return true;
  if (a.lch.C < NEAR_MISS_LOW_C && b.lch.C < NEAR_MISS_LOW_C) return true;
  return a.lch.C >= CHROMATIC_C && b.lch.C >= CHROMATIC_C && hueDelta(a.lch.h, b.lch.h) <= NEAR_MISS_HUE;
}

// Which rule applies to two colours. Precedence: echo, near miss, neutral rules, tonal, hue
// table. Tonal (same hue within 15°, ΔL ≥ 0.25) wins over analogous because it is the more
// specific rule.
export function harmonyKind(a: ColorPoint, b: ColorPoint): HarmonyKind {
  const dL = Math.abs(a.lab.L - b.lab.L);
  if (isEcho(a, b)) return "echo";
  if (isNearMiss(a, b)) return "nearMiss";
  if (a.neutral && b.neutral) return dL >= TONAL_DL ? "neutralContrast" : "neutralPair";
  if (a.neutral || b.neutral) return "neutralAccent";
  const dh = hueDelta(a.lch.h, b.lch.h);
  if (dh <= TONAL_HUE && dL >= TONAL_DL) return "tonal";
  return dh <= 30 ? "analogous" : dh >= 150 ? "complementary" : dh >= 110 ? "split" : "awkward";
}

export function colorHarmony(a: ColorPoint, b: ColorPoint): number {
  return HARMONY[harmonyKind(a, b)];
}

// Harmony of two items: share weighted mean over every colour pair of their palettes.
export function itemHarmony(a: ColorPoint[], b: ColorPoint[]): number {
  let sum = 0;
  let weight = 0;
  for (const ca of a)
    for (const cb of b) {
      const w = ca.share * cb.share;
      sum += w * colorHarmony(ca, cb);
      weight += w;
    }
  return weight > 0 ? sum / weight : HARMONY.neutralPair;
}

// Does any colour of `b` repeat a colour of `a`? Returns the echoed colour of `a`, if any.
export function echoOf(a: ColorPoint[], b: ColorPoint[]): ColorPoint | undefined {
  for (const ca of a) for (const cb of b) if (isEcho(ca, cb)) return ca;
  return undefined;
}

/* Patterns */

// Bold patterns: anything but solid and texture. Two bold patterns in one outfit clash (8.2).
export function isBoldPattern(p: Pattern): boolean {
  return p !== "solid" && p !== "texture";
}

/* Outfit colour score */

export interface ColorPiece {
  palette: ColorPoint[];
  neutral: boolean; // item level
  bold: boolean; // bold pattern
  isShoes: boolean;
}

export const COLOR_ADJUST = {
  oneAccent: 0.1, // exactly one non-neutral accent, the rest neutral
  extraAccent: -0.15, // per non-neutral piece beyond 2
  patternClash: -0.2, // two or more bold patterns
  patternEcho: 0.05, // one pattern, other pieces pick their colours from it
  shoesOffPalette: -0.3, // colourful shoes that echo nothing else in the outfit (owner rule, M5)
} as const;

export interface ColorBreakdown {
  score: number; // S_color, 0..1
  meanHarmony: number;
  nonNeutral: number;
  boldCount: number;
  oneAccent: boolean;
  patternClash: boolean;
  patternEcho: boolean;
  shoesOffPalette: boolean;
}

// S_color over core pieces (8.2), with the colour quality rules from the owner (M5):
// share weighted harmony, near miss, pattern echo and the shoe echo rule.
// `harmonyOf(i, j)` lets the engine pass a cached item pair harmony.
export function outfitColor(
  pieces: ColorPiece[],
  harmonyOf: (i: number, j: number) => number = (i, j) => itemHarmony(pieces[i].palette, pieces[j].palette),
  echoes: (i: number, j: number) => boolean = (i, j) => echoOf(pieces[i].palette, pieces[j].palette) !== undefined,
): ColorBreakdown {
  const n = pieces.length;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      sum += harmonyOf(i, j);
      pairs++;
    }
  const meanHarmony = pairs ? sum / pairs : HARMONY.neutralPair;

  let nonNeutral = 0;
  let boldCount = 0;
  let boldIndex = -1;
  for (let i = 0; i < n; i++) {
    if (!pieces[i].neutral) nonNeutral++;
    if (pieces[i].bold) {
      boldCount++;
      boldIndex = i;
    }
  }
  const oneAccent = nonNeutral === 1 && n > 1;
  const patternClash = boldCount >= 2;

  // One pattern with solids picked from its colours: every colourful piece echoes it, and at
  // least one piece (neutral or not) repeats one of its colours.
  let patternEcho = false;
  if (boldCount === 1) {
    let anyEcho = false;
    let allColourfulEcho = true;
    for (let i = 0; i < n; i++) {
      if (i === boldIndex) continue;
      const e = echoes(boldIndex, i);
      if (e) anyEcho = true;
      if (!pieces[i].neutral && !e) allColourfulEcho = false;
    }
    patternEcho = anyEcho && allColourfulEcho;
  }

  // Shoes should be neutral or repeat a colour already in the outfit.
  let shoesOffPalette = false;
  for (let i = 0; i < n; i++) {
    if (!pieces[i].isShoes || pieces[i].neutral) continue;
    let echoed = false;
    for (let j = 0; j < n && !echoed; j++) if (j !== i && echoes(j, i)) echoed = true;
    if (!echoed) shoesOffPalette = true;
  }

  let score = meanHarmony;
  if (oneAccent) score += COLOR_ADJUST.oneAccent;
  if (nonNeutral > 2) score += COLOR_ADJUST.extraAccent * (nonNeutral - 2);
  if (patternClash) score += COLOR_ADJUST.patternClash;
  if (patternEcho) score += COLOR_ADJUST.patternEcho;
  if (shoesOffPalette) score += COLOR_ADJUST.shoesOffPalette;
  score = Math.min(1, Math.max(0, score));

  return { score, meanHarmony, nonNeutral, boldCount, oneAccent, patternClash, patternEcho, shoesOffPalette };
}

/* Colour story, for diversity between shown outfits (8.7) */

export interface ColorStory {
  accentHue: number | null; // hue of the strongest non-neutral colour, null when all neutral
  anchor: Lab; // the dominant colour of the upper piece, to tell two neutral looks apart
}

export function colorStory(pieces: ColorPiece[], upperIndex = 0): ColorStory {
  let best: ColorPoint | undefined;
  let bestWeight = 0;
  for (const p of pieces)
    for (const c of p.palette) {
      if (c.neutral) continue;
      const w = c.lch.C * c.share;
      if (w > bestWeight) {
        bestWeight = w;
        best = c;
      }
    }
  const upper = pieces[upperIndex]?.palette[0];
  return { accentHue: best ? best.lch.h : null, anchor: upper?.lab ?? { L: 0.5, a: 0, b: 0 } };
}

// Different colour story: accents at least 60° apart, accent vs all neutral, or two neutral
// looks whose main colours are clearly different.
export function differentStory(a: ColorStory, b: ColorStory): boolean {
  if (a.accentHue !== null && b.accentHue !== null) return hueDelta(a.accentHue, b.accentHue) >= 60;
  if (a.accentHue !== null || b.accentHue !== null) return true;
  return deltaE(a.anchor, b.anchor) >= 0.2;
}
