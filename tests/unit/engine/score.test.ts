import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, FEATURE_KEYS } from "@/engine/types";
import { displayScore, effectiveWeights, pairKey, sMaxOf } from "@/engine/score";
import { HEX, item, scoreOutfit, weather } from "./_fixtures";

const navyShirt = () => item({ subtype: "shirt", hex: HEX.navy, vibes: ["smart"] });
const chinos = () => item({ subtype: "chinos", hex: HEX.khaki, vibes: ["smart"] });
const sneakers = () => item({ subtype: "sneakers", hex: HEX.white, vibes: ["casual"] });

describe("features", () => {
  it("are all within 0..1", () => {
    const r = scoreOutfit({ base: navyShirt(), bottom: chinos(), shoes: sneakers() });
    for (const k of FEATURE_KEYS) {
      expect(r.features[k]).toBeGreaterThanOrEqual(0);
      expect(r.features[k]).toBeLessThanOrEqual(1);
    }
  });

  it("warmthFit follows total warmth against the band", () => {
    const hot = weather({ feelsMax: 30 });
    const light = scoreOutfit({ base: item({ subtype: "tshirt", warmth: 1 }), bottom: item({ subtype: "shorts", warmth: 1 }), shoes: item({ subtype: "sandals", warmth: 2 }) }, { weather: hot });
    expect(light.totalWarmth).toBe(3);
    expect(light.features.warmthFit).toBe(0.5);
  });

  it("layerFit is 1 when the band's layers are met, else 0", () => {
    const cool = weather({ feelsMax: 12, feelsMin: 8 });
    const base = { base: navyShirt(), bottom: chinos(), shoes: sneakers() };
    expect(scoreOutfit(base, { weather: cool }).features.layerFit).toBe(0);
    expect(scoreOutfit({ ...base, outer: item({ subtype: "jacket", warmth: 3 }) }, { weather: cool }).features.layerFit).toBe(1);
  });

  it("layerFit and warmthFit on a wide range day reward a layer you can shed", () => {
    const wide = weather({ feelsMax: 24, feelsMin: 12 });
    const base = { base: item({ subtype: "tshirt", warmth: 1 }), bottom: chinos(), shoes: sneakers() };
    const without = scoreOutfit(base, { weather: wide });
    const withJacket = scoreOutfit({ ...base, outer: item({ subtype: "jacket", warmth: 2 }) }, { weather: wide });
    expect(without.features.layerFit).toBe(0.5);
    expect(withJacket.features.layerFit).toBe(1);
    expect(withJacket.features.warmthFit).toBe(without.features.warmthFit); // it can come off
  });

  it("occasionFit is the share of core items whose primary vibe is ideal", () => {
    const r = scoreOutfit({ base: navyShirt(), bottom: chinos(), shoes: sneakers() }, { occasion: "work" });
    expect(r.features.occasionFit).toBeCloseTo(2 / 3, 5);
  });

  it("rainFit counts only on rain days, and only waterproof or closed pieces", () => {
    const rain = weather({ feelsMax: 14, precipProb: 80 });
    const base = { base: navyShirt(), bottom: chinos() };
    const ready = scoreOutfit(
      { ...base, outer: item({ subtype: "raincoat", waterproof: true }), shoes: item({ subtype: "boots", waterproof: true }) },
      { weather: rain },
    );
    const open = scoreOutfit({ ...base, shoes: item({ subtype: "sandals" }) }, { weather: rain });
    const suede = scoreOutfit({ ...base, shoes: item({ subtype: "loafers", name: "Suede loafers" }) }, { weather: rain });
    expect(ready.features.rainFit).toBe(1);
    expect(open.features.rainFit).toBe(0);
    expect(suede.features.rainFit).toBe(0);
    expect(ready.breakdown.rainFit).toBe(DEFAULT_WEIGHTS.rainFit);
    const dry = scoreOutfit({ ...base, shoes: item({ subtype: "sandals" }) });
    expect(dry.features.rainFit).toBe(1);
    expect(dry.breakdown.rainFit).toBe(0); // weight 0 on dry days
  });

  it("neverWornBoost: never worn and older than 7 days, ×3 while boosted", () => {
    const old = item({ subtype: "shirt", hex: HEX.navy, createdAt: "2026-10-01T10:00:00.000Z" });
    const fresh = item({ subtype: "shirt", hex: HEX.navy, createdAt: "2026-10-10T10:00:00.000Z" });
    const rest = { bottom: chinos(), shoes: sneakers() };
    const worn = [{ localDate: "2026-09-20", itemIds: [rest.bottom.id, rest.shoes.id] }];
    expect(scoreOutfit({ base: old, ...rest }, { wears: worn }).features.neverWornBoost).toBe(1);
    expect(scoreOutfit({ base: fresh, ...rest }, { wears: worn }).features.neverWornBoost).toBe(0);
    const boosted = scoreOutfit({ base: old, ...rest }, { wears: worn, neverWornBoostActive: true });
    expect(boosted.breakdown.neverWornBoost).toBeCloseTo(DEFAULT_WEIGHTS.neverWornBoost * 3, 10);
  });

  it("patternBalance is 0 with two bold patterns", () => {
    const r = scoreOutfit({
      base: item({ subtype: "shirt", pattern: "check" }),
      bottom: item({ subtype: "skirt", pattern: "floral" }),
      shoes: sneakers(),
    });
    expect(r.features.patternBalance).toBe(0);
    expect(r.color.patternClash).toBe(true);
  });

  it("vibeCohesion is the mean pairwise Jaccard of vibes", () => {
    const r = scoreOutfit({
      base: item({ subtype: "shirt", vibes: ["smart", "casual"] }),
      bottom: item({ subtype: "chinos", vibes: ["smart"] }),
      shoes: item({ subtype: "loafers", vibes: ["smart"] }),
    });
    expect(r.features.vibeCohesion).toBeCloseTo((0.5 + 0.5 + 1) / 3, 10);
  });
});

