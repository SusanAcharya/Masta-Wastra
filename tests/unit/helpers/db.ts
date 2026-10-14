import type { NewItem } from "@/db/repo";
import { MastaDB } from "@/db/schema";

// Each test gets its own database, so tests never see each other's rows.
export function freshDb() {
  return new MastaDB(`test-${crypto.randomUUID()}`);
}

export function newItem(overrides: Partial<NewItem> = {}): NewItem {
  return {
    name: "Navy oxford shirt",
    category: "top",
    subtype: "shirt",
    layer: 0,
    colors: [
      { hex: "#1f2a44", name: "navy", share: 0.8 },
      { hex: "#f4f3ef", name: "white", share: 0.2 },
    ],
    isNeutral: true,
    pattern: "solid",
    warmth: 2,
    vibes: ["smart"],
    occasions: ["work", "casual"],
    waterproof: false,
    tagSource: "manual",
    tagStatus: "manual",
    cutoutQuality: "auto",
    archived: false,
    ...overrides,
  };
}

export function image(bytes: number[], mime = "image/webp", w = 1024, h = 1024) {
  return { blob: new Blob([new Uint8Array(bytes)], { type: mime }), w, h, mime };
}

export const images = (seed = 1) => ({
  original: image([seed, 1, 1, 1], "image/jpeg", 1600, 1200),
  cutout: image([seed, 2, 2, 2]),
  thumb: image([seed, 3, 3], "image/webp", 320, 320),
});
