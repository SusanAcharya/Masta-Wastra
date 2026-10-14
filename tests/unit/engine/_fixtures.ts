// Test builders for the engine. Not a test file (vitest only picks up *.test.ts).
import { nearestColorName } from "@/lib/oklab";
import { buildScoreContext, scoreParts, type Parts, type ScoreInput } from "@/engine/score";
import { SUBTYPES, type Item, type ItemColor, type Subtype, type Warmth, type WeatherSnapshot } from "@/engine/types";

const DEFAULT_WARMTH: Partial<Record<Subtype, Warmth>> = {
  tshirt: 1,
  tank: 1,
  shirt: 2,
  blouse: 2,
  polo: 1,
  kurta: 2,
  sweater: 3,
  cardigan: 2,
  hoodie: 3,
  sweatshirt: 3,
  jeans: 2,
  chinos: 2,
  trousers: 2,
  joggers: 2,
  leggings: 1,
  skirt: 1,
  shorts: 1,
  dress: 2,
  jumpsuit: 2,
  saree: 2,
  coat: 4,
  jacket: 3,
  blazer: 2,
  raincoat: 2,
  puffer: 5,
  vest: 2,
  sneakers: 2,
  boots: 3,
  loafers: 2,
  heels: 1,
  flats: 1,
  sandals: 1,
  scarf: 2,
  hat: 1,
  cap: 1,
  bag: 1,
  belt: 1,
  gloves: 2,
};

export interface ItemSpec extends Partial<Omit<Item, "colors">> {
  subtype: Subtype;
  hex?: string; // single colour shortcut
  colorName?: string;
  colors?: ItemColor[];
}

let counter = 0;
export function resetIds() {
  counter = 0;
}

export function item(spec: ItemSpec): Item {
  const { hex = "#808080", colorName, colors: specColors, ...rest } = spec;
  const meta = SUBTYPES[spec.subtype];
  const colors = specColors ?? [{ hex, name: colorName ?? nearestColorName(hex), share: 1 }];
  const id = rest.id ?? `i${++counter}`;
  return {
    createdAt: "2026-10-12T08:00:00.000Z",
    updatedAt: "2026-10-12T08:00:00.000Z",
    name: `${colors[0].name} ${spec.subtype}`,
    category: meta.category,
    layer: meta.layer,
    primaryHex: colors[0].hex,
    isNeutral: false,
    pattern: "solid",
    warmth: DEFAULT_WARMTH[spec.subtype] ?? 2,
    vibes: ["casual"],
    occasions: [],
    waterproof: false,
    tagSource: "manual",
    tagStatus: "manual",
    imageId: "img",
    cutoutId: "cut",
    thumbId: "thumb",
    cutoutQuality: "auto",
    archived: false,
    ...rest,
    id,
    colors,
  };
}

export function weather(p: Partial<WeatherSnapshot> & { feelsMax: number }): WeatherSnapshot {
  return {
    fetchedAt: "2026-10-14T06:00:00.000Z",
    lat: 27.7,
    lon: 85.32,
    tempNow: p.feelsMax,
    feelsMin: p.feelsMax - 4,
    precipProb: 0,
    precipMm: 0,
    windMax: 10,
    uvMax: 3,
    code: 2,
    ...p,
  };
}

export const TODAY = "2026-10-14";

// Palette hexes used across tests (close to the 24 colour anchors).
export const HEX = {
  navy: "#1f2a44",
  black: "#1c1c1c",
  white: "#f4f3ef",
  grey: "#8e8f91",
  charcoal: "#3d3f42",
  khaki: "#a89a6e",
  camel: "#b98a56",
  beige: "#d8c7a8",
  cream: "#efe6d2",
  brown: "#6b4a32",
  denim: "#4a6a8f",
  red: "#b8312f",
  orange: "#d9722e",
  green: "#3f7a46",
  blue: "#2f5fa8",
  yellow: "#e2c13f",
  purple: "#6a4a8c",
  pink: "#e3a1b4",
  olive: "#6b6b3a",
  teal: "#2d7f7c",
} as const;

// Small deterministic PRNG for synthetic closets (tests only; the engine takes seeds).
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Scoring a hand built outfit */


export interface OutfitSpec {
  outer?: Item;
  mid?: Item;
  base: Item;
  bottom?: Item;
  shoes: Item;
  accessory?: Item;
}

