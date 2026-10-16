// Reading a clothes parser's label map (segformer_b2_clothes, 18 labels, see docs/DECISIONS.md).
// Pure: decides whether a person is in the photo and which garment the photo is of.
import type { Category, Subtype } from "@/engine/types";

export const LABELS = [
  "Background", "Hat", "Hair", "Sunglasses", "Upper-clothes", "Skirt", "Pants", "Dress", "Belt",
  "Left-shoe", "Right-shoe", "Face", "Left-leg", "Right-leg", "Left-arm", "Right-arm", "Bag", "Scarf",
] as const;

export const PERSON = [2, 3, 11, 12, 13, 14, 15]; // hair, sunglasses, face, legs, arms

export const GARMENTS = {
  top: { labels: [4], category: "top", subtype: "tshirt" },
  pants: { labels: [6], category: "bottom", subtype: "trousers" },
  skirt: { labels: [5], category: "bottom", subtype: "skirt" },
  dress: { labels: [7], category: "dress", subtype: "dress" },
  shoes: { labels: [9, 10], category: "shoes", subtype: "sneakers" },
  bag: { labels: [16], category: "accessory", subtype: "bag" },
  scarf: { labels: [17], category: "accessory", subtype: "scarf" },
  hat: { labels: [1], category: "accessory", subtype: "hat" },
} as const satisfies Record<string, { labels: readonly number[]; category: Category; subtype: Subtype }>;
export type GarmentGroup = keyof typeof GARMENTS;

export interface ParseReading {
  person: boolean; // face, hair, arms or legs cover at least 1% of the frame
  target?: GarmentGroup; // the garment the photo is about: the largest one
  shares: Partial<Record<GarmentGroup, number>>;
}

export function readParse(labels: Uint8Array, minPerson = 0.01): ParseReading {
  const counts = new Array(LABELS.length).fill(0);
  for (const l of labels) counts[l]++;
  const total = labels.length || 1;
  const personShare = PERSON.reduce((s, l) => s + counts[l], 0) / total;
  const shares: Partial<Record<GarmentGroup, number>> = {};
  let target: GarmentGroup | undefined;
  let best = 0;
  for (const [group, g] of Object.entries(GARMENTS) as [GarmentGroup, (typeof GARMENTS)[GarmentGroup]][]) {
    const share = g.labels.reduce((s, l) => s + counts[l], 0) / total;
    if (!share) continue;
    shares[group] = share;
    if (share > best) {
      best = share;
      target = group;
    }
  }
  return { person: personShare >= minPerson, target: best >= 0.01 ? target : undefined, shares };
}
