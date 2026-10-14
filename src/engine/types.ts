// Domain types and closed vocabularies. Pure: no DOM, no Dexie.
// Shared by the engine, the database, Gemini tagging (7.2) and manual tagging (7.4).

export const CATEGORIES = ["top", "bottom", "dress", "outer", "shoes", "accessory"] as const;
export type Category = (typeof CATEGORIES)[number];

export const PATTERNS = ["solid", "stripe", "check", "floral", "graphic", "print", "texture"] as const;
export type Pattern = (typeof PATTERNS)[number];

export const VIBES = ["casual", "smart", "formal", "sporty", "lounge", "street", "traditional"] as const;
export type Vibe = (typeof VIBES)[number];

export const OCCASIONS = ["work", "casual", "date", "formal", "workout", "travel", "home", "festival"] as const;
export type Occasion = (typeof OCCASIONS)[number];

export type Warmth = 1 | 2 | 3 | 4 | 5; // 1 very light (linen tee) to 5 heavy (down coat)
export type Layer = 0 | 1 | 2; // 0 base, 1 mid (sweater, cardigan), 2 outer (coat)

// Closed subtype list. Each subtype knows its category and default layer, so a manual
// tag needs one tap and Gemini output can be checked for consistency.
export const SUBTYPES = {
  tshirt: { category: "top", layer: 0 },
  shirt: { category: "top", layer: 0 },
  blouse: { category: "top", layer: 0 },
  polo: { category: "top", layer: 0 },
  tank: { category: "top", layer: 0 },
  kurta: { category: "top", layer: 0 },
  sweater: { category: "top", layer: 1 },
  cardigan: { category: "top", layer: 1 },
  hoodie: { category: "top", layer: 1 },
  sweatshirt: { category: "top", layer: 1 },
  jeans: { category: "bottom", layer: 0 },
  chinos: { category: "bottom", layer: 0 },
  trousers: { category: "bottom", layer: 0 },
  joggers: { category: "bottom", layer: 0 },
  leggings: { category: "bottom", layer: 0 },
  skirt: { category: "bottom", layer: 0 },
  shorts: { category: "bottom", layer: 0 },
  dress: { category: "dress", layer: 0 },
  jumpsuit: { category: "dress", layer: 0 },
  saree: { category: "dress", layer: 0 },
  coat: { category: "outer", layer: 2 },
  jacket: { category: "outer", layer: 2 },
  blazer: { category: "outer", layer: 2 },
  raincoat: { category: "outer", layer: 2 },
  puffer: { category: "outer", layer: 2 },
  vest: { category: "outer", layer: 1 },
  sneakers: { category: "shoes", layer: 0 },
  boots: { category: "shoes", layer: 0 },
  loafers: { category: "shoes", layer: 0 },
  heels: { category: "shoes", layer: 0 },
  flats: { category: "shoes", layer: 0 },
  sandals: { category: "shoes", layer: 0 },
  scarf: { category: "accessory", layer: 0 },
  hat: { category: "accessory", layer: 0 },
  cap: { category: "accessory", layer: 0 },
  bag: { category: "accessory", layer: 0 },
  belt: { category: "accessory", layer: 0 },
  gloves: { category: "accessory", layer: 0 },
} as const satisfies Record<string, { category: Category; layer: Layer }>;
export type Subtype = keyof typeof SUBTYPES;
export const SUBTYPE_IDS = Object.keys(SUBTYPES) as Subtype[];

// The 24 colour names Gemini may use (7.2). Hex anchors let the client name a measured
// colour without AI (nearest anchor in OKLab) and draw swatches.
export const COLOR_NAMES = {
  black: "#1c1c1c",
  charcoal: "#3d3f42",
  grey: "#8e8f91",
  white: "#f4f3ef",
  cream: "#efe6d2",
  beige: "#d8c7a8",
  camel: "#b98a56",
  khaki: "#a89a6e",
  brown: "#6b4a32",
  navy: "#1f2a44",
  blue: "#2f5fa8",
  "light blue": "#9cc1e3",
  denim: "#4a6a8f",
  teal: "#2d7f7c",
  green: "#3f7a46",
  olive: "#6b6b3a",
  yellow: "#e2c13f",
  orange: "#d9722e",
  red: "#b8312f",
  burgundy: "#6d1f2c",
  pink: "#e3a1b4",
  purple: "#6a4a8c",
  lavender: "#b9a6d8",
  gold: "#c9a54a",
} as const;
export type ColorName = keyof typeof COLOR_NAMES;
export const COLOR_NAME_IDS = Object.keys(COLOR_NAMES) as ColorName[];

