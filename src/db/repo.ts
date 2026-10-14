import {
  DEFAULT_WEIGHTS,
  type DealDay,
  type Feedback,
  type Item,
  type Outfit,
  type Wear,
  type Weights,
} from "@/engine/types";
import { defaultSettings, type ImageBlob, type MastaDB, type Settings, type TagJob } from "./schema";

// Typed queries over the Dexie tables. Every function takes the db so tests can pass
// an isolated instance; screens pass getDb().

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

/* Settings */

export async function getSettings(db: MastaDB): Promise<Settings> {
  const s = await db.settings.get("me");
  if (s) return s;
  const fresh = defaultSettings();
  await db.settings.put(fresh);
  return fresh;
}

export async function updateSettings(db: MastaDB, patch: Partial<Omit<Settings, "id">>): Promise<Settings> {
  return db.transaction("rw", db.settings, async () => {
    const next = { ...(await getSettings(db)), ...patch, id: "me" as const };
    await db.settings.put(next);
    return next;
  });
}

/* Items and images */

export type NewImage = Omit<ImageBlob, "id" | "kind">;

export type NewItem = Omit<
  Item,
  "id" | "createdAt" | "updatedAt" | "imageId" | "cutoutId" | "thumbId" | "primaryHex"
>;

export interface AddItemInput {
  item: NewItem;
  images: { original?: NewImage; cutout: NewImage; thumb: NewImage };
  enqueueTag?: boolean; // create a waiting TagJob in the same transaction (7.1)
}

// Saves the item, its images and (optionally) its tag job in one transaction (6.1 step 5).
// Returns the stored item and the new count of active items (the 3rd triggers persist, 5).
export async function addItem(db: MastaDB, input: AddItemInput): Promise<{ item: Item; activeCount: number }> {
  const at = now();
  const cutoutId = uuid();
  const thumbId = uuid();
  const originalId = input.images.original ? uuid() : undefined;
  const item: Item = {
    ...input.item,
    id: uuid(),
    createdAt: at,
    updatedAt: at,
    primaryHex: input.item.colors[0]?.hex ?? "#808080",
    imageId: originalId ?? cutoutId, // without a kept original, the cutout is the image
    cutoutId,
    thumbId,
  };
  const images: ImageBlob[] = [
    { ...input.images.cutout, id: cutoutId, kind: "cutout" },
    { ...input.images.thumb, id: thumbId, kind: "thumb" },
  ];
  if (input.images.original && originalId) images.push({ ...input.images.original, id: originalId, kind: "original" });

  return db.transaction("rw", db.items, db.images, db.tagJobs, async () => {
    await db.images.bulkAdd(images);
    await db.items.add(item);
    if (input.enqueueTag) await db.tagJobs.add(newTagJob(item.id, at));
    return { item, activeCount: await countActiveItems(db) };
  });
}

export function getItem(db: MastaDB, id: string) {
  return db.items.get(id);
}

export async function listItems(db: MastaDB, opts: { includeArchived?: boolean } = {}): Promise<Item[]> {
  const all = await db.items.orderBy("createdAt").reverse().toArray();
  return opts.includeArchived ? all : all.filter((i) => !i.archived);
}

export async function countActiveItems(db: MastaDB): Promise<number> {
  return db.items.filter((i) => !i.archived).count();
}

export async function updateItem(db: MastaDB, id: string, patch: Partial<Omit<Item, "id" | "createdAt">>) {
  return db.transaction("rw", db.items, async () => {
    const current = await db.items.get(id);
    if (!current) throw new Error(`item ${id} not found`);
    const next: Item = { ...current, ...patch, id, updatedAt: now() };
    if (patch.colors) next.primaryHex = patch.colors[0]?.hex ?? current.primaryHex;
    await db.items.put(next);
    return next;
  });
}

// One tap tag edit (10.4). An AI tagged item becomes "ai-edited"; Gemini is never re-called.
export async function editTags(db: MastaDB, id: string, patch: Partial<Item>) {
  const current = await db.items.get(id);
  if (!current) throw new Error(`item ${id} not found`);
  const tagSource = current.tagSource === "manual" ? "manual" : "ai-edited";
  return updateItem(db, id, { ...patch, tagSource, tagCheck: false });
}

export function archiveItem(db: MastaDB, id: string, archived = true) {
  return updateItem(db, id, { archived });
}

// Deletes the item, its images and tag jobs. Wears keep the item id, so history stays honest.
export async function deleteItem(db: MastaDB, id: string) {
  await db.transaction("rw", db.items, db.images, db.tagJobs, async () => {
    const item = await db.items.get(id);
    if (!item) return;
    await db.images.bulkDelete([...new Set([item.imageId, item.cutoutId, item.thumbId])]);
    await db.tagJobs.where("itemId").equals(id).delete();
    await db.items.delete(id);
  });
}

export function getImage(db: MastaDB, id: string) {
  return db.images.get(id);
}

