import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { listItems } from "@/db/repo";
import { MastaDB, SCHEMA_VERSION, V1_STORES } from "@/db/schema";

describe("schema migrations", () => {
  it("is on schema version 2", () => {
    expect(SCHEMA_VERSION).toBe(2);
  });

  it("upgrades a v1 database: fills new fields, keeps data, drops the boolean index", async () => {
    const name = `migrate-${crypto.randomUUID()}`;

    // A database as the build prompt's v1 schema would have left it.
    const v1 = new Dexie(name);
    v1.version(1).stores(V1_STORES);
    await v1.open();
    await v1.table("items").bulkAdd([
      {
        id: "i1",
        createdAt: "2026-10-01T08:00:00.000Z",
        updatedAt: "2026-10-01T08:00:00.000Z",
        name: "Camel coat",
        category: "outer",
        subtype: "coat",
        layer: 2,
        colors: [{ hex: "#b98a56", name: "camel", share: 1 }],
        primaryHex: "#b98a56",
        isNeutral: true,
        pattern: "solid",
        warmth: 4,
        vibes: ["smart"],
        occasions: ["work"],
        waterproof: false,
        tagSource: "ai",
        tagStatus: "done",
        imageId: "img1",
        cutoutId: "img1",
        thumbId: "th1",
        archived: false,
      },
      { id: "i2", createdAt: "2026-10-02T08:00:00.000Z", name: "Old tee", archived: true, category: "top" },
    ]);
    await v1.table("dealDays").add({ localDate: "2026-10-13", outfitIds: ["o1", "o2"], reshuffles: 1, seed: 7 });
    await v1.table("settings").add({ id: "me", morningHour: 6, badges: ["first-thread"] });
    v1.close();

    const db = new MastaDB(name);
    await db.open();
    expect(db.verno).toBe(2);

    const coat = await db.items.get("i1");
    expect(coat?.cutoutQuality).toBe("auto");
    expect(coat?.name).toBe("Camel coat");

    const day = await db.dealDays.get("2026-10-13");
    expect(day?.shownOutfitIds).toEqual(["o1", "o2"]);

    const s = await db.settings.get("me");
    expect(s?.morningHour).toBe(6); // kept
    expect(s?.badges).toEqual(["first-thread"]); // kept
    expect(s?.cardLayout).toBe("flat"); // filled
    expect(typeof s?.installId).toBe("string");

    // `archived` is no longer an index (IndexedDB cannot index booleans); filtering still works.
    expect(db.items.schema.indexes.map((i) => i.name)).not.toContain("archived");
    expect((await listItems(db)).map((i) => i.id)).toEqual(["i1"]);
    db.close();
  });
});
