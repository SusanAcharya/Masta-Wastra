import { describe, expect, it } from "vitest";
import { bandFor, isRainy, isWideRange, layerFit, layersMet, targetFor, totalWarmth, warmthFit, weatherFlags } from "@/engine/warmth";
import { weather } from "./_fixtures";

describe("temperature bands", () => {
  it.each([
    [-0.1, "freezing"],
    [0, "cold"],
    [7.9, "cold"],
    [8, "cool"],
    [14.9, "cool"],
    [15, "mild"],
    [20.9, "mild"],
    [21, "warm"],
    [26.9, "warm"],
    [27, "hot"],
  ] as const)("feelsMax %s is %s", (t, band) => {
    expect(bandFor(t)).toBe(band);
  });

  it("has the target ranges from the table", () => {
    expect(targetFor("hot")).toMatchObject({ lo: 1, hi: 3, mid: 2, span: 2 });
    expect(targetFor("cool")).toMatchObject({ lo: 6, hi: 9, mid: 7.5 });
    expect(targetFor("freezing")).toMatchObject({ lo: 11, hi: 15 });
  });
});

describe("total warmth", () => {
  it("adds top, bottom, mid and outer, and half the shoes", () => {
    expect(totalWarmth({ base: { warmth: 1 }, bottom: { warmth: 2 }, shoes: { warmth: 2 } })).toBe(4);
    expect(
      totalWarmth({ base: { warmth: 2 }, bottom: { warmth: 2 }, mid: { warmth: 3 }, outer: { warmth: 4 }, shoes: { warmth: 3 } }),
    ).toBe(12.5);
    expect(totalWarmth({ base: { warmth: 2 }, shoes: { warmth: 1 } })).toBe(2.5); // a dress
  });

  it("scores warmth fit around the target middle", () => {
    expect(warmthFit(2, "hot")).toBe(1);
    expect(warmthFit(3, "hot")).toBe(0.5); // edge of the range
    expect(warmthFit(4, "hot")).toBe(0);
    expect(warmthFit(10, "hot")).toBe(0); // clamped
    expect(warmthFit(7.5, "cool")).toBe(1);
  });
});

describe("layers", () => {
  it("requires layers per band", () => {
    expect(layersMet("hot", { topIsMid: false, hasMid: false })).toBe(true);
    expect(layersMet("mild", { topIsMid: false, hasMid: false })).toBe(false);
    expect(layersMet("mild", { topIsMid: false, hasMid: true })).toBe(true);
    expect(layersMet("mild", { topIsMid: false, hasMid: false, outerWarmth: 2 })).toBe(true);
    expect(layersMet("cool", { topIsMid: false, hasMid: false, outerWarmth: 2 })).toBe(false);
    expect(layersMet("cool", { topIsMid: false, hasMid: true, outerWarmth: 2 })).toBe(true);
    expect(layersMet("cool", { topIsMid: false, hasMid: false, outerWarmth: 3 })).toBe(true);
    expect(layersMet("cold", { topIsMid: true, hasMid: false, outerWarmth: 4 })).toBe(true); // sweater + coat
    expect(layersMet("cold", { topIsMid: false, hasMid: true, outerWarmth: 3 })).toBe(false);
    expect(layersMet("freezing", { topIsMid: false, hasMid: true, outerWarmth: 4 })).toBe(false);
    expect(layersMet("freezing", { topIsMid: false, hasMid: true, outerWarmth: 5 })).toBe(true);
  });

  it("applies the shed rule on wide range days", () => {
    expect(isWideRange(weather({ feelsMax: 20, feelsMin: 10 }))).toBe(true);
    expect(isWideRange(weather({ feelsMax: 20, feelsMin: 10.1 }))).toBe(false);
    expect(layerFit(true, false, false)).toBe(1);
    expect(layerFit(false, false, true)).toBe(0);
    expect(layerFit(true, true, true)).toBe(1);
    expect(layerFit(true, true, false)).toBe(0.5);
    expect(layerFit(false, true, true)).toBe(0.5);
    expect(layerFit(false, true, false)).toBe(0);
  });
});

describe("weather flags", () => {
  it("detects rain, wind and hot UV", () => {
    expect(isRainy(weather({ feelsMax: 18, precipProb: 50 }))).toBe(true);
    expect(isRainy(weather({ feelsMax: 18, precipProb: 49, precipMm: 2 }))).toBe(true);
    expect(isRainy(weather({ feelsMax: 18, precipProb: 49, precipMm: 1.9 }))).toBe(false);
    expect(weatherFlags(weather({ feelsMax: 18, windMax: 35 })).wind).toBe(true);
    expect(weatherFlags(weather({ feelsMax: 30, uvMax: 7 })).hotUv).toBe(true);
    expect(weatherFlags(weather({ feelsMax: 25, uvMax: 9 })).hotUv).toBe(false);
  });
});
