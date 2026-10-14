import { describe, expect, it } from "vitest";
import { buildPools, generateCandidates, limitingSlot, occasionOk, warmthSane } from "@/engine/candidates";
import { buildScoreContext, type ScoreInput } from "@/engine/score";
import type { Item } from "@/engine/types";
import { HEX, TODAY, capsule, item, syntheticCloset, weather } from "./_fixtures";

const ctxFor = (items: Item[], extra: Partial<ScoreInput> = {}) =>
  buildScoreContext({ items, weather: weather({ feelsMax: 18 }), occasion: "casual", localDate: TODAY, ...extra });
const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe("hard filters", () => {
  it("drops archived items", () => {
    const ctx = ctxFor([item({ id: "a", subtype: "tshirt", archived: true }), item({ id: "b", subtype: "tshirt" })]);
    expect(ids(buildPools(ctx).pools.top)).toEqual(["b"]);
  });

  it("applies the occasion table", () => {
    const casualTee = item({ subtype: "tshirt", vibes: ["casual"] });
    const workOkTee = item({ subtype: "tshirt", vibes: ["casual"], occasions: ["work"] });
    expect(occasionOk(casualTee, "work")).toBe(false);
    expect(occasionOk(workOkTee, "work")).toBe(true);
    expect(occasionOk(item({ subtype: "shirt", vibes: ["smart"] }), "work")).toBe(true);
    expect(occasionOk(item({ subtype: "shirt", vibes: ["smart"] }), "formal")).toBe(false);
    expect(occasionOk(item({ subtype: "bag", vibes: ["smart"] }), "formal")).toBe(true); // accessories may be smart
    expect(occasionOk(item({ subtype: "joggers", vibes: ["casual"] }), "workout")).toBe(false);
    expect(occasionOk(item({ subtype: "joggers", vibes: ["sporty"] }), "workout")).toBe(true);
    expect(occasionOk(item({ subtype: "joggers", vibes: ["lounge"] }), "home")).toBe(true);
    expect(occasionOk(item({ subtype: "shirt", vibes: ["formal"] }), "home")).toBe(false);
  });

  it("keeps coats and heavy pieces out on hot days", () => {
    const ctx = ctxFor(
      [
        item({ id: "coat", subtype: "coat", warmth: 4 }),
        item({ id: "jacket", subtype: "jacket", warmth: 2 }),
        item({ id: "heavy-tee", subtype: "tshirt", warmth: 4 }),
        item({ id: "tee", subtype: "tshirt", warmth: 1 }),
        item({ id: "sweater", subtype: "sweater", warmth: 2 }),
        item({ id: "boots", subtype: "boots", warmth: 4 }),
      ],
      { weather: weather({ feelsMax: 30 }) },
    );
    const { pools } = buildPools(ctx);
    expect(pools.outer).toEqual([]); // base only, no outer
    expect(pools.mid).toEqual([]);
    expect(ids(pools.top)).toEqual(["tee"]);
    expect(ids(pools.shoes)).toEqual(["boots"]); // shoes are exempt from the warmth rule
    expect(warmthSane(item({ subtype: "coat", warmth: 4 }), "hot")).toBe(false);
  });

  it("allows only light layers on warm days", () => {
    const ctx = ctxFor([item({ id: "coat", subtype: "coat", warmth: 4 }), item({ id: "light", subtype: "jacket", warmth: 2 })], {
      weather: weather({ feelsMax: 23 }),
    });
    expect(ids(buildPools(ctx).pools.outer)).toEqual(["light"]);
  });

  it("keeps shorts and sandals out in the cold", () => {
    for (const feelsMax of [3, -5]) {
      const ctx = ctxFor(
        [item({ id: "shorts", subtype: "shorts" }), item({ id: "jeans", subtype: "jeans" }), item({ id: "sandals", subtype: "sandals" })],
        { weather: weather({ feelsMax }) },
      );
      const { pools } = buildPools(ctx);
      expect(ids(pools.bottom)).toEqual(["jeans"]);
      expect(pools.shoes).toEqual([]);
    }
  });

  it("drops yesterday's core pieces, unless the slot has fewer than 3 options", () => {
    const tops = [item({ id: "t1", subtype: "tshirt" }), item({ id: "t2", subtype: "tshirt" }), item({ id: "t3", subtype: "tshirt" })];
    const wears = [{ localDate: "2026-10-13", itemIds: ["t1"] }];
    expect(ids(buildPools(ctxFor(tops, { wears })).pools.top)).toEqual(["t2", "t3"]);
    // Only two tops: yesterday's stays, with a freshness penalty.
    const small = buildPools(ctxFor(tops.slice(0, 2), { wears })).pools.top;
    expect(ids(small)).toEqual(["t1", "t2"]);
    // Worn two days ago is fine.
    const older = [{ localDate: "2026-10-12", itemIds: ["t1"] }];
    expect(ids(buildPools(ctxFor(tops, { wears: older })).pools.top)).toEqual(["t1", "t2", "t3"]);
  });

  it("allows accessories by weather: bag always, scarf when cold, hat when hot with high UV", () => {
    const acc = [item({ id: "bag", subtype: "bag" }), item({ id: "scarf", subtype: "scarf" }), item({ id: "hat", subtype: "hat" })];
    expect(ids(buildPools(ctxFor(acc)).pools.accessory)).toEqual(["bag"]);
    expect(ids(buildPools(ctxFor(acc, { weather: weather({ feelsMax: 3 }) })).pools.accessory)).toEqual(["bag", "scarf", "hat"]);
    expect(ids(buildPools(ctxFor(acc, { weather: weather({ feelsMax: 30, uvMax: 8 }) })).pools.accessory)).toEqual(["bag", "hat"]);
  });
});

