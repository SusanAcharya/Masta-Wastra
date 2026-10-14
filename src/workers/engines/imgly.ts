// IMG.LY background removal (AGPL-3.0, see LICENSE and /about). Assets come from the
// IMG.LY CDN and are cached by our service worker (docs/DECISIONS.md, M0).
import { preload, removeBackground, type Config } from "@imgly/background-removal";
import type { CutoutEngine, EngineOptions } from "./types";

export const IMGLY_VERSION = "1.7.0";
export const MODEL_BASE_URL = `https://staticimgly.com/@imgly/background-removal-data/${IMGLY_VERSION}/dist/`;

function config(opts: EngineOptions): Config {
  return {
    publicPath: MODEL_BASE_URL,
    model: opts.model,
    device: opts.device,
    // PNG keeps the alpha matte lossless; the worker re-encodes after trimming.
    output: { format: "image/png", quality: 1 },
    progress: opts.onProgress,
  };
}

export const imgly: CutoutEngine = {
  preload: (opts) => preload(config(opts)),
  removeBackground: (photo, opts) => removeBackground(photo, config(opts)),
};
