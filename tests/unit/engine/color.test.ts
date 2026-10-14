import { describe, expect, it } from "vitest";
import {
  HARMONY,
  colorHarmony,
  colorIsNeutral,
  harmonyKind,
  hueHarmony,
  isBoldPattern,
  isNeutralItem,
  itemPalette,
  outfitColor,
} from "@/engine/color";
import { hexToOklch } from "@/lib/oklab";
import { HEX, item, scoreOutfit } from "./_fixtures";

const point = (hex: string, neutral = colorIsNeutral(hex)) => itemPalette(item({ subtype: "tshirt", hex, neutralOverride: true, isNeutral: neutral }))[0];

describe("hex to OKLCH", () => {
  it("matches known values", () => {
    const red = hexToOklch("#ff0000");
    expect(red.L).toBeCloseTo(0.628, 3);
    expect(red.C).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
    const navy = hexToOklch(HEX.navy);
    expect(navy.L).toBeLessThan(0.35);
    expect(navy.h).toBeGreaterThan(240);
    expect(navy.h).toBeLessThan(275);
  });
});

describe("neutral detection", () => {
  it("finds black, white, grey by chroma", () => {
    for (const hex of ["#000000", "#ffffff", "#808080", HEX.black, HEX.white, HEX.grey, HEX.charcoal]) expect(colorIsNeutral(hex)).toBe(true);
  });
  it("finds navy by the navy rule", () => {
    expect(colorIsNeutral(HEX.navy)).toBe(true);
    expect(colorIsNeutral(HEX.blue)).toBe(false); // too light and too chromatic
  });
  it("finds camel, beige, khaki and brown by the earth tone rule", () => {
    for (const hex of [HEX.camel, HEX.beige, HEX.khaki, HEX.cream, HEX.brown]) expect(colorIsNeutral(hex)).toBe(true);
    expect(colorIsNeutral(HEX.orange)).toBe(false); // hue 50 but chroma 0.15
    expect(colorIsNeutral(HEX.yellow)).toBe(false);
  });
  it("treats low chroma olive as neutral", () => {
    expect(colorIsNeutral(HEX.olive)).toBe(true);
    expect(colorIsNeutral(HEX.green)).toBe(false);
  });
  it("treats denim as neutral by subtype or colour name", () => {
    expect(colorIsNeutral(HEX.denim)).toBe(false);
    expect(isNeutralItem(item({ subtype: "jeans", hex: HEX.denim }))).toBe(true);
    expect(isNeutralItem(item({ subtype: "jacket", hex: HEX.denim, colorName: "denim" }))).toBe(true);
    expect(isNeutralItem(item({ subtype: "tshirt", hex: HEX.denim, colorName: "blue" }))).toBe(false);
  });
  it("lets the user override win", () => {
    expect(isNeutralItem(item({ subtype: "tshirt", hex: HEX.red, neutralOverride: true, isNeutral: true }))).toBe(true);
    expect(isNeutralItem(item({ subtype: "jeans", hex: HEX.denim, neutralOverride: true, isNeutral: false }))).toBe(false);
  });
});

describe("pair harmony", () => {
  it("hue table edges at 30, 110 and 150", () => {
    expect(hueHarmony(0)).toBe(HARMONY.analogous);
    expect(hueHarmony(30)).toBe(HARMONY.analogous);
    expect(hueHarmony(30.01)).toBe(HARMONY.awkward);
    expect(hueHarmony(109.99)).toBe(HARMONY.awkward);
    expect(hueHarmony(110)).toBe(HARMONY.split);
    expect(hueHarmony(149.99)).toBe(HARMONY.split);
    expect(hueHarmony(150)).toBe(HARMONY.complementary);
    expect(hueHarmony(180)).toBe(HARMONY.complementary);
  });
  it("neutral with anything is 0.9, neutral with neutral 0.75", () => {
    expect(colorHarmony(point(HEX.navy), point(HEX.red))).toBe(0.9);
    expect(colorHarmony(point(HEX.grey), point(HEX.camel))).toBe(0.75);
  });
  it("two neutrals with clear lightness contrast score a little higher", () => {
    expect(harmonyKind(point(HEX.navy), point(HEX.khaki))).toBe("neutralContrast");
    expect(harmonyKind(point(HEX.black), point(HEX.white))).toBe("neutralContrast");
  });
  it("complementary, split and awkward from real colours", () => {
    expect(harmonyKind(point(HEX.red), point(HEX.teal))).toBe("complementary"); // Δh ≈ 165
    expect(harmonyKind(point(HEX.green), point(HEX.blue))).toBe("split"); // Δh ≈ 112
    expect(harmonyKind(point(HEX.red), point(HEX.yellow))).toBe("awkward"); // Δh ≈ 68
  });
  it("tonal: same hue with ΔL ≥ 0.25 beats plain analogous", () => {
    const darkRed = point("#6d1f2c"); // burgundy, h ≈ 15
    const lightRed = point("#e8a0a0"); // light red, h ≈ 20
    expect(harmonyKind(darkRed, lightRed)).toBe("tonal");
    expect(colorHarmony(darkRed, lightRed)).toBe(HARMONY.tonal);
  });
  it("same colour twice is an echo", () => {
    expect(harmonyKind(point(HEX.white), point("#f2f2ee"))).toBe("echo");
  });
  it("near misses score below both a clear match and a clear contrast", () => {
    const nearMiss = colorHarmony(point(HEX.navy), point(HEX.black));
    const beiges = colorHarmony(point(HEX.beige), point(HEX.cream));
    expect(harmonyKind(point(HEX.red), point(HEX.orange))).toBe("nearMiss");
    expect(harmonyKind(point(HEX.white), point(HEX.cream))).toBe("nearMiss");
    expect(harmonyKind(point(HEX.grey), point(HEX.camel))).toBe("neutralPair"); // same lightness, different family
    expect(harmonyKind(point(HEX.navy), point(HEX.black))).toBe("nearMiss");
    expect(harmonyKind(point(HEX.beige), point(HEX.cream))).toBe("nearMiss");
    const match = colorHarmony(point(HEX.navy), point("#1f2a46"));
    const contrast = colorHarmony(point(HEX.navy), point(HEX.khaki));
    for (const x of [nearMiss, beiges]) {
      expect(x).toBeLessThan(match);
      expect(x).toBeLessThan(contrast);
    }
  });
});

