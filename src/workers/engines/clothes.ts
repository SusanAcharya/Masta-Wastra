// Clothes parser (segformer_b2_clothes, int8 ONNX, about 29 MB): which pixels are which garment,
// and which are the person wearing it. Runs in the cutout worker on onnxruntime-web 1.21.0, the
// same version IMG.LY uses; its WASM is self-hosted under /ort/ (scripts/build-sw.mjs copies it).
import * as ort from "onnxruntime-web";

export const CLOTHES_MODEL_URL = "https://huggingface.co/Xenova/segformer_b2_clothes/resolve/main/onnx/model_quantized.onnx";
export const CLOTHES_MODEL_BYTES = 28_837_959;
const SIZE = 512; // the model's input (preprocessor_config.json)
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let session: Promise<ort.InferenceSession> | undefined;

async function download(onProgress?: (current: number, total: number) => void): Promise<Uint8Array> {
  const res = await fetch(CLOTHES_MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`clothes model ${res.status}`);
  const total = Number(res.headers.get("content-length")) || CLOTHES_MODEL_BYTES;
  const reader = res.body.getReader();
  const out = new Uint8Array(total);
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (got + value.length > out.length) throw new Error("clothes model larger than expected");
    out.set(value, got);
    got += value.length;
    onProgress?.(got, total);
  }
  return out.subarray(0, got);
}

export function loadClothes(onProgress?: (current: number, total: number) => void) {
  session ??= (async () => {
    // Harmless when IMG.LY already started the runtime: it is the same version and files.
    ort.env.wasm.wasmPaths = "/ort/";
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    const bytes = await download(onProgress);
    return ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  })().catch((e) => {
    session = undefined;
    throw e;
  });
  return session;
}

// Label per pixel at the model's output resolution (a quarter of 512, so 128 x 128).
export async function parseClothes(photo: ImageBitmap): Promise<{ labels: Uint8Array; width: number; height: number }> {
  const s = await loadClothes();
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(photo, 0, 0, SIZE, SIZE); // stretched, as the processor resizes
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const plane = SIZE * SIZE;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = (data[i * 4] / 255 - MEAN[0]) / STD[0];
    input[plane + i] = (data[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    input[2 * plane + i] = (data[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]) });
  const logits = out[s.outputNames[0]];
  const [, classes, h, w] = logits.dims as number[];
  const v = logits.data as Float32Array;
  const labels = new Uint8Array(w * h);
  const hw = w * h;
  for (let p = 0; p < hw; p++) {
    let best = 0;
    let bestV = -Infinity;
    for (let c = 0; c < classes; c++) {
      const x = v[c * hw + p];
      if (x > bestV) {
        bestV = x;
        best = c;
      }
    }
    labels[p] = best;
  }
  return { labels, width: w, height: h };
}
