// Human labels and sensible defaults for the closed vocabularies in engine/types.ts.
// Manual tagging (7.4) starts from these defaults, so most pieces take two taps.
import {
  SUBTYPES,
  type Category,
  type ItemColor,
  type Occasion,
  type Pattern,
  type Subtype,
  type Vibe,
  type Warmth,
} from "@/engine/types";

export const CATEGORY_LABELS: Record<Category, string> = {
  top: "Top",
  bottom: "Bottom",
  dress: "Dress",
  outer: "Outerwear",
  shoes: "Shoes",
  accessory: "Accessory",
};

export const SUBTYPE_LABELS: Record<Subtype, string> = {
  tshirt: "T-shirt",
  shirt: "Shirt",
  blouse: "Blouse",
  polo: "Polo",
  tank: "Tank top",
  kurta: "Kurta",
  sweater: "Sweater",
  cardigan: "Cardigan",
  hoodie: "Hoodie",
  sweatshirt: "Sweatshirt",
  jeans: "Jeans",
  chinos: "Chinos",
  trousers: "Trousers",
  joggers: "Joggers",
  leggings: "Leggings",
  skirt: "Skirt",
  shorts: "Shorts",
  dress: "Dress",
  jumpsuit: "Jumpsuit",
  saree: "Saree",
  coat: "Coat",
  jacket: "Jacket",
  blazer: "Blazer",
  raincoat: "Raincoat",
  puffer: "Puffer",
  vest: "Vest",
  sneakers: "Sneakers",
  boots: "Boots",
  loafers: "Loafers",
  heels: "Heels",
  flats: "Flats",
  sandals: "Sandals",
  scarf: "Scarf",
  hat: "Hat",
  cap: "Cap",
  bag: "Bag",
  belt: "Belt",
  gloves: "Gloves",
};

export const PATTERN_LABELS: Record<Pattern, string> = {
  solid: "Plain",
  stripe: "Stripes",
  check: "Check",
  floral: "Floral",
  graphic: "Graphic",
  print: "Print",
  texture: "Textured",
};

export const VIBE_LABELS: Record<Vibe, string> = {
  casual: "Casual",
  smart: "Smart",
  formal: "Formal",
  sporty: "Sporty",
  lounge: "Lounge",
  street: "Street",
  traditional: "Traditional",
};

export const OCCASION_LABELS: Record<Occasion, string> = {
  work: "Work",
  casual: "Casual",
  date: "Date",
  formal: "Formal",
  workout: "Workout",
  travel: "Travel",
  home: "Home",
  festival: "Festival",
};

// Prompt 10.4: five labelled stops.
export const WARMTH_LABELS: Record<Warmth, string> = { 1: "Feather", 2: "Light", 3: "Mid", 4: "Warm", 5: "Heavy" };

export function subtypesOf(category: Category): Subtype[] {
  return (Object.keys(SUBTYPES) as Subtype[]).filter((s) => SUBTYPES[s].category === category);
}

const WARMTH: Partial<Record<Subtype, Warmth>> = {
  tank: 1,
  tshirt: 2,
  polo: 2,
  blouse: 2,
  shirt: 2,
  kurta: 2,
  shorts: 1,
  skirt: 2,
  leggings: 2,
  dress: 2,
  saree: 2,
  jeans: 3,
  chinos: 3,
  trousers: 3,
  joggers: 3,
  jumpsuit: 3,
  sweater: 3,
  cardigan: 3,
  hoodie: 3,
  sweatshirt: 3,
  vest: 2,
  blazer: 3,
  jacket: 3,
  raincoat: 2,
  coat: 4,
  puffer: 5,
  sandals: 1,
  flats: 2,
  heels: 2,
  sneakers: 2,
  loafers: 2,
  boots: 4,
  scarf: 3,
  gloves: 3,
};

export const defaultWarmth = (s: Subtype): Warmth => WARMTH[s] ?? 2;

const VIBES: Partial<Record<Subtype, Vibe[]>> = {
  shirt: ["smart"],
  blouse: ["smart"],
  polo: ["casual"],
  kurta: ["traditional"],
  saree: ["traditional"],
  blazer: ["smart"],
  trousers: ["smart"],
  chinos: ["smart", "casual"],
  loafers: ["smart"],
  heels: ["formal"],
  joggers: ["sporty"],
  leggings: ["sporty"],
  hoodie: ["casual", "street"],
  sweatshirt: ["casual"],
  sneakers: ["casual"],
};

export const defaultVibes = (s: Subtype): Vibe[] => VIBES[s] ?? ["casual"];

export const defaultWaterproof = (s: Subtype) => s === "raincoat" || s === "boots";

// One table for manual and AI tags: it lives with the /api/tag contract.
export { occasionsFromVibes } from "./tag-api";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "Navy shirt", "Navy and white shirt": colour first, plain words (7.2).
export function itemName(colors: ItemColor[], subtype: Subtype): string {
  const main = colors[0]?.name;
  const second = colors[1] && colors[1].share >= 0.25 ? colors[1].name : undefined;
  const kind = SUBTYPE_LABELS[subtype].toLowerCase();
  if (!main) return cap(kind);
  return cap(second && second !== main ? `${main} and ${second} ${kind}` : `${main} ${kind}`);
}

// "Navy oxford shirt, navy and white" (12: cutout alt text).
export function itemAlt(name: string, colors: ItemColor[]): string {
  const names = [...new Set(colors.map((c) => c.name))];
  if (!names.length) return name;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${name}, ${list}`;
}