// "Drop originals" (5): keeps cutouts and thumbs, frees about two thirds of the space.
export async function dropOriginals(db: MastaDB): Promise<number> {
  return db.transaction("rw", db.items, db.images, async () => {
    const originals = await db.images.where("kind").equals("original").primaryKeys();
    const set = new Set(originals);
    await db.items.toCollection().modify((item) => {
      if (set.has(item.imageId)) item.imageId = item.cutoutId;
    });
    await db.images.bulkDelete(originals);
    return originals.length;
  });
}

/* Outfits */

export function outfitSignature(itemIds: string[]): string {
  return [...itemIds].sort().join("|");
}

// Upsert by signature: the same set of items is always the same outfit.
export async function saveOutfit(
  db: MastaDB,
  itemIds: string[],
  extras: Partial<Pick<Outfit, "source" | "score" | "breakdown" | "reason">> = {},
): Promise<Outfit> {
  const signature = outfitSignature(itemIds);
  return db.transaction("rw", db.outfits, async () => {
    const existing = await db.outfits.where("signature").equals(signature).first();
    if (existing) {
      const next = { ...existing, ...extras, itemIds };
      await db.outfits.put(next);
      return next;
    }
    const outfit: Outfit = { id: uuid(), itemIds, signature, createdAt: now(), source: "deal", ...extras };
    await db.outfits.add(outfit);
    return outfit;
  });
}

export function getOutfit(db: MastaDB, id: string) {
  return db.outfits.get(id);
}

/* Deal days */

export function getDealDay(db: MastaDB, localDate: string) {
  return db.dealDays.get(localDate);
}

export function putDealDay(db: MastaDB, day: DealDay) {
  return db.dealDays.put(day);
}

/* Wears */

export async function logWear(db: MastaDB, outfit: Outfit, localDate: string): Promise<Wear> {
  const wear: Wear = { id: uuid(), localDate, outfitId: outfit.id, itemIds: outfit.itemIds, at: now() };
  await db.transaction("rw", db.wears, db.dealDays, async () => {
    await db.wears.add(wear);
    const day = await db.dealDays.get(localDate);
    if (day) await db.dealDays.put({ ...day, pickedOutfitId: outfit.id });
  });
  return wear;
}

export function wearsBetween(db: MastaDB, fromDate: string, toDate: string) {
  return db.wears.where("localDate").between(fromDate, toDate, true, true).sortBy("localDate");
}

export function wearsForItem(db: MastaDB, itemId: string) {
  return db.wears.where("itemIds").equals(itemId).sortBy("localDate");
}

// Last worn local date and wear count per item, for repeats (8.5) and insights (10.5).
export async function wearStats(db: MastaDB): Promise<Map<string, { count: number; last: string }>> {
  const stats = new Map<string, { count: number; last: string }>();
  await db.wears.each((w) => {
    for (const id of w.itemIds) {
      const s = stats.get(id);
      if (!s) stats.set(id, { count: 1, last: w.localDate });
      else {
        s.count += 1;
        if (w.localDate > s.last) s.last = w.localDate;
      }
    }
  });
  return stats;
}

/* Feedback and weights */

export async function addFeedback(db: MastaDB, fb: Omit<Feedback, "id" | "at">): Promise<Feedback> {
  const row: Feedback = { ...fb, id: uuid(), at: now() };
  await db.feedback.add(row);
  return row;
}

export function defaultWeights(): Weights {
  return {
    id: "current",
    version: 1,
    w: { ...DEFAULT_WEIGHTS },
    itemAffinity: {},
    pairAffinity: {},
    signals: 0,
    updatedAt: now(),
  };
}

export async function getWeights(db: MastaDB): Promise<Weights> {
  return (await db.weights.get("current")) ?? defaultWeights();
}

export function putWeights(db: MastaDB, w: Weights) {
  return db.weights.put({ ...w, id: "current", updatedAt: now() });
}

// "Reset my taste": restores defaults, keeps history (8.6).
export function resetWeights(db: MastaDB) {
  return db.weights.put(defaultWeights());
}

/* Tag jobs */

export function newTagJob(itemId: string, at = now()): TagJob {
  return { id: uuid(), itemId, attempts: 0, nextAt: at, state: "waiting" };
}

export async function enqueueTagJob(db: MastaDB, itemId: string): Promise<TagJob> {
  return db.transaction("rw", db.tagJobs, db.items, async () => {
    const existing = await db.tagJobs
      .where("itemId")
      .equals(itemId)
      .filter((j) => j.state === "waiting" || j.state === "running")
      .first();
    if (existing) return existing;
    const job = newTagJob(itemId);
    await db.tagJobs.add(job);
    await db.items.update(itemId, { tagStatus: "queued" });
    return job;
  });
}

export function dueTagJobs(db: MastaDB, at = now()) {
  return db.tagJobs
    .where("nextAt")
    .belowOrEqual(at)
    .filter((j) => j.state === "waiting")
    .sortBy("nextAt");
}

export function updateTagJob(db: MastaDB, id: string, patch: Partial<Omit<TagJob, "id">>) {
  return db.tagJobs.update(id, patch);
}

/* Everything */

// Clears every table. The caller also clears caches, local storage and the service worker (13).
export async function clearAllData(db: MastaDB) {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
