import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { BackupError, backupFileName, exportBackup, importBackup, previewBackup, readBackup } from "@/db/backup";
import { addItem, getSettings, logWear, saveOutfit, updateItem, updateSettings } from "@/db/repo";
import type { MastaDB } from "@/db/schema";
import { freshDb, images, newItem } from "./helpers/db";

async function seed(db: MastaDB) {
  const top = (await addItem(db, { item: newItem({ aiRaw: { secret: "debug" } }), images: images(1), enqueueTag: true }))
    .item;
  const bottom = (
    await addItem(db, { item: newItem({ name: "Grey chinos", category: "bottom", subtype: "chinos" }), images: images(2) })
  ).item;
  const shoes = (
    await addItem(db, { item: newItem({ name: "White sneakers", category: "shoes", subtype: "sneakers" }), images: images(3) })
  ).item;
  const outfit = await saveOutfit(db, [top.id, bottom.id, shoes.id], { score: 77, reason: "Navy and grey." });
  await logWear(db, outfit, "2026-10-14");
  await db.feedback.add({
    id: "fb1",
    outfitId: outfit.id,
    at: "2026-10-14T07:00:00.000Z",
    signal: "up",
    features: {
      color: 0.8,
      warmthFit: 0.9,
      layerFit: 1,
      occasionFit: 1,
      freshness: 1,
      rainFit: 1,
      neverWornBoost: 0,
      patternBalance: 1,
      vibeCohesion: 0.5,
    },
  });
  await updateSettings(db, { installToken: "secret-token", badges: ["first-thread"], morningHour: 6 });
  return { top, bottom, shoes, outfit };
}

// Everything in the db, as plain data, with blobs as bytes. Used to compare two databases.
async function snapshot(db: MastaDB) {
  const out: Record<string, unknown> = {};
  for (const t of db.tables) {
    const rows = await t.toArray();
    out[t.name] = await Promise.all(
      rows
        .sort((a, b) => JSON.stringify(t.schema.primKey.keyPath === "localDate" ? a.localDate : a.id).localeCompare(
          JSON.stringify(t.schema.primKey.keyPath === "localDate" ? b.localDate : b.id),
        ))
        .map(async (r) => (r.blob ? { ...r, blob: [...new Uint8Array(await r.blob.arrayBuffer())] } : r)),
    );
  }
  return out;
}

