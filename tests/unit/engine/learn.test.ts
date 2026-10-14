import { describe, expect, it } from "vitest";
import { deal, outfitsWith, type DealInput } from "@/engine/deal";
import {
  AFFINITY_DECAY,
  applyFeedback,
  decayIfDue,
  defaultTaste,
  learningRate,
  meanFeatures,
  resetTaste,
} from "@/engine/learn";
import { pairKey } from "@/engine/score";
import { DEFAULT_WEIGHTS, FEATURE_KEYS, type FeatureVector, type Item, type Weights } from "@/engine/types";
import { HEX, TODAY, capsule, item, scoreOutfit, weather } from "./_fixtures";

const AT = "2026-10-14T07:00:00.000Z";
const fv = (patch: Partial<FeatureVector> = {}): FeatureVector => ({
  ...(Object.fromEntries(FEATURE_KEYS.map((k) => [k, 0.5])) as FeatureVector),
  ...patch,
});

describe("updates", () => {
  it("decays the learning rate with the number of signals", () => {
    expect(learningRate(0)).toBe(0.08);
    expect(learningRate(50)).toBe(0.04);
    expect(learningRate(150)).toBe(0.02);
  });

  it("centres on the deal mean: only features above the mean gain weight", () => {
    const w0 = defaultTaste(AT);
    const w1 = applyFeedback(w0, { signal: "up", features: fv({ color: 0.9, warmthFit: 0.5 }), dealMean: fv({ color: 0.6 }), itemIds: [] });
    expect(w1.w.color).toBeCloseTo(3 + 0.08 * 0.7 * 0.3, 12);
    expect(w1.w.warmthFit).toBe(3); // equal to the mean: unchanged
    const w2 = applyFeedback(w0, { signal: "down", features: fv({ color: 0.9 }), dealMean: fv({ color: 0.6 }), itemIds: [] });
    expect(w2.w.color).toBeCloseTo(3 - 0.08 * 0.8 * 0.3, 12);
    expect(w2.signals).toBe(1);
  });

  it("leaves weights alone without a deal mean", () => {
    const w1 = applyFeedback(defaultTaste(AT), { signal: "wear", features: fv({ color: 1 }), itemIds: ["a"] });
    expect(w1.w).toEqual(DEFAULT_WEIGHTS);
    expect(w1.itemAffinity.a).toBeCloseTo(0.1, 12);
  });

  it("clamps weights to 0.2 to 3 times the default", () => {
    let w: Weights = defaultTaste(AT);
    for (let i = 0; i < 2000; i++)
      w = applyFeedback(w, { signal: "wear", features: fv({ color: 1, layerFit: 0 }), dealMean: fv({ color: 0, layerFit: 1 }), itemIds: [] });
    expect(w.w.color).toBe(3 * DEFAULT_WEIGHTS.color);
    expect(w.w.layerFit).toBeCloseTo(0.2 * DEFAULT_WEIGHTS.layerFit, 12);
  });

  it("moves item and pair affinities by reward and clamps them", () => {
    let w: Weights = defaultTaste(AT);
    w = applyFeedback(w, { signal: "up", features: fv(), itemIds: ["b", "a"] });
    expect(w.itemAffinity).toEqual({ a: 0.1 * 0.7, b: 0.1 * 0.7 });
    expect(w.pairAffinity[pairKey("a", "b")]).toBeCloseTo(0.15 * 0.7, 12);
    expect(Object.keys(w.pairAffinity)).toEqual(["a|b"]);
    for (let i = 0; i < 20; i++) w = applyFeedback(w, { signal: "down", features: fv(), itemIds: ["a", "b"] });
    expect(w.itemAffinity.a).toBe(-1);
    expect(w.pairAffinity["a|b"]).toBe(-1);
    expect(applyFeedback(w, { signal: "skip", features: fv(), itemIds: ["a"] }).itemAffinity.a).toBe(-1);
  });

  it("averages features for the deal mean", () => {
    expect(meanFeatures([fv({ color: 0 }), fv({ color: 1 })]).color).toBe(0.5);
    expect(meanFeatures([]).color).toBe(0);
  });
});