describe("outfit colour score", () => {
  it("navy oxford + khaki chinos + white sneakers beats navy top + black trousers + brown boots", () => {
    const good = scoreOutfit({
      base: item({ subtype: "shirt", hex: HEX.navy }),
      bottom: item({ subtype: "chinos", hex: HEX.khaki }),
      shoes: item({ subtype: "sneakers", hex: HEX.white }),
    });
    const bad = scoreOutfit({
      base: item({ subtype: "shirt", hex: HEX.navy }),
      bottom: item({ subtype: "trousers", hex: HEX.black }),
      shoes: item({ subtype: "boots", hex: HEX.brown }),
    });
    expect(good.features.color).toBeGreaterThan(bad.features.color + 0.1);
    expect(good.score).toBeGreaterThan(bad.score);
  });

  it("a red top pairs with neutral bottoms over an orange skirt", () => {
    const top = item({ subtype: "blouse", hex: HEX.red });
    const shoes = item({ subtype: "flats", hex: HEX.camel });
    const withNavy = scoreOutfit({ base: top, bottom: item({ subtype: "skirt", hex: HEX.navy }), shoes });
    const withOrange = scoreOutfit({ base: top, bottom: item({ subtype: "skirt", hex: HEX.orange }), shoes });
    expect(withNavy.color.oneAccent).toBe(true);
    expect(withNavy.features.color).toBeGreaterThan(withOrange.features.color);
    expect(withNavy.score).toBeGreaterThan(withOrange.score);
  });

  it("uses the full palette: white sneakers pick up the white stripe", () => {
    const striped = item({
      subtype: "shirt",
      pattern: "stripe",
      colors: [
        { hex: HEX.navy, name: "navy", share: 0.6 },
        { hex: HEX.white, name: "white", share: 0.4 },
      ],
    });
    const chinos = item({ subtype: "chinos", hex: HEX.khaki });
    const white = scoreOutfit({ base: striped, bottom: chinos, shoes: item({ subtype: "sneakers", hex: HEX.white }) });
    const black = scoreOutfit({ base: striped, bottom: chinos, shoes: item({ subtype: "sneakers", hex: HEX.black }) });
    expect(white.color.patternEcho).toBe(true);
    expect(white.features.color).toBeGreaterThan(black.features.color);
  });

  it("two bold patterns clash; one pattern with solids does not", () => {
    const stripe = item({ subtype: "shirt", hex: HEX.navy, pattern: "stripe" });
    const shoes = item({ subtype: "sneakers", hex: HEX.white });
    const clash = scoreOutfit({ base: stripe, bottom: item({ subtype: "skirt", hex: HEX.khaki, pattern: "floral" }), shoes });
    const calm = scoreOutfit({ base: stripe, bottom: item({ subtype: "skirt", hex: HEX.khaki, pattern: "texture" }), shoes });
    expect(clash.color.patternClash).toBe(true);
    expect(calm.color.patternClash).toBe(false);
    expect(calm.features.color - clash.features.color).toBeCloseTo(0.2, 5);
    expect(isBoldPattern("texture")).toBe(false);
    expect(isBoldPattern("check")).toBe(true);
  });

  it("colourful shoes must echo the outfit", () => {
    const top = item({ subtype: "tshirt", hex: HEX.green });
    const jeans = item({ subtype: "jeans", hex: HEX.denim });
    const echo = scoreOutfit({ base: top, bottom: jeans, shoes: item({ subtype: "sneakers", hex: "#3f7a48" }) });
    const off = scoreOutfit({ base: top, bottom: jeans, shoes: item({ subtype: "sneakers", hex: HEX.purple }) });
    expect(echo.color.shoesOffPalette).toBe(false);
    expect(off.color.shoesOffPalette).toBe(true);
    expect(echo.features.color).toBeGreaterThan(off.features.color);
  });

  it("applies the accent bonus and the extra accent penalty", () => {
    const n = (hex: string) => ({ palette: [point(hex)], neutral: colorIsNeutral(hex), bold: false, isShoes: false });
    const one = outfitColor([n(HEX.red), n(HEX.navy), n(HEX.white)]);
    expect(one.oneAccent).toBe(true);
    const four = outfitColor([n(HEX.red), n(HEX.green), n(HEX.blue), n(HEX.yellow)]);
    expect(four.nonNeutral).toBe(4);
    expect(four.score).toBeCloseTo(Math.max(0, four.meanHarmony - 0.3), 5);
    expect(one.score).toBeLessThanOrEqual(1);
  });
});