export function scoreOutfit(o: OutfitSpec, input: Partial<ScoreInput> = {}) {
  const items = [o.outer, o.mid, o.base, o.bottom, o.shoes, o.accessory].filter((x): x is Item => !!x);
  const ctx = buildScoreContext({
    items: [...items, ...(input.items ?? [])],
    weather: input.weather ?? weather({ feelsMax: 18 }),
    occasion: input.occasion ?? "casual",
    localDate: input.localDate ?? TODAY,
    wears: input.wears,
    weights: input.weights,
    neverWornBoostActive: input.neverWornBoostActive,
  });
  const p = (i?: Item) => (i ? ctx.byId.get(i.id) : undefined);
  const parts: Parts = {
    outer: p(o.outer),
    mid: p(o.mid),
    base: p(o.base)!,
    bottom: p(o.bottom),
    shoes: p(o.shoes)!,
    accessory: p(o.accessory),
  };
  return { ctx, parts, ...scoreParts(ctx, parts) };
}

/* Closets */

// A small but varied closet: enough for 3 clearly different outfits on a mild day.
export function capsule(): Item[] {
  return [
    item({ id: "navy-oxford", subtype: "shirt", hex: HEX.navy, vibes: ["smart", "casual"], name: "Navy oxford shirt" }),
    item({ id: "white-tee", subtype: "tshirt", hex: HEX.white, vibes: ["casual"], name: "White tee" }),
    item({ id: "red-blouse", subtype: "blouse", hex: HEX.red, vibes: ["smart"], name: "Red blouse" }),
    item({ id: "grey-sweater", subtype: "sweater", hex: HEX.grey, vibes: ["casual"], warmth: 3, name: "Grey sweater" }),
    item({ id: "khaki-chinos", subtype: "chinos", hex: HEX.khaki, vibes: ["smart", "casual"], name: "Khaki chinos" }),
    item({ id: "jeans", subtype: "jeans", hex: HEX.denim, vibes: ["casual"], name: "Blue jeans" }),
    item({ id: "black-trousers", subtype: "trousers", hex: HEX.black, vibes: ["smart"], name: "Black trousers" }),
    item({ id: "green-dress", subtype: "dress", hex: HEX.green, vibes: ["casual", "smart"], name: "Green dress" }),
    item({ id: "white-sneakers", subtype: "sneakers", hex: HEX.white, vibes: ["casual"], name: "White sneakers" }),
    item({ id: "brown-boots", subtype: "boots", hex: HEX.brown, vibes: ["casual"], name: "Brown boots" }),
    item({ id: "black-loafers", subtype: "loafers", hex: HEX.black, vibes: ["smart"], name: "Black loafers" }),
    item({ id: "camel-jacket", subtype: "jacket", hex: HEX.camel, vibes: ["smart", "casual"], warmth: 2, name: "Camel jacket" }),
  ];
}

const SYNTH: [Subtype, number][] = [
  ["tshirt", 40],
  ["shirt", 35],
  ["blouse", 15],
  ["sweater", 20],
  ["cardigan", 10],
  ["hoodie", 10],
  ["jeans", 20],
  ["chinos", 20],
  ["trousers", 15],
  ["skirt", 10],
  ["shorts", 5],
  ["dress", 15],
  ["coat", 8],
  ["jacket", 12],
  ["blazer", 6],
  ["raincoat", 4],
  ["vest", 4],
  ["sneakers", 10],
  ["boots", 8],
  ["loafers", 6],
  ["flats", 4],
  ["sandals", 3],
  ["scarf", 6],
  ["hat", 4],
  ["bag", 8],
  ["belt", 2],
];

// A deterministic 300 item closet with mixed colours, patterns and vibes.
export function syntheticCloset(seed = 42): Item[] {
  const rnd = mulberry32(seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const hexes = Object.values(HEX);
  const patterns = ["solid", "solid", "solid", "solid", "stripe", "check", "texture", "floral", "print"] as const;
  const vibes = ["casual", "smart", "street", "sporty", "formal"] as const;
  const out: Item[] = [];
  let n = 0;
  for (const [subtype, count] of SYNTH)
    for (let i = 0; i < count; i++) {
      const a = pick(hexes);
      const b = pick(hexes);
      const two = rnd() < 0.3;
      out.push(
        item({
          id: `s${++n}`,
          subtype,
          colors: two
            ? [
                { hex: a, name: nearestColorName(a), share: 0.7 },
                { hex: b, name: nearestColorName(b), share: 0.3 },
              ]
            : [{ hex: a, name: nearestColorName(a), share: 1 }],
          pattern: pick(patterns),
          vibes: [pick(vibes), pick(vibes)].filter((v, j, arr) => arr.indexOf(v) === j),
          warmth: Math.min(5, Math.max(1, (DEFAULT_WARMTH[subtype] ?? 2) + Math.floor(rnd() * 3) - 1)) as Warmth,
          waterproof: subtype === "raincoat" || rnd() < 0.1,
          createdAt: `2026-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}T08:00:00.000Z`,
        }),
      );
    }
  return out;
}
