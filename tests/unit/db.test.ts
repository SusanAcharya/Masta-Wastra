import { describe, expect, it } from "vitest";
import {
  addItem,
  archiveItem,
  countActiveItems,
  deleteItem,
  dropOriginals,
  dueTagJobs,
  editTags,
  enqueueTagJob,
  getImage,
  getItem,
  getSettings,
  getWeights,
  listItems,
  logWear,
  outfitSignature,
  putDealDay,
  resetWeights,
  saveOutfit,
  slotCounts,
  updateItem,
  updateSettings,
  wearStats,
  wearsForItem,
} from "@/db/repo";
import { DEFAULT_WEIGHTS, type DealDay } from "@/engine/types";
import { freshDb, images, newItem } from "./helpers/db";

const weather: DealDay["weather"] = {
  fetchedAt: "2026-10-14T06:00:00.000Z",
  lat: 27.71,
  lon: 85.32,
  tempNow: 14,
  feelsMin: 12,
  feelsMax: 21,
  precipProb: 10,
  precipMm: 0,
  windMax: 9,
  uvMax: 5,
  code: 1,
};

describe("items", () => {
  it("adds an item with its images and tag job in one go", async () => {
    const db = freshDb();
    const { item, activeCount } = await addItem(db, { item: newItem(), images: images(), enqueueTag: true });

    expect(activeCount).toBe(1);
    expect(item.primaryHex).toBe("#1f2a44");
    expect(await getItem(db, item.id)).toEqual(item);
    const original = await getImage(db, item.imageId);
    expect(original?.kind).toBe("original");
    expect(new Uint8Array(await original!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 1, 1, 1]));
    expect((await getImage(db, item.cutoutId))?.kind).toBe("cutout");
    expect((await getImage(db, item.thumbId))?.kind).toBe("thumb");
    expect(await db.tagJobs.where("itemId").equals(item.id).count()).toBe(1);
  });

  it("uses the cutout as the image when originals are not kept", async () => {
    const db = freshDb();
    const { original: _o, ...noOriginal } = images();
    const { item } = await addItem(db, { item: newItem(), images: noOriginal });
    expect(item.imageId).toBe(item.cutoutId);
    expect(await db.images.count()).toBe(2);
  });

  it("rolls back the whole save when one part fails", async () => {
    const db = freshDb();
    await expect(
      addItem(db, { item: newItem({ colors: undefined as never }), images: images() }),
    ).rejects.toThrow();
    expect(await db.items.count()).toBe(0);
    expect(await db.images.count()).toBe(0);
  });

  it("lists newest first and hides archived items unless asked", async () => {
    const db = freshDb();
    const a = (await addItem(db, { item: newItem({ name: "A" }), images: images(1) })).item;
    await new Promise((r) => setTimeout(r, 5));
    const b = (await addItem(db, { item: newItem({ name: "B" }), images: images(2) })).item;
    await archiveItem(db, a.id);

    expect((await listItems(db)).map((i) => i.name)).toEqual(["B"]);
    expect((await listItems(db, { includeArchived: true })).map((i) => i.name)).toEqual(["B", "A"]);
    expect(await countActiveItems(db)).toBe(1);
    expect(b.archived).toBe(false);
  });

  it("updates fields, bumps updatedAt and keeps primaryHex in step with colours", async () => {
    const db = freshDb();
    const { item } = await addItem(db, { item: newItem(), images: images() });
    await new Promise((r) => setTimeout(r, 5));
    const next = await updateItem(db, item.id, { colors: [{ hex: "#b98a56", name: "camel", share: 1 }] });
    expect(next.primaryHex).toBe("#b98a56");
    expect(next.updatedAt > item.updatedAt).toBe(true);
    expect(next.createdAt).toBe(item.createdAt);
  });

  it("marks an AI tagged item as ai-edited when a tag is changed by hand", async () => {
    const db = freshDb();
    const { item } = await addItem(db, {
      item: newItem({ tagSource: "ai", tagStatus: "done", tagCheck: true }),
      images: images(),
    });
    const edited = await editTags(db, item.id, { warmth: 4 });
    expect(edited.tagSource).toBe("ai-edited");
    expect(edited.tagCheck).toBe(false);
    expect(edited.warmth).toBe(4);

    const manual = (await addItem(db, { item: newItem(), images: images(2) })).item;
    expect((await editTags(db, manual.id, { warmth: 1 })).tagSource).toBe("manual");
  });

  it("deletes an item with its images and jobs, but keeps wears in history", async () => {
    const db = freshDb();
    const { item } = await addItem(db, { item: newItem(), images: images(), enqueueTag: true });
    const outfit = await saveOutfit(db, [item.id]);
    await logWear(db, outfit, "2026-10-14");

    await deleteItem(db, item.id);
    expect(await getItem(db, item.id)).toBeUndefined();
    expect(await db.images.count()).toBe(0);
    expect(await db.tagJobs.count()).toBe(0);
    expect(await db.wears.count()).toBe(1);
  });

  it("drops originals and points items at their cutout", async () => {
    const db = freshDb();
    const { item } = await addItem(db, { item: newItem(), images: images() });
    expect(await dropOriginals(db)).toBe(1);
    expect((await getItem(db, item.id))?.imageId).toBe(item.cutoutId);
    expect(await db.images.where("kind").equals("original").count()).toBe(0);
  });

  it("counts starter slots, with a dress filling top and bottom", async () => {
    const db = freshDb();
    await addItem(db, { item: newItem({ category: "dress", subtype: "dress" }), images: images(1) });
    await addItem(db, { item: newItem({ category: "shoes", subtype: "sneakers" }), images: images(2) });
    expect(await slotCounts(db)).toEqual({ top: 1, bottom: 1, shoes: 1 });
  });
});

