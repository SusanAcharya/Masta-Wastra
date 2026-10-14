import type { Page } from "@playwright/test";

// A small recognised closet written straight into IndexedDB, so Pick, Closet and History can be
// tested in seconds without running 15 real cutouts. Images are flat colour PNGs drawn in page.
export interface SeedPiece {
  name: string;
  category: string;
  subtype: string;
  layer: 0 | 1 | 2;
  hex: string;
  colour: string;
  warmth: number;
  vibes?: string[];
  occasions?: string[];
  waterproof?: boolean;
  pattern?: string;
}

export const CAPSULE: SeedPiece[] = [
  { name: "Navy oxford shirt", category: "top", subtype: "shirt", layer: 0, hex: "#1f2a44", colour: "navy", warmth: 2, vibes: ["smart"] },
  { name: "White t-shirt", category: "top", subtype: "tshirt", layer: 0, hex: "#f4f3ef", colour: "white", warmth: 2 },
  { name: "Burgundy sweater", category: "top", subtype: "sweater", layer: 1, hex: "#6d1f2c", colour: "burgundy", warmth: 3 },
  { name: "Khaki chinos", category: "bottom", subtype: "chinos", layer: 0, hex: "#a89a6e", colour: "khaki", warmth: 3, vibes: ["smart", "casual"] },
  { name: "Denim jeans", category: "bottom", subtype: "jeans", layer: 0, hex: "#4a6a8f", colour: "denim", warmth: 3 },
  { name: "Black skirt", category: "bottom", subtype: "skirt", layer: 0, hex: "#1c1c1c", colour: "black", warmth: 2, vibes: ["smart"] },
  { name: "White sneakers", category: "shoes", subtype: "sneakers", layer: 0, hex: "#f4f3ef", colour: "white", warmth: 2 },
  { name: "Brown boots", category: "shoes", subtype: "boots", layer: 0, hex: "#6b4a32", colour: "brown", warmth: 4, waterproof: true },
  { name: "Camel coat", category: "outer", subtype: "coat", layer: 2, hex: "#b98a56", colour: "camel", warmth: 4, vibes: ["smart"] },
  { name: "Olive raincoat", category: "outer", subtype: "raincoat", layer: 2, hex: "#6b6b3a", colour: "olive", warmth: 2, waterproof: true },
];

export async function seedCloset(page: Page, pieces: SeedPiece[] = CAPSULE) {
  await page.goto("/today");
  await page.evaluate(async (list) => {
    const png = async (hex: string, w: number, h: number) => {
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext("2d")!;
      g.fillStyle = hex;
      g.fillRect(w * 0.15, h * 0.1, w * 0.7, h * 0.8);
      return c.convertToBlob({ type: "image/png" });
    };
    const open = indexedDB.open("masta-wastra");
    const db: IDBDatabase = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result);
      open.onerror = () => rej(open.error);
    });
    const now = new Date();
    const rows: { item: Record<string, unknown>; images: Record<string, unknown>[] }[] = [];
    for (const [i, p] of list.entries()) {
      const id = crypto.randomUUID();
      const cutoutId = crypto.randomUUID();
      const thumbId = crypto.randomUUID();
      const created = new Date(now.getTime() - (30 - i) * 86_400_000).toISOString();
      rows.push({
        item: {
          id, createdAt: created, updatedAt: created, name: p.name, category: p.category, subtype: p.subtype, layer: p.layer,
          colors: [{ hex: p.hex, name: p.colour, share: 1 }], primaryHex: p.hex, isNeutral: true,
          pattern: p.pattern ?? "solid", warmth: p.warmth, vibes: p.vibes ?? ["casual"],
          occasions: p.occasions ?? ["casual", "work", "date", "travel", "home"], waterproof: p.waterproof ?? false,
          tagSource: "ai", tagStatus: "done", imageId: cutoutId, cutoutId, thumbId, cutoutQuality: "auto", archived: false,
        },
        images: [
          { id: cutoutId, kind: "cutout", blob: await png(p.hex, 400, 500), w: 400, h: 500, mime: "image/png" },
          { id: thumbId, kind: "thumb", blob: await png(p.hex, 160, 200), w: 160, h: 200, mime: "image/png" },
        ],
      });
    }
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(["items", "images", "settings"], "readwrite");
      for (const r of rows) {
        tx.objectStore("items").put(r.item);
        for (const im of r.images) tx.objectStore("images").put(im);
      }
      const s = tx.objectStore("settings");
      const get = s.get("me");
      get.onsuccess = () => s.put({ ...(get.result ?? { id: "me" }), introSeenAt: now.toISOString(), aiConsent: true, modelReady: true });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  }, pieces);
  await page.reload();
}
