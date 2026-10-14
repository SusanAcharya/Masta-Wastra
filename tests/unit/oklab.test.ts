import { describe, expect, it } from "vitest";
import { hexToOklch, hueDelta, nearestColorName, oklabToHex, hexToOklab } from "@/lib/oklab";

describe("oklab", () => {
  it("matches reference values", () => {
    const red = hexToOklch("#ff0000");
    expect(red.L).toBeCloseTo(0.628, 3);
    expect(red.C).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
    expect(hexToOklch("#ffffff").L).toBeCloseTo(1, 3);
    expect(hexToOklch("#000000").L).toBeCloseTo(0, 3);
    expect(hexToOklch("#808080").C).toBeLessThan(0.001);
  });

  it("round trips hex through OKLab", () => {
    for (const hex of ["#1f2a44", "#b98a56", "#9d4b2c", "#f4f3ef"]) expect(oklabToHex(hexToOklab(hex))).toBe(hex);
  });

  it("measures hue distance the short way round", () => {
    expect(hueDelta(350, 10)).toBe(20);
    expect(hueDelta(0, 180)).toBe(180);
  });

  it("names measured colours from the 24 name palette", () => {
    expect(nearestColorName("#1d2943")).toBe("navy");
    expect(nearestColorName("#ba8b57")).toBe("camel");
    expect(nearestColorName("#fafafa")).toBe("white");
  });
});
