import { describe, expect, it } from "vitest";
import { MAX_RESHUFFLES, canDealAgain, createPicker, deal, dealSeed, outfitsWith, pickAnother, pickOutfit, type DealInput } from "@/engine/deal";
import type { Item } from "@/engine/types";
import { HEX, TODAY, capsule, item, syntheticCloset, weather } from "./_fixtures";

const input = (items: Item[], extra: Partial<DealInput> = {}): DealInput => ({
  items,
  weather: weather({ feelsMax: 18 }),
  occasion: "casual",
  localDate: TODAY,
  seed: 7,
  ...extra,
});

const coreIds = (o: { slots: Record<string, string | undefined> }) =>
  Object.entries(o.slots)
    .filter(([slot]) => slot !== "accessory")
    .map(([, id]) => id!);
const overlap = (a: string[], b: string[]) => a.filter((x) => b.includes(x)).length;

describe("seed", () => {
  it("is a stable hash of localDate and installId", () => {
    expect(dealSeed("2026-10-14", "abc")).toBe(dealSeed("2026-10-14", "abc"));
    expect(dealSeed("2026-10-14", "abc")).not.toBe(dealSeed("2026-10-15", "abc"));
    expect(Number.isInteger(dealSeed("2026-10-14", "abc"))).toBe(true);
  });
});

describe("deal", () => {
  it("is deterministic for the same inputs", () => {
    const a = deal(input(capsule()));
    const b = deal(input(capsule()));
    expect(a.outfits.map((o) => o.signature)).toEqual(b.outfits.map((o) => o.signature));
    expect(a.outfits.map((o) => o.reason)).toEqual(b.outfits.map((o) => o.reason));
    const big = syntheticCloset();
    expect(deal(input(big, { seed: 3 })).outfits.map((o) => o.signature)).toEqual(deal(input(big, { seed: 3 })).outfits.map((o) => o.signature));
  });

  it("breaks exact ties with the seed", () => {
    // Four identical white tees: every outfit ties, so the seed picks the tee.
    const items = [
      ...[1, 2, 3, 4].map((n) => item({ id: `tee${n}`, subtype: "tshirt", hex: HEX.white })),
      item({ id: "jeans", subtype: "jeans", hex: HEX.denim }),
      item({ id: "shoes", subtype: "sneakers", hex: HEX.white }),
    ];
    const firsts = new Set<string>();
    for (let seed = 0; seed < 20; seed++) firsts.add(pickOutfit(input(items, { seed })).outfit!.slots.top!);
    expect(firsts.size).toBeGreaterThan(1);
  });

  it("returns 3 outfits sharing at most 1 core item with each other", () => {
    for (const items of [capsule(), syntheticCloset()]) {
      for (const feelsMax of [30, 18, 10, 2]) {
        const r = deal(input(items, { weather: weather({ feelsMax }) }));
        expect(r.outfits.length).toBe(3);
        const cores = r.outfits.map(coreIds);
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(overlap(cores[i], cores[j])).toBeLessThanOrEqual(1);
        expect(r.relaxed).toBe(false);
      }
    }
  });

  it("orders item ids outer, mid, top or dress, bottom, shoes, accessory and signs them like the repo", () => {
    const r = deal(input(capsule(), { weather: weather({ feelsMax: 10 }) }));
    for (const o of r.outfits) {
      const order = ["outer", "mid", "top", "dress", "bottom", "shoes", "accessory"].flatMap((s) => (o.slots as Record<string, string>)[s] ?? []);
      expect(o.itemIds).toEqual(order);
      expect(o.signature).toBe([...o.itemIds].sort().join("|"));
      expect(o.displayScore).toBeGreaterThanOrEqual(0);
      expect(o.displayScore).toBeLessThanOrEqual(100);
      expect(o.reason.length).toBeGreaterThan(5);
      expect(Object.keys(o.breakdown)).toContain("color");
    }
  });

  it("handles a closet too small for 3 looks", () => {
    const items = [
      item({ id: "tee", subtype: "tshirt", hex: HEX.white }),
      item({ id: "jeans", subtype: "jeans", hex: HEX.denim }),
      item({ id: "shoes", subtype: "sneakers", hex: HEX.white }),
    ];
    const r = deal(input(items));
    expect(r.outfits.length).toBe(1);
    expect(r.limiting).toEqual({ slot: "top", count: 1 });
    expect(deal(input([])).outfits).toEqual([]);
    // Two tops share the jeans and shoes: shown, but flagged as relaxed.
    const two = deal(input([...items, item({ id: "tee2", subtype: "tshirt", hex: HEX.navy })]));
    expect(two.outfits.length).toBe(2);
    expect(two.relaxed).toBe(true);
  });

  it("deal again excludes everything shown, within the reshuffle cap", () => {
    expect(MAX_RESHUFFLES).toBe(3);
    expect([0, 1, 2, 3].map(canDealAgain)).toEqual([true, true, true, false]);
    const items = syntheticCloset();
    const shown: string[] = [];
    for (let i = 0; canDealAgain(i); i++) {
      const r = deal(input(items, { exclude: shown, seed: 11 }));
      for (const o of r.outfits) {
        expect(shown).not.toContain(o.signature);
        shown.push(o.signature);
      }
    }
    expect(new Set(shown).size).toBe(9);
  });

  it("never returns a clashing outfit while a good one exists", () => {
    const items = [
      item({ id: "red-print", subtype: "blouse", hex: HEX.red, pattern: "print", vibes: ["casual"], occasions: ["casual"] }),
      item({ id: "green-floral", subtype: "skirt", hex: HEX.green, pattern: "floral" }),
      item({ id: "purple-check", subtype: "trousers", hex: HEX.purple, pattern: "check" }),
      item({ id: "navy-tee", subtype: "tshirt", hex: HEX.navy }),
      item({ id: "khaki", subtype: "chinos", hex: HEX.khaki }),
      item({ id: "white-shoes", subtype: "sneakers", hex: HEX.white }),
      item({ id: "orange-shoes", subtype: "sneakers", hex: HEX.orange }),
    ];
    const r = deal(input(items, { n: 10 }));
    expect(r.colorRelaxed).toBe(false);
    expect(r.outfits.length).toBeGreaterThan(3);
    for (const o of r.outfits) {
      expect(o.features.color).toBeGreaterThanOrEqual(0.5);
      expect(o.features.patternBalance).toBe(1); // never print with floral or check
    }
    // A closet of clashes still gets dressed.
    const clashes = deal(input([items[0], items[1], items[6]]));
    expect(clashes.outfits.length).toBe(1);
    expect(clashes.colorRelaxed).toBe(true);
  });
});