export interface ItemColor {
  hex: string;
  name: string;
  share: number; // 0..1, shares of one item sum to 1
}

export interface Item {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string; // "Navy oxford shirt", editable
  category: Category;
  subtype: Subtype;
  layer: Layer;
  colors: ItemColor[]; // 1 to 3
  primaryHex: string; // colors[0].hex, indexed
  isNeutral: boolean; // derived from OKLCH chroma (8.2), user can override
  neutralOverride?: boolean; // true when the user set isNeutral by hand
  pattern: Pattern;
  warmth: Warmth;
  vibes: Vibe[]; // 1 to 3
  occasions: Occasion[]; // derived from vibes, editable
  waterproof: boolean;
  tagSource: "ai" | "manual" | "ai-edited";
  tagStatus: "pending" | "queued" | "done" | "failed" | "manual";
  tagCheck?: boolean; // "Check these": low confidence or not clothing (7.2)
  aiRaw?: unknown; // last Gemini JSON, stripped on export unless asked
  imageId: string;
  cutoutId: string;
  thumbId: string;
  cutoutQuality: "auto" | "manual"; // 6.5: manual = soft rectangular crop fallback
  archived: boolean; // "Retired" items stay in history
  price?: number; // optional, for cost per wear (10.3)
  notes?: string;
}

export interface Outfit {
  id: string;
  itemIds: string[]; // ordered: outer, top/dress, bottom, shoes, accessories
  signature: string; // sorted itemIds joined, for repeat detection
  createdAt: string;
  source: "deal" | "manual";
  score?: number;
  breakdown?: Record<string, number>;
  reason?: string;
}

export interface WeatherSnapshot {
  fetchedAt: string;
  lat: number;
  lon: number;
  tempNow: number;
  feelsMin: number;
  feelsMax: number;
  precipProb: number;
  precipMm: number;
  windMax: number;
  uvMax: number;
  code: number;
  manual?: boolean; // quick pick when offline (8.1)
}

export interface DealDay {
  localDate: string; // PK, YYYY-MM-DD in the device zone
  occasion: Occasion;
  weather: WeatherSnapshot;
  outfitIds: string[]; // up to 3; fewer when the closet is small
  shownOutfitIds: string[]; // every outfit dealt today, so "Deal again" never repeats one
  seed: number;
  pickedOutfitId?: string;
  reshuffles: number; // max 3 per day
}

export interface Wear {
  id: string;
  localDate: string;
  outfitId: string;
  itemIds: string[];
  at: string;
}

export const FEATURE_KEYS = [
  "color",
  "warmthFit",
  "layerFit",
  "occasionFit",
  "freshness",
  "rainFit",
  "neverWornBoost",
  "patternBalance",
  "vibeCohesion",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureVector = Record<FeatureKey, number>;

export type Signal = "up" | "down" | "skip" | "wear" | "more";

export interface Feedback {
  id: string;
  outfitId: string;
  at: string;
  signal: Signal;
  features: FeatureVector;
  dealMean?: FeatureVector; // mean features of that deal, for centred updates (8.6)
}

export interface Weights {
  id: "current";
  version: number;
  w: FeatureVector;
  itemAffinity: Record<string, number>;
  pairAffinity: Record<string, number>;
  signals: number; // n, total signals, for the decaying learning rate
  decayedAt?: string; // last weekly affinity decay
  updatedAt: string;
}

// Default weights from 8.4. rainFit is 1.5 only on rain days; the engine applies that.
export const DEFAULT_WEIGHTS: FeatureVector = {
  color: 3.0,
  warmthFit: 3.0,
  layerFit: 1.5,
  occasionFit: 2.0,
  freshness: 2.0,
  rainFit: 1.5,
  neverWornBoost: 0.6,
  patternBalance: 1.0,
  vibeCohesion: 1.0,
};