describe("repeat penalty", () => {
  const top = navyShirt();
  const bottom = chinos();
  const shoes = sneakers();
  const outfit = { base: top, bottom, shoes };
  const wearOn = (daysAgo: number, ids = [top.id, bottom.id, shoes.id]) => {
    const d = new Date(Date.UTC(2026, 9, 14 - daysAgo)).toISOString().slice(0, 10);
    return [{ localDate: d, itemIds: ids }];
  };

  it("same outfit: 1 - daysAgo/14", () => {
    for (const d of [2, 7, 13]) {
      const r = scoreOutfit(outfit, { wears: wearOn(d) });
      const items = Math.min(1, d < 7 ? 3 * 0.15 * (1 - d / 7) : 0);
      expect(r.features.freshness).toBeCloseTo(1 - Math.max(1 - d / 14, items), 10);
    }
    expect(scoreOutfit(outfit, { wears: wearOn(14) }).features.freshness).toBe(1);
  });

  it("item repeat: 0.15 × (1 - daysAgo/7) per core item, capped at 1", () => {
    const r = scoreOutfit(outfit, { wears: wearOn(3, [top.id]) });
    expect(r.features.freshness).toBeCloseTo(1 - 0.15 * (1 - 3 / 7), 10);
    expect(scoreOutfit(outfit, { wears: wearOn(7, [top.id]) }).features.freshness).toBe(1);
  });

  it("an item kept from yesterday by the small closet rule costs extra", () => {
    const r = scoreOutfit(outfit, { wears: wearOn(1, [top.id]) });
    expect(r.features.freshness).toBeCloseTo(1 - (0.15 * (6 / 7) + 0.5), 10);
  });

  it("swapping an accessory does not make an outfit fresh", () => {
    const bag = item({ subtype: "bag", hex: HEX.black });
    const r = scoreOutfit({ ...outfit, accessory: bag }, { wears: wearOn(2) });
    expect(r.features.freshness).toBeCloseTo(1 - (1 - 2 / 14), 10);
  });
});

describe("totals", () => {
  it("adds clamped, scaled affinities", () => {
    const top = navyShirt();
    const bottom = chinos();
    const shoes = sneakers();
    const plain = scoreOutfit({ base: top, bottom, shoes });
    const liked = scoreOutfit(
      { base: top, bottom, shoes },
      {
        weights: {
          w: { ...DEFAULT_WEIGHTS },
          itemAffinity: { [top.id]: 5 }, // clamped to 1
          pairAffinity: { [pairKey(top.id, bottom.id)]: -0.5 },
        },
      },
    );
    expect(liked.score - plain.score).toBeCloseTo(0.5 * 1 + 0.7 * -0.5, 10);
    expect(liked.breakdown.itemAffinity).toBeCloseTo(0.5, 10);
  });

  it("display score is 0..100 of S_max", () => {
    const w = effectiveWeights(DEFAULT_WEIGHTS, false);
    const sMax = sMaxOf(w);
    expect(sMax).toBeCloseTo(3 + 3 + 1.5 + 2 + 2 + 0 + 0.6 + 1 + 1, 10);
    expect(displayScore(sMax / 2, sMax)).toBe(50);
    expect(displayScore(sMax * 2, sMax)).toBe(100);
    expect(displayScore(-1, sMax)).toBe(0);
    expect(effectiveWeights(DEFAULT_WEIGHTS, true).rainFit).toBe(1.5);
  });

  it("a weak colour match is pushed down by the colour guard", () => {
    const r = scoreOutfit({
      base: item({ subtype: "tshirt", hex: HEX.red }),
      bottom: item({ subtype: "skirt", hex: HEX.green, pattern: "floral" }),
      shoes: item({ subtype: "sneakers", hex: HEX.purple, pattern: "print" }),
    });
    expect(r.features.color).toBeLessThan(0.5);
    expect(r.breakdown.colorGuard).toBeLessThan(0);
  });
});