describe("enumeration", () => {
  it("fills templates A to D and never puts a sweater over a sweater", () => {
    const ctx = ctxFor(capsule(), { weather: weather({ feelsMax: 12 }) });
    const { candidates } = generateCandidates(ctx);
    const shapes = new Set(candidates.map((c) => `${c.parts.base.item.category}${c.parts.mid ? "+mid" : ""}${c.parts.outer ? "+outer" : ""}`));
    expect(shapes).toEqual(new Set(["top", "top+mid", "top+outer", "top+mid+outer", "dress", "dress+mid", "dress+outer", "dress+mid+outer"]));
    for (const c of candidates) {
      if (c.parts.mid) expect(c.parts.base.item.layer).toBe(0);
      expect(new Set(c.core.map((p) => p.id)).size).toBe(c.core.length);
    }
  });

  it("handles an empty closet and reports the slot that limits most", () => {
    const empty = generateCandidates(ctxFor([]));
    expect(empty.candidates).toEqual([]);
    expect(empty.stats.limiting).toEqual({ slot: "top", count: 0 });
    const noShoes = [
      ...["a", "b", "c", "d", "e"].map((id) => item({ id, subtype: "tshirt" })),
      ...["f", "g", "h", "i"].map((id) => item({ id, subtype: "jeans" })),
      item({ id: "s", subtype: "sneakers" }),
    ];
    const r = generateCandidates(ctxFor(noShoes));
    expect(r.candidates.length).toBe(20);
    expect(r.stats.limiting).toEqual({ slot: "shoes", count: 1 });
  });

  it("asks for an outer layer when the cold needs one", () => {
    expect(limitingSlot({ top: 5, dress: 0, bottom: 5, shoes: 4, mid: 3, outer: 0, accessory: 0 }, "cold")).toEqual({ slot: "outer", count: 0 });
    expect(limitingSlot({ top: 5, dress: 0, bottom: 5, shoes: 4, mid: 3, outer: 0, accessory: 0 }, "warm")).toBeNull();
  });

  it("enumerates everything for a small closet", () => {
    const r = generateCandidates(ctxFor(capsule()));
    expect(r.stats.capped).toBe(false);
    expect(r.stats.beam).toBe(false);
    // The product counts a sweater worn as the top with a mid layer too; those are skipped.
    expect(r.candidates.length).toBeGreaterThan(100);
    expect(r.candidates.length).toBeLessThanOrEqual(r.stats.product);
  });

  it("caps with the beam when the product exceeds 5,000", () => {
    const ctx = ctxFor(syntheticCloset(), { weather: weather({ feelsMax: 12 }) });
    const r = generateCandidates(ctx);
    expect(r.stats.product).toBeGreaterThan(5000);
    expect(r.stats.capped).toBe(true);
    expect(r.stats.beam).toBe(true);
    expect(r.candidates.length).toBeLessThan(10_000);
    expect(r.candidates.length).toBeGreaterThan(100);
  });

  it("can force an item in (Outfits with this)", () => {
    const ctx = ctxFor(capsule());
    const r = generateCandidates(ctx, { force: "camel-jacket" });
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) expect(c.parts.outer?.id).toBe("camel-jacket");
    const sweater = generateCandidates(ctx, { force: "grey-sweater" });
    expect(sweater.candidates.some((c) => c.parts.base.id === "grey-sweater")).toBe(true);
    expect(sweater.candidates.some((c) => c.parts.mid?.id === "grey-sweater")).toBe(true);
    for (const c of sweater.candidates) expect(c.core.some((p) => p.id === "grey-sweater")).toBe(true);
  });

  it("only adds an accessory that is neutral or echoes the outfit", () => {
    const items = [
      item({ id: "tee", subtype: "tshirt", hex: HEX.navy }),
      item({ id: "jeans", subtype: "jeans", hex: HEX.denim }),
      item({ id: "shoes", subtype: "sneakers", hex: HEX.white }),
      item({ id: "pink-bag", subtype: "bag", hex: HEX.pink, createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const r = generateCandidates(ctxFor(items));
    expect(r.candidates[0].parts.accessory).toBeUndefined(); // never worn, but off palette
  });
});
