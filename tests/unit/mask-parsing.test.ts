import { describe, expect, it } from "vitest";
import type { Pixels } from "@/lib/colors";
import { applyGarmentMask, cleanAlpha } from "@/lib/mask";
import { readParse } from "@/lib/parsing";

function frame(w: number, h: number, paint: (x: number, y: number) => number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([100, 60, 50, paint(x, y)], (y * w + x) * 4);
  return { data, width: w, height: h };
}
const alphaAt = (px: Pixels, x: number, y: number) => px.data[(y * px.width + x) * 4 + 3];

describe("cleanAlpha", () => {
  it("removes specks and faint haze, keeps the garment and its soft edge", () => {
    const px = frame(100, 100, (x, y) => {
      if (x >= 30 && x < 70 && y >= 20 && y < 90) return 255; // garment
      if (x === 70 && y >= 20 && y < 90) return 90; // its antialiased edge
      if (x >= 5 && x < 8 && y >= 5 && y < 8) return 255; // a speck
      if (y === 95) return 20; // haze
      return 0;
    });
    const r = cleanAlpha(px);
    expect(r.kept).toBe(1);
    expect(alphaAt(px, 50, 50)).toBe(255);
    expect(alphaAt(px, 70, 50)).toBe(90);
    expect(alphaAt(px, 6, 6)).toBe(0);
    expect(alphaAt(px, 50, 95)).toBe(0);
  });

  it("keeps a pair of shoes: two regions of similar size", () => {
    const px = frame(100, 40, (x, y) => ((x >= 10 && x < 40) || (x >= 60 && x < 90)) && y >= 10 && y < 30 ? 255 : 0);
    expect(cleanAlpha(px).kept).toBe(2);
    expect(alphaAt(px, 75, 20)).toBe(255);
  });
});

describe("applyGarmentMask", () => {
  it("keeps only the target garment's pixels from a photo of a person", () => {
    // 4 x 4 label grid: top half upper clothes (4), bottom half pants (6).
    const labels = new Uint8Array([4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6, 6, 6]);
    const px = frame(40, 40, () => 255);
    applyGarmentMask(px, labels, 4, 4, [4], 0);
    expect(alphaAt(px, 20, 5)).toBe(255);
    expect(alphaAt(px, 20, 38)).toBe(0);
  });
});

describe("readParse", () => {
  const grid = (fill: Record<number, number>) => {
    const out: number[] = [];
    for (const [label, n] of Object.entries(fill)) for (let i = 0; i < n; i++) out.push(Number(label));
    return new Uint8Array(out);
  };

  it("finds the person and picks the largest garment as the item", () => {
    // A t-shirt product shot: face, arms, a big t-shirt, some jeans below.
    const r = readParse(grid({ 0: 500, 11: 30, 2: 20, 14: 30, 15: 30, 4: 260, 6: 120, 9: 5, 10: 5 }));
    expect(r.person).toBe(true);
    expect(r.target).toBe("top");
    expect(r.shares.pants).toBeGreaterThan(0);
  });

  it("treats both shoes as one pair", () => {
    const r = readParse(grid({ 0: 800, 9: 90, 10: 100, 12: 5 }));
    expect(r.target).toBe("shoes");
    expect(r.person).toBe(false);
  });

  it("finds no garment in an empty frame", () => {
    expect(readParse(grid({ 0: 1000 })).target).toBeUndefined();
  });
});

describe("applyGarmentMask with the person removed", () => {
  it("drops arm pixels lying over the top, even inside its dilated outline", () => {
    // 4 x 4 grid: upper clothes everywhere except one arm cell (14) in the middle.
    const labels = new Uint8Array([4, 4, 4, 4, 4, 14, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    const px = frame(40, 40, () => 255);
    applyGarmentMask(px, labels, 4, 4, [4], 2, [14]);
    expect(alphaAt(px, 15, 15)).toBeLessThan(140); // the arm cell (soft edge from the blur)
    expect(alphaAt(px, 35, 35)).toBe(255);
  });
});
