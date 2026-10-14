// The engine seam (6.6). A cutout engine turns a photo into the same photo with a
// transparent background. The worker does everything else (trim, colours, encode),
// so a second engine only has to implement this.
export interface CutoutEngine {
  preload(opts: EngineOptions): Promise<void>;
  removeBackground(photo: Blob, opts: EngineOptions): Promise<Blob>;
}

export interface EngineOptions {
  model: "isnet_quint8" | "isnet_fp16";
  device: "cpu" | "gpu";
  onProgress?: (key: string, current: number, total: number) => void;
}
