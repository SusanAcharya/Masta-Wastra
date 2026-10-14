// Main thread image helpers (6.1 step 2, 7.1 step 3). Decode honours EXIF orientation,
// resize uses OffscreenCanvas when there is one, else a detached canvas.

export interface Encoded {
  blob: Blob;
  w: number;
  h: number;
  mime: string;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function canvasToBlob(canvas: AnyCanvas, type: string, quality?: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), type, quality),
  );
}

export function fitWithin(w: number, h: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

export async function decode(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

export async function resizeBitmap(bitmap: ImageBitmap, maxEdge: number, type = "image/jpeg", quality = 0.82): Promise<Encoded> {
  const { w, h } = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await canvasToBlob(canvas, type, quality);
  return { blob, w, h, mime: blob.type || type };
}

// The two sizes a photo needs: 1024px for the cutout, 1600px original only if kept.
export async function preparePhoto(file: Blob, keepOriginal: boolean) {
  const bitmap = await decode(file);
  try {
    const work = await resizeBitmap(bitmap, 1024, "image/jpeg", 0.9);
    const original = keepOriginal ? await resizeBitmap(bitmap, 1600, "image/jpeg", 0.82) : undefined;
    return { work, original };
  } finally {
    bitmap.close();
  }
}

// What Gemini sees (7.1 step 3): the cutout on mid grey, 512px long edge, WebP q0.7.
// Grey, because transparent pixels confuse colour reading.
export async function taggingImage(cutout: Blob): Promise<string> {
  const bitmap = await createImageBitmap(cutout);
  try {
    const { w, h } = fitWithin(bitmap.width, bitmap.height, 512);
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    let blob = await canvasToBlob(canvas, "image/webp", 0.7);
    if (blob.type !== "image/webp") blob = await canvasToBlob(canvas, "image/jpeg", 0.75); // Safari
    return blobToBase64(blob);
  } finally {
    bitmap.close();
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
