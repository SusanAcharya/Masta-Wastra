import type { ItemColor } from "@/engine/types";
import type { GarmentGroup } from "@/lib/parsing";

export type WorkerRequest =
  | { type: "preload"; id: number; model: "isnet_quint8" | "isnet_fp16"; device: "cpu" | "gpu" }
  | { type: "cutout"; id: number; photo: Blob; model: "isnet_quint8" | "isnet_fp16"; device: "cpu" | "gpu" };

export interface CutoutResult {
  cutout: { blob: Blob; w: number; h: number; mime: string };
  thumb: { blob: Blob; w: number; h: number; mime: string };
  colors: ItemColor[];
  coverage: number; // opaque share of the frame, for the quality check (6.5)
  detected?: GarmentGroup; // what the clothes parser saw the photo is of
  person: boolean; // a person was in the photo and was cut away
  ms: number;
}

export type WorkerResponse =
  | { type: "progress"; id: number; key: string; current: number; total: number }
  | { type: "done"; id: number; result?: CutoutResult }
  | { type: "error"; id: number; message: string };
