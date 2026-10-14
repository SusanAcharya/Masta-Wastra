/// <reference lib="webworker" />
// Background removal and post-processing, off the main thread (6.1 steps 3 and 4).
import { extractColors, opaqueShare, trimBounds } from "@/lib/colors";
import { fitWithin } from "@/lib/image";
import { imgly } from "./engines/imgly";
import type { CutoutResult, WorkerRequest, WorkerResponse } from "./protocol";

const post = (msg: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

async function encode(canvas: OffscreenCanvas, quality: number) {
  let blob = await canvas.convertToBlob({ type: "image/webp", quality });
  // Safari's OffscreenCanvas does not encode WebP and silently returns PNG: keep it, alpha intact.
  if (blob.type !== "image/webp") blob = await canvas.convertToBlob({ type: "image/png" });
  return { blob, w: canvas.width, h: canvas.height, mime: blob.type };
}

async function cutout(req: Extract<WorkerRequest, { type: "cutout" }>): Promise<CutoutResult> {
  const started = performance.now();
  const onProgress = (key: string, current: number, total: number) =>
    post({ type: "progress", id: req.id, key, current, total });
  const matte = await imgly.removeBackground(req.photo, { model: req.model, device: req.device, onProgress });

  const bitmap = await createImageBitmap(matte);
  const full = new OffscreenCanvas(bitmap.width, bitmap.height);
  const fctx = full.getContext("2d")!;
  fctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const px = fctx.getImageData(0, 0, full.width, full.height);
  const coverage = opaqueShare(px);
  const box = trimBounds(px);

  const trimmed = new OffscreenCanvas(box.w, box.h);
  trimmed.getContext("2d")!.drawImage(full, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  const tpx = trimmed.getContext("2d")!.getImageData(0, 0, box.w, box.h);
  const colors = extractColors(tpx);

  const size = fitWithin(box.w, box.h, 320);
  const thumbCanvas = new OffscreenCanvas(size.w, size.h);
  const tctx = thumbCanvas.getContext("2d")!;
  tctx.imageSmoothingQuality = "high";
  tctx.drawImage(trimmed, 0, 0, size.w, size.h);

  return {
    cutout: await encode(trimmed, 0.85),
    thumb: await encode(thumbCanvas, 0.8),
    colors,
    coverage,
    ms: Math.round(performance.now() - started),
  };
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === "preload") {
      await imgly.preload({
        model: req.model,
        device: req.device,
        onProgress: (key, current, total) => post({ type: "progress", id: req.id, key, current, total }),
      });
      post({ type: "done", id: req.id });
    } else {
      post({ type: "done", id: req.id, result: await cutout(req) });
    }
  } catch (err) {
    post({ type: "error", id: req.id, message: err instanceof Error ? err.message : String(err) });
  }
};