describe("outfits and wears", () => {
  it("treats the same set of items as the same outfit, in any order", async () => {
    const db = freshDb();
    expect(outfitSignature(["b", "a", "c"])).toBe("a|b|c");
    const first = await saveOutfit(db, ["a", "b", "c"], { score: 70 });
    const again = await saveOutfit(db, ["c", "a", "b"], { score: 81 });
    expect(again.id).toBe(first.id);
    expect(again.score).toBe(81);
    expect(await db.outfits.count()).toBe(1);
  });

  it("logs a wear, marks the day's pick and counts wears per item", async () => {
    const db = freshDb();
    const o1 = await saveOutfit(db, ["top1", "bottom1", "shoes1"]);
    const o2 = await saveOutfit(db, ["top1", "bottom2", "shoes1"]);
    await putDealDay(db, {
      localDate: "2026-10-14",
      occasion: "work",
      weather,
      outfitIds: [o1.id, o2.id],
      shownOutfitIds: [o1.id, o2.id],
      seed: 42,
      reshuffles: 0,
    });
    await logWear(db, o1, "2026-10-13");
    await logWear(db, o2, "2026-10-14");

    expect((await db.dealDays.get("2026-10-14"))?.pickedOutfitId).toBe(o2.id);
    expect((await wearsForItem(db, "top1")).map((w) => w.localDate)).toEqual(["2026-10-13", "2026-10-14"]);
    const stats = await wearStats(db);
    expect(stats.get("top1")).toEqual({ count: 2, last: "2026-10-14" });
    expect(stats.get("bottom1")).toEqual({ count: 1, last: "2026-10-13" });
  });
});

describe("settings, weights, tag jobs", () => {
  it("creates default settings once, with a stable install id", async () => {
    const db = freshDb();
    const s1 = await getSettings(db);
    const s2 = await getSettings(db);
    expect(s1.installId).toBe(s2.installId);
    expect(s1.morningHour).toBe(7);
    expect(s1.defaultOccasionByWeekday).toEqual(["casual", "work", "work", "work", "work", "work", "casual"]);
    expect(s1.aiConsent).toBeNull();
    const s3 = await updateSettings(db, { morningHour: 6 });
    expect(s3.morningHour).toBe(6);
    expect(s3.installId).toBe(s1.installId);
  });

  it("returns default weights until saved, and resets to them", async () => {
    const db = freshDb();
    expect((await getWeights(db)).w).toEqual(DEFAULT_WEIGHTS);
    await db.weights.put({ ...(await getWeights(db)), w: { ...DEFAULT_WEIGHTS, color: 5 } });
    expect((await getWeights(db)).w.color).toBe(5);
    await resetWeights(db);
    expect((await getWeights(db)).w.color).toBe(DEFAULT_WEIGHTS.color);
  });

  it("never queues the same item twice and returns due jobs in order", async () => {
    const db = freshDb();
    const { item } = await addItem(db, { item: newItem({ tagStatus: "pending" }), images: images() });
    const j1 = await enqueueTagJob(db, item.id);
    const j2 = await enqueueTagJob(db, item.id);
    expect(j2.id).toBe(j1.id);
    expect((await getItem(db, item.id))?.tagStatus).toBe("queued");
    await db.tagJobs.update(j1.id, { nextAt: "2099-01-01T00:00:00.000Z" });
    expect(await dueTagJobs(db)).toEqual([]);
    expect((await dueTagJobs(db, "2099-01-02T00:00:00.000Z")).map((j) => j.id)).toEqual([j1.id]);
  });
});