describe("pick my outfit", () => {
  it("returns the single best outfit and a reason", () => {
    const { outfit, result } = pickOutfit(input(capsule()));
    expect(outfit).not.toBeNull();
    expect(outfit!.signature).toBe(deal(input(capsule())).outfits[0].signature);
    expect(outfit!.reason).toMatch(/\.$/);
    expect(result.outfits.length).toBe(1);
  });

  it("show another: clearly different from everything shown, until it runs out", () => {
    const items = syntheticCloset();
    const shown: string[] = [];
    const cores: string[][] = [];
    for (let i = 0; i < 6; i++) {
      const { outfit } = pickAnother(input(items, { seed: i }), shown);
      expect(outfit).not.toBeNull();
      for (const c of cores) expect(overlap(coreIds(outfit!), c)).toBeLessThanOrEqual(1);
      expect(outfit!.diverse).toBe(true);
      shown.push(outfit!.signature);
      cores.push(coreIds(outfit!));
    }
  });

  it("prefers a different colour story or template for another", () => {
    const first = pickOutfit(input(capsule())).outfit!;
    const next = pickAnother(input(capsule()), [first.signature]).outfit!;
    expect(next.signature).not.toBe(first.signature);
  });

  it("a picker ranks once and gives the same answers", () => {
    const picker = createPicker(input(syntheticCloset()));
    const a = picker.pick();
    expect(a.outfit!.signature).toBe(pickOutfit(input(syntheticCloset())).outfit!.signature);
    const b = picker.another([a.outfit!.signature]);
    expect(b.outfit!.signature).toBe(pickAnother(input(syntheticCloset()), [a.outfit!.signature]).outfit!.signature);
  });
});

describe("outfits with this", () => {
  it("returns up to n outfits that all include the item", () => {
    const list = outfitsWith("camel-jacket", input(capsule()));
    expect(list.length).toBe(6);
    for (const o of list) expect(o.itemIds).toContain("camel-jacket");
    expect(new Set(list.map((o) => o.signature)).size).toBe(6);
    expect(outfitsWith("nope", input(capsule()))).toEqual([]);
  });
});

describe("performance", () => {
  it("deals a 300 item closet in under 50 ms (median of 5)", () => {
    const items = syntheticCloset();
    expect(items.length).toBe(300);
    deal(input(items, { weather: weather({ feelsMax: 12 }) })); // warm up the JIT
    for (const feelsMax of [12, 3]) {
      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        deal(input(items, { seed: i, weather: weather({ feelsMax, precipProb: 70 }) }));
        times.push(performance.now() - t);
      }
      times.sort((a, b) => a - b);
      expect(times[2]).toBeLessThan(50);
    }
  });
});
