import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import type { DealDay, Item, Outfit } from "@/engine/types";
import { dataSchema, manifestSchema, type BackupData, type BackupManifest } from "./backup-schema";
import {
  migrateDealDayV1,
  migrateItemV1,
  migrateSettingsV1,
  SCHEMA_VERSION,
  type ImageBlob,
  type MastaDB,
  type Settings,
} from "./schema";

// Export and import of a single .wastra.zip (13): manifest.json, data.json, images/<id>.<ext>.
// Built and read entirely on the device.

export const BACKUP_EXT = ".wastra.zip";
const MAX_ZIP_BYTES = 1024 * 1024 * 1024; // 1 GB: far above a real closet, stops a zip bomb early
const EXT: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

export class BackupError extends Error {
  constructor(
    public code: "not_zip" | "not_wastra" | "invalid" | "too_new" | "too_big",
    message: string,
  ) {
    super(message);
  }
}

export interface ExportOptions {
  withPhotos?: boolean; // false = tiny JSON only backup
  includeAiRaw?: boolean; // Gemini debug JSON is stripped unless asked (5)
  now?: Date;
}

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `masta-wastra-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${BACKUP_EXT}`;
}

export async function exportBackup(db: MastaDB, opts: ExportOptions = {}): Promise<Uint8Array> {
  const withPhotos = opts.withPhotos ?? true;
  const exportedAt = (opts.now ?? new Date()).toISOString();

  const [items, images, outfits, dealDays, wears, feedback, weights, settings, tagJobs] = await db.transaction(
    "r",
    db.tables,
    () =>
      Promise.all([
        db.items.toArray(),
        withPhotos ? db.images.toArray() : Promise.resolve([] as ImageBlob[]),
        db.outfits.toArray(),
        db.dealDays.toArray(),
        db.wears.toArray(),
        db.feedback.toArray(),
        db.weights.toArray(),
        db.settings.toArray(),
        db.tagJobs.toArray(),
      ]),
  );

  const files: Zippable = {};
  const imageMeta = [];
  for (const img of images) {
    const file = `images/${img.id}.${EXT[img.mime] ?? "bin"}`;
    files[file] = [new Uint8Array(await img.blob.arrayBuffer()), { level: 0 }]; // already compressed
    imageMeta.push({ id: img.id, kind: img.kind, w: img.w, h: img.h, mime: img.mime, file });
  }

  const data: BackupData = {
    items: items.map((i) => (opts.includeAiRaw ? i : stripAiRaw(i))),
    images: imageMeta,
    outfits,
    dealDays,
    wears,
    feedback,
    weights,
    // The install token belongs to this install and is never exported.
    settings: settings.map(({ installToken: _token, ...rest }) => rest),
    tagJobs,
  } as unknown as BackupData;

  const manifest: BackupManifest = {
    app: "masta-wastra",
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    withPhotos,
    counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, (v as unknown[]).length])),
  };

  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["data.json"] = strToU8(JSON.stringify(data));
  return zipSync(files, { level: 6 });
}

function stripAiRaw(item: Item): Item {
  const { aiRaw: _raw, ...rest } = item;
  return rest as Item;
}

export interface ParsedBackup {
  manifest: BackupManifest;
  data: BackupData;
  images: Map<string, Uint8Array>; // image id to bytes
}

