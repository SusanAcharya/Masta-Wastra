// Promise wrapper around the cutout worker (6.6). One job at a time; the worker is
// recreated every 10 cutouts to release WASM memory on phones (6.4).
import type { CutoutResult, WorkerRequest, WorkerResponse } from "./protocol";

type Model = "isnet_quint8" | "isnet_fp16";
type Progress = (key: string, current: number, total: number) => void;
// Omit that distributes over the request union.
type NewRequest = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, "id"> : never) : never;

const RECYCLE_AFTER = 10;

let worker: Worker | undefined;
let jobsOnWorker = 0;
let nextId = 1;
let chain: Promise<unknown> = Promise.resolve();
const pending = new Map<number, { resolve: (r?: CutoutResult) => void; reject: (e: Error) => void; onProgress?: Progress }>();

export function cutoutSupported(): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap !== "undefined";
}

// WebGPU only when an adapter really exists: `navigator.gpu` is present on many machines
// (headless Chrome, older GPUs) that cannot provide one, and onnxruntime then logs errors.
let device: Promise<"cpu" | "gpu"> | undefined;
export function preferredDevice(): Promise<"cpu" | "gpu"> {
  device ??= (async () => {
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
      return gpu && (await gpu.requestAdapter()) ? "gpu" : "cpu";
    } catch {
      return "cpu";
    }
  })();
  return device;
}

function getWorker(): Worker {
  if (worker && jobsOnWorker >= RECYCLE_AFTER) {
    worker.terminate();
    worker = undefined;
  }
  if (!worker) {
    worker = new Worker(new URL("./cutout.worker.ts", import.meta.url), { type: "module" });
    jobsOnWorker = 0;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const job = pending.get(msg.id);
      if (!job) return;
      if (msg.type === "progress") job.onProgress?.(msg.key, msg.current, msg.total);
      else {
        pending.delete(msg.id);
        if (msg.type === "done") job.resolve(msg.result);
        else job.reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      // A crashed worker (often out of memory) fails every job on it; the next job gets a new one.
      for (const [id, job] of pending) {
        pending.delete(id);
        job.reject(new Error(e.message || "cutout worker crashed"));
      }
      worker?.terminate();
      worker = undefined;
    };
  }
  return worker;
}

function send(req: NewRequest, onProgress?: Progress): Promise<CutoutResult | undefined> {
  const run = () =>
    new Promise<CutoutResult | undefined>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, onProgress });
      const w = getWorker();
      if (req.type === "cutout") jobsOnWorker++;
      w.postMessage({ ...req, id } as WorkerRequest);
    });
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

export async function preloadModel(model: Model, onProgress?: Progress) {
  return send({ type: "preload", model, device: await preferredDevice() }, onProgress);
}

export async function cutout(photo: Blob, model: Model, onProgress?: Progress): Promise<CutoutResult> {
  const result = await send({ type: "cutout", photo, model, device: await preferredDevice() }, onProgress);
  if (!result) throw new Error("cutout returned nothing");
  return result;
}
