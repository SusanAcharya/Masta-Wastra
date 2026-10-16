"use client";

// One photo to one closet-ready set of images (6.1, 6.5). The cutout runs in the worker;
// when it cannot (no model, old browser, out of memory) the user crops by hand instead.
import type { NewImage } from "@/db/repo";
import type { ItemColor } from "@/engine/types";
import { cutout } from "@/workers/cutout-client";
import { extractColors } from "./colors";
import { canvasToBlob, decode, fitWithin, makeCanvas, preparePhoto, type Encoded } from "./image";
import type { GarmentGroup } from "./parsing";

// Bumped when the cutout pipeline improves, so older pieces can be offered a re-cut.
export const CUT_VERSION = 2;

export interface Captured {
  images: { original?: NewImage; cutout: NewImage; thumb: NewImage };
  colors: ItemColor[];
  quality: "auto" | "manual";
  coverage?: number;
  detected?: GarmentGroup; // what the clothes parser saw
  ms?: number;
}

export interface Prepared {
  work: Encoded; // 1024px JPEG, what the cutout and the crop work from
  original?: Encoded;
  photoUrl: string; // object URL of `work`, for the viewfinder and the Lift
}

export async function prepare(file: Blob, keepOriginal: boolean): Promise<Prepared> {
  const { work, original } = await preparePhoto(file, keepOriginal);
  return { work, original, photoUrl: URL.createObjectURL(work.blob) };
}

export async function autoCutout(
  p: Prepared,
  model: "isnet_quint8" | "isnet_fp16",
  onProgress?: (key: string, current: number, total: number) => void,
): Promise<Captured> {
  const r = await cutout(p.work.blob, model, onProgress);
  return {
    images: { original: p.original, cutout: r.cutout, thumb: r.thumb },
    colors: r.colors,
    quality: "auto",
    coverage: r.coverage,
    detected: r.detected,
    ms: r.ms,
  };
}

// 6.5: a cutout under 5% or over 97% of the frame did not cut cleanly.
export const cleanCut = (coverage: number) => coverage >= 0.05 && coverage <= 0.97;

export interface CropRect {
  x: number; // 0..1 of width
  y: number;
  w: number;
  h: number;
}

// The soft rectangular fallback (6.5): the photo cropped as is, background included.
// Colours are read from the centre 60% of the crop, where the garment is.
export async function manualCrop(p: Prepared, rect: CropRect): Promise<Captured> {
  const bitmap = await decode(p.work.blob);
  try {
    const sx = Math.round(rect.x * bitmap.width);
    const sy = Math.round(rect.y * bitmap.height);
    const sw = Math.max(16, Math.round(rect.w * bitmap.width));
    const sh = Math.max(16, Math.round(rect.h * bitmap.height));
    const out = makeCanvas(sw, sh);
    const ctx = out.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    const px = ctx.getImageData(0, 0, sw, sh);
    const colors = extractColors(px, {
      region: { x: Math.round(sw * 0.2), y: Math.round(sh * 0.2), w: Math.round(sw * 0.6), h: Math.round(sh * 0.6) },
    });
    const cut = await canvasToBlob(out, "image/jpeg", 0.85);
    const t = fitWithin(sw, sh, 320);
    const thumbCanvas = makeCanvas(t.w, t.h);
    (thumbCanvas.getContext("2d") as CanvasRenderingContext2D).drawImage(out as CanvasImageSource, 0, 0, t.w, t.h);
    const thumb = await canvasToBlob(thumbCanvas, "image/jpeg", 0.8);
    return {
      images: {
        original: p.original,
        cutout: { blob: cut, w: sw, h: sh, mime: cut.type || "image/jpeg" },
        thumb: { blob: thumb, w: t.w, h: t.h, mime: thumb.type || "image/jpeg" },
      },
      colors,
      quality: "manual",
    };
  } finally {
    bitmap.close();
  }
}
