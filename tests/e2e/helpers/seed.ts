import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

const CUTOUTS = join(__dirname, "..", "..", "fixtures", "cutouts");

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
  file?: string; // a transparent PNG in tests/fixtures/cutouts; else a flat colour block
}

export const CAPSULE: SeedPiece[] = [
  { file: "navy-shirt", name: "Navy oxford shirt", category: "top", subtype: "shirt", layer: 0, hex: "#1f2a44", colour: "navy", warmth: 2, vibes: ["smart"] },
  { file: "white-tee", name: "White t-shirt", category: "top", subtype: "tshirt", layer: 0, hex: "#f4f3ef", colour: "white", warmth: 2 },
  { file: "burgundy-sweater", name: "Burgundy sweater", category: "top", subtype: "sweater", layer: 1, hex: "#6d1f2c", colour: "burgundy", warmth: 3 },
  { file: "khaki-chinos", name: "Khaki chinos", category: "bottom", subtype: "chinos", layer: 0, hex: "#a89a6e", colour: "khaki", warmth: 3, vibes: ["smart", "casual"] },
  { file: "denim-jeans", name: "Denim jeans", category: "bottom", subtype: "jeans", layer: 0, hex: "#4a6a8f", colour: "denim", warmth: 3 },
  { file: "black-skirt", name: "Black skirt", category: "bottom", subtype: "skirt", layer: 0, hex: "#1c1c1c", colour: "black", warmth: 2, vibes: ["smart"] },
  { file: "white-sneakers", name: "White sneakers", category: "shoes", subtype: "sneakers", layer: 0, hex: "#f4f3ef", colour: "white", warmth: 2 },
  { file: "brown-loafers", name: "Brown boots", category: "shoes", subtype: "boots", layer: 0, hex: "#6b4a32", colour: "brown", warmth: 4, waterproof: true },
  { file: "camel-coat", name: "Camel coat", category: "outer", subtype: "coat", layer: 2, hex: "#b98a56", colour: "camel", warmth: 4, vibes: ["smart"] },
  { file: "olive-raincoat", name: "Olive raincoat", category: "outer", subtype: "raincoat", layer: 2, hex: "#6b6b3a", colour: "olive", warmth: 2, waterproof: true },
];

export async function seedCloset(page: Page, pieces: SeedPiece[] = CAPSULE) {
  await page.goto("/today");
  const withFiles = pieces.map((p) => ({ ...p, png: p.file ? readFileSync(join(CUTOUTS, `${p.file}.png`)).toString("base64") : undefined }));
  await page.evaluate(async (list) => {
    const fromBase64 = async (b64: string) => {
      const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "image/png" });
      const bmp = await createImageBitmap(blob);
      return { blob, w: bmp.width, h: bmp.height };
    };
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
        images: p.png
          ? await (async () => {
              const f = await fromBase64(p.png!);
              return [
                { id: cutoutId, kind: "cutout", blob: f.blob, w: f.w, h: f.h, mime: "image/png" },
                { id: thumbId, kind: "thumb", blob: f.blob, w: f.w, h: f.h, mime: "image/png" },
              ];
            })()
          : [
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
      get.onsuccess = () => s.put({ ...(get.result ?? { id: "me" }), introSeenAt: now.toISOString(), aiConsent: true, modelReady: true, figure: "female" });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  }, withFiles);
  await page.reload();
}