describe("decay and reset", () => {
  const liked: Weights = { ...defaultTaste(AT), itemAffinity: { a: 0.8, b: 0.0005 }, pairAffinity: { "a|b": -0.6 } };

  it("starts the clock on the first call", () => {
    const w = decayIfDue(liked, AT);
    expect(w.decayedAt).toBe(AT);
    expect(w.itemAffinity).toEqual(liked.itemAffinity);
  });

  it("decays affinities 5% per whole week toward 0", () => {
    const start = { ...liked, decayedAt: AT };
    expect(decayIfDue(start, "2026-10-20T07:00:00.000Z")).toBe(start); // 6 days: not due
    const week = decayIfDue(start, "2026-10-21T08:00:00.000Z");
    expect(week.itemAffinity.a).toBeCloseTo(0.8 * (1 - AFFINITY_DECAY), 12);
    expect(week.pairAffinity["a|b"]).toBeCloseTo(-0.6 * 0.95, 12);
    expect(week.itemAffinity.b).toBeUndefined(); // tiny values are dropped
    expect(week.decayedAt).toBe("2026-10-21T07:00:00.000Z"); // the weekly cadence is kept
    const twoWeeks = decayIfDue(start, "2026-10-28T07:00:00.000Z");
    expect(twoWeeks.itemAffinity.a).toBeCloseTo(0.8 * 0.95 ** 2, 12);
  });

  it("resets to the defaults", () => {
    const w = resetTaste("2026-10-15T00:00:00.000Z", liked);
    expect(w.w).toEqual(DEFAULT_WEIGHTS);
    expect(w.itemAffinity).toEqual({});
    expect(w.pairAffinity).toEqual({});
    expect(w.signals).toBe(0);
  });
});

describe("behaviour (8.6)", () => {
  const base = (items: Item[], weights?: Weights): DealInput => ({
    items,
    weights,
    weather: weather({ feelsMax: 18 }),
    occasion: "casual",
    localDate: TODAY,
    seed: 5,
  });

  it("10 thumbs up on high contrast outfits: colour weight unchanged, contrast pairs rank higher", () => {
    // Three all neutral looks with the same S_color (every pair a clear neutral contrast).
    const hc = [
      item({ id: "black-tee", subtype: "tshirt", hex: HEX.black, vibes: ["street"] }),
      item({ id: "white-trousers", subtype: "trousers", hex: HEX.white, vibes: ["street"] }),
      item({ id: "grey-sneakers", subtype: "sneakers", hex: HEX.grey, vibes: ["street"] }),
    ];
    const b = [
      item({ id: "navy-tee", subtype: "tshirt", hex: HEX.navy }),
      item({ id: "grey-trousers", subtype: "trousers", hex: HEX.grey }),
      item({ id: "cream-sneakers", subtype: "sneakers", hex: HEX.cream }),
    ];
    const c = [
      item({ id: "charcoal-tee", subtype: "tshirt", hex: HEX.charcoal }),
      item({ id: "white-chinos", subtype: "chinos", hex: HEX.white }),
      item({ id: "khaki-sneakers", subtype: "sneakers", hex: HEX.khaki }),
    ];
    const outfit = (x: Item[]) => scoreOutfit({ base: x[0], bottom: x[1], shoes: x[2] });
    const shown = [hc, b, c].map(outfit);
    expect(new Set(shown.map((s) => s.features.color)).size).toBe(1);
    const mean = meanFeatures(shown.map((s) => s.features));

    const items = [...hc, ...b, ...c];
    const hcSig = hc.map((i) => i.id).sort().join("|");
    const rankOf = (w?: Weights) => {
      const r = deal({ ...base(items, w), n: 27 });
      return r.outfits.findIndex((o) => o.coreSignature === hcSig);
    };
    const before = rankOf();
    expect(before).toBeGreaterThan(0);

    let w: Weights = defaultTaste(AT);
    for (let i = 0; i < 10; i++) w = applyFeedback(w, { signal: "up", features: shown[0].features, dealMean: mean, itemIds: hc.map((x) => x.id) });
    expect(w.w.color).toBe(DEFAULT_WEIGHTS.color);
    expect(w.pairAffinity[pairKey("black-tee", "white-trousers")]).toBeCloseTo(1, 12);
    expect(rankOf(w)).toBe(0);
    expect(deal(base(items, w)).outfits[0].coreSignature).toBe(hcSig);
  });

  it("10 thumbs down on an item: gone from the top 3, unless there is no alternative", () => {
    const target = "white-sneakers";
    const items = capsule();
    const contains = (w?: Weights) => deal(base(items, w)).outfits.some((o) => o.itemIds.includes(target));
    expect(contains()).toBe(true);

    const downvote = (list: Item[]) => {
      let w: Weights = defaultTaste(AT);
      for (let i = 0; i < 10; i++) {
        const r = deal(base(list, w));
        const card = r.outfits.find((o) => o.itemIds.includes(target)) ?? outfitsWith(target, base(list, w), 1)[0];
        w = applyFeedback(w, {
          signal: "down",
          features: card.features,
          dealMean: meanFeatures(r.outfits.map((o) => o.features)),
          itemIds: card.itemIds,
        });
      }
      return w;
    };

    expect(contains(downvote(items))).toBe(false);

    // The only pair of shoes: it still has to appear.
    const onlyShoes = items.filter((i) => i.category !== "shoes" || i.id === target);
    const w = downvote(onlyShoes);
    expect(w.itemAffinity[target]).toBeCloseTo(-0.8, 12);
    const r = deal(base(onlyShoes, w));
    expect(r.outfits.length).toBeGreaterThan(0);
    for (const o of r.outfits) expect(o.itemIds).toContain(target);
  });
});
