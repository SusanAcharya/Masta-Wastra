"use client";

// Re-cut pieces with the current pipeline (clothes parser + clean up), from the original photo
// when it was kept. Tags stay; colours are re-measured; a name that began with the old main
// colour ("Olive loafers") gets the new one. No Gemini call (prompt rule 4: once per item).
import { getDb, type MastaDB } from "@/db/schema";
import type { Item } from "@/engine/types";
import { CUT_VERSION } from "./capture";
import { canvasToBlob, decode, fitWithin, makeCanvas } from "./image";
import { hexToOklch } from "./oklab";
import { cutout } from "@/workers/cutout-client";

export const needsRecut = (i: Item) => !i.archived && i.cutoutQuality !== "manual" && (i.cutVersion ?? 1) < CUT_VERSION;

// The best source we have: the original photo, else the old cutout flattened onto white
// (the parser needs the scene; a transparent cutout would read as a black background).
async function sourceOf(db: MastaDB, item: Item): Promise<Blob | undefined> {
  if (item.imageId !== item.cutoutId) {
    const original = await db.images.get(item.imageId);
    if (original) return original.blob;
  }
  const cut = await db.images.get(item.cutoutId);
  if (!cut) return undefined;
  const bmp = await decode(cut.blob);
  const { w, h } = fitWithin(bmp.width, bmp.height, 1024);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return canvasToBlob(canvas, "image/jpeg", 0.9);
}

async function workSize(blob: Blob): Promise<Blob> {
  const bmp = await decode(blob);
  try {
    const { w, h } = fitWithin(bmp.width, bmp.height, 1024);
    const canvas = makeCanvas(w, h);
    (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(bmp, 0, 0, w, h);
    return canvasToBlob(canvas, "image/jpeg", 0.9);
  } finally {
    bmp.close();
  }
}

export function renameColour(name: string, oldMain: string | undefined, newMain: string | undefined): string {
  if (!oldMain || !newMain || oldMain === newMain) return name;
  const re = new RegExp(`^${oldMain}\\b`, "i");
  if (!re.test(name)) return name;
  const next = name.replace(re, newMain);
  return next.charAt(0).toUpperCase() + next.slice(1);
}

export async function recutItem(item: Item, model: "isnet_quint8" | "isnet_fp16"): Promise<boolean> {
  const db = getDb();
  const src = await sourceOf(db, item);
  if (!src) return false;
  const r = await cutout(await workSize(src), model);
  if (r.coverage < 0.01) return false; // nothing usable: keep the old cutout
  await db.transaction("rw", db.images, db.items, async () => {
    const old = await db.items.get(item.id);
    if (!old) return;
    await db.images.put({ id: old.cutoutId, kind: "cutout", ...r.cutout });
    await db.images.put({ id: old.thumbId, kind: "thumb", ...r.thumb });
    const colors = r.colors.length ? r.colors : old.colors;
    await db.items.put({
      ...old,
      colors,
      primaryHex: colors[0].hex,
      isNeutral: old.neutralOverride ? old.isNeutral : hexToOklch(colors[0].hex).C < 0.04,
      name: renameColour(old.name, old.colors[0]?.name, colors[0]?.name),
      cutVersion: CUT_VERSION,
      updatedAt: new Date().toISOString(),
    });
  });
  return true;
}