export function readBackup(bytes: Uint8Array): ParsedBackup {
  if (bytes.byteLength > MAX_ZIP_BYTES) throw new BackupError("too_big", "Backup is larger than 1 GB.");
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new BackupError("not_zip", "This file is not a zip archive.");
  }
  if (!entries["manifest.json"] || !entries["data.json"]) {
    throw new BackupError("not_wastra", "This zip is not a Masta Wastra backup.");
  }

  const manifest = manifestSchema.safeParse(safeJson(entries["manifest.json"]));
  if (!manifest.success) throw new BackupError("not_wastra", "The backup manifest is not readable.");
  if (manifest.data.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError("too_new", "This backup comes from a newer version of Masta Wastra. Update the app first.");
  }

  const parsed = dataSchema.safeParse(safeJson(entries["data.json"]));
  if (!parsed.success) {
    throw new BackupError("invalid", `The backup data is damaged: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }

  const images = new Map<string, Uint8Array>();
  for (const meta of parsed.data.images) {
    const file = entries[meta.file];
    if (file) images.set(meta.id, file);
  }
  return { manifest: manifest.data, data: migrateData(parsed.data, manifest.data.schemaVersion), images };
}

function safeJson(u8: Uint8Array): unknown {
  try {
    return JSON.parse(strFromU8(u8));
  } catch {
    return undefined;
  }
}

// Runs the same per-row migrations as the Dexie upgrade, so old exports import cleanly.
function migrateData(data: BackupData, from: number): BackupData {
  if (from >= SCHEMA_VERSION) return data;
  return {
    ...data,
    items: data.items.map((i) => migrateItemV1(i as Item)),
    dealDays: data.dealDays.map((d) => migrateDealDayV1(d as DealDay)),
  } as BackupData;
}

export interface BackupPreview {
  items: number;
  outfits: number;
  wears: number;
  photos: number;
  exportedAt: string;
  withPhotos: boolean;
}

export function previewBackup(b: ParsedBackup): BackupPreview {
  return {
    items: b.data.items.length,
    outfits: b.data.outfits.length,
    wears: b.data.wears.length,
    photos: b.images.size,
    exportedAt: b.manifest.exportedAt,
    withPhotos: b.manifest.withPhotos,
  };
}

export type ImportMode = "merge" | "replace";

export async function importBackup(db: MastaDB, b: ParsedBackup, mode: ImportMode): Promise<BackupPreview> {
  const images: ImageBlob[] = b.data.images
    .filter((m) => b.images.has(m.id))
    .map((m) => ({
      id: m.id,
      kind: m.kind,
      w: m.w,
      h: m.h,
      mime: m.mime,
      blob: new Blob([b.images.get(m.id)! as Uint8Array<ArrayBuffer>], { type: m.mime }),
    }));
  const d = b.data as unknown as {
    items: Item[];
    outfits: Outfit[];
    dealDays: DealDay[];
    wears: BackupData["wears"];
    feedback: BackupData["feedback"];
    weights: BackupData["weights"];
    settings: Partial<Settings>[];
    tagJobs: BackupData["tagJobs"];
  };

  await db.transaction("rw", db.tables, async () => {
    const local = await db.settings.get("me");

    if (mode === "replace") {
      await Promise.all(db.tables.map((t) => t.clear()));
      await db.items.bulkPut(d.items);
      await db.images.bulkPut(images);
      await db.outfits.bulkPut(d.outfits);
      await db.dealDays.bulkPut(d.dealDays);
      await db.wears.bulkPut(d.wears);
      await db.feedback.bulkPut(d.feedback);
      await db.weights.bulkPut(d.weights as never);
      await db.tagJobs.bulkPut(d.tagJobs);
      // Keep this install's identity: the deal seed and the server token stay local.
      const s = d.settings[0];
      if (s || local) {
        await db.settings.put({
          ...migrateSettingsV1({ ...(s ?? {}) }),
          ...(local ? { installId: local.installId, installToken: local.installToken } : {}),
        });
      }
      return;
    }

    // Merge: items by id, newer updatedAt wins. Everything else is added when absent.
    const wonItems = new Set<string>();
    for (const item of d.items) {
      const existing = await db.items.get(item.id);
      if (!existing || item.updatedAt > existing.updatedAt) {
        await db.items.put(item);
        wonItems.add(item.id);
      }
    }
    const wonImageIds = new Set(
      d.items.filter((i) => wonItems.has(i.id)).flatMap((i) => [i.imageId, i.cutoutId, i.thumbId]),
    );
    for (const img of images) {
      if (wonImageIds.has(img.id) || !(await db.images.get(img.id))) await db.images.put(img);
    }

    // An outfit whose signature already exists locally keeps the local id; references follow it.
    const outfitIdMap = new Map<string, string>();
    for (const outfit of d.outfits) {
      if (await db.outfits.get(outfit.id)) continue;
      const same = await db.outfits.where("signature").equals(outfit.signature).first();
      if (same) outfitIdMap.set(outfit.id, same.id);
      else await db.outfits.add(outfit);
    }
    const remap = (id: string) => outfitIdMap.get(id) ?? id;

    for (const day of d.dealDays) {
      if (await db.dealDays.get(day.localDate)) continue;
      await db.dealDays.add({
        ...day,
        outfitIds: day.outfitIds.map(remap),
        shownOutfitIds: day.shownOutfitIds.map(remap),
        pickedOutfitId: day.pickedOutfitId ? remap(day.pickedOutfitId) : undefined,
      });
    }
    for (const wear of d.wears) {
      if (!(await db.wears.get(wear.id))) await db.wears.add({ ...wear, outfitId: remap(wear.outfitId) });
    }
    for (const fb of d.feedback) {
      if (!(await db.feedback.get(fb.id))) await db.feedback.add({ ...fb, outfitId: remap(fb.outfitId) } as never);
    }
    for (const job of d.tagJobs) {
      if (!(await db.tagJobs.get(job.id))) await db.tagJobs.add(job);
    }
    if (!(await db.weights.get("current")) && d.weights[0]) await db.weights.put(d.weights[0] as never);
    // Local settings win in a merge; badges are earned, so they combine.
    if (local && d.settings[0]?.badges) {
      await db.settings.put({ ...local, badges: [...new Set([...local.badges, ...d.settings[0].badges])] });
    } else if (!local && d.settings[0]) {
      await db.settings.put(migrateSettingsV1(d.settings[0]));
    }
  });

  return previewBackup(b);
}