describe("backup", () => {
  it("names the file by local date", () => {
    expect(backupFileName(new Date(2026, 9, 4))).toBe("masta-wastra-2026-10-04.wastra.zip");
  });

  it("round trips: export then import into a fresh install gives equal data", async () => {
    const source = freshDb();
    await seed(source);
    const zip = await exportBackup(source, { includeAiRaw: true });

    const target = freshDb();
    const targetSettings = await getSettings(target); // a fresh install has its own identity
    await importBackup(target, readBackup(zip), "replace");

    const a = await snapshot(source);
    const b = await snapshot(target);
    // Identity stays with each install: install id and token are not carried over.
    const strip = (s: unknown) =>
      (s as { installId?: string; installToken?: string }[]).map(({ installId: _i, installToken: _t, ...rest }) => rest);
    expect(strip(b.settings)).toEqual(strip(a.settings));
    expect((b.settings as { installId: string }[])[0].installId).toBe(targetSettings.installId);
    for (const table of ["items", "images", "outfits", "dealDays", "wears", "feedback", "weights", "tagJobs"]) {
      expect(b[table], table).toEqual(a[table]);
    }
  });

  it("writes manifest counts, strips the install token and AI debug JSON by default", async () => {
    const db = freshDb();
    await seed(db);
    const files = unzipSync(await exportBackup(db));
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    const data = JSON.parse(new TextDecoder().decode(files["data.json"]));

    expect(manifest).toMatchObject({ app: "masta-wastra", schemaVersion: 2, withPhotos: true });
    expect(manifest.counts).toMatchObject({ items: 3, images: 9, outfits: 1, wears: 1, feedback: 1 });
    expect(Object.keys(files).filter((f) => f.startsWith("images/"))).toHaveLength(9);
    expect(JSON.stringify(data)).not.toContain("secret-token");
    expect(data.items[0].aiRaw).toBeUndefined();
  });

  it("makes a tiny backup without photos that still imports", async () => {
    const db = freshDb();
    await seed(db);
    const zip = await exportBackup(db, { withPhotos: false });
    const parsed = readBackup(zip);
    expect(Object.keys(unzipSync(zip))).toEqual(["manifest.json", "data.json"]);
    expect(previewBackup(parsed)).toMatchObject({ items: 3, outfits: 1, wears: 1, photos: 0, withPhotos: false });

    const target = freshDb();
    await importBackup(target, parsed, "replace");
    expect(await target.items.count()).toBe(3);
    expect(await target.images.count()).toBe(0);
  });

  it("merges: newer updatedAt wins, local settings stay, badges combine", async () => {
    const local = freshDb();
    const { top } = await seed(local);
    const zip = await exportBackup(local);

    await new Promise((r) => setTimeout(r, 5));
    await updateItem(local, top.id, { name: "Renamed locally" });
    await updateSettings(local, { badges: ["layer-up"], morningHour: 8 });

    const backup = readBackup(zip);
    await importBackup(local, backup, "merge");

    expect((await local.items.get(top.id))?.name).toBe("Renamed locally"); // local was newer
    const s = await getSettings(local);
    expect(s.morningHour).toBe(8);
    expect(new Set(s.badges)).toEqual(new Set(["layer-up", "first-thread"]));
    expect(await local.wears.count()).toBe(1); // same wear id, not duplicated
  });

  it("merges an outfit that exists locally under another id, and repoints its wears", async () => {
    const a = freshDb();
    const { top, bottom, shoes } = await seed(a);
    const zip = await exportBackup(a);

    const b = freshDb();
    await importBackup(b, readBackup(zip), "replace");
    // b re-saves the same items as a new outfit id (as if dealt independently).
    await b.outfits.clear();
    await b.wears.clear();
    const localOutfit = await saveOutfit(b, [shoes.id, top.id, bottom.id]);

    await importBackup(b, readBackup(zip), "merge");
    expect(await b.outfits.count()).toBe(1);
    const wears = await b.wears.toArray();
    expect(wears).toHaveLength(1);
    expect(wears[0].outfitId).toBe(localOutfit.id);
  });

  it("rejects files that are not a Masta Wastra backup", () => {
    expect(() => readBackup(strToU8("hello"))).toThrow(BackupError);
    expect(() => readBackup(zipSync({ "notes.txt": strToU8("hi") }))).toThrow(/not a Masta Wastra backup/);
    const tooNew = zipSync({
      "manifest.json": strToU8(
        JSON.stringify({ app: "masta-wastra", schemaVersion: 99, exportedAt: "2027-01-01T00:00:00.000Z", withPhotos: false, counts: {} }),
      ),
      "data.json": strToU8("{}"),
    });
    expect(() => readBackup(tooNew)).toThrow(/newer version/);
  });

  it("rejects damaged data with a reason", async () => {
    const db = freshDb();
    await seed(db);
    const files = unzipSync(await exportBackup(db));
    const data = JSON.parse(new TextDecoder().decode(files["data.json"]));
    data.items[0].warmth = 9;
    files["data.json"] = strToU8(JSON.stringify(data));
    expect(() => readBackup(zipSync(files))).toThrow(/damaged/);
  });

  it("imports a schema v1 export through the same migration as the database", async () => {
    const db = freshDb();
    await seed(db);
    const files = unzipSync(await exportBackup(db));
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    const data = JSON.parse(new TextDecoder().decode(files["data.json"]));
    manifest.schemaVersion = 1;
    for (const item of data.items) delete item.cutoutQuality;
    files["manifest.json"] = strToU8(JSON.stringify(manifest));
    files["data.json"] = strToU8(JSON.stringify(data));

    const parsed = readBackup(zipSync(files));
    expect(parsed.data.items.every((i) => i.cutoutQuality === "auto")).toBe(true);
  });
});
