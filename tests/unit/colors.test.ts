import { describe, expect, it } from "vitest";
import { extractColors, opaqueShare, trimBounds, type Pixels } from "@/lib/colors";

// A w x h frame filled with `bg` (transparent by default) and rectangles of colour.
function frame(w: number, h: number, rects: { x: number; y: number; w: number; h: number; rgba: number[] }[], bg = [0, 0, 0, 0]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(bg, i * 4);
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) data.set(r.rgba, (y * w + x) * 4);
  return { data, width: w, height: h };
}

describe("dominant colours", () => {
  it("finds a navy shirt with white buttons, ignoring the transparent background", () => {
    const px = frame(100, 100, [
      { x: 20, y: 10, w: 60, h: 80, rgba: [31, 42, 68, 255] },
      { x: 48, y: 20, w: 6, h: 60, rgba: [244, 243, 239, 255] },
    ]);
    const colors = extractColors(px);
    expect(colors[0].name).toBe("navy");
    expect(colors[0].share).toBeGreaterThan(0.85);
    expect(colors.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 2);
  });

  it("drops clusters under 8% and keeps at most three", () => {
    const px = frame(100, 10, [
      { x: 0, y: 0, w: 40, h: 10, rgba: [184, 49, 47, 255] }, // red 40%
      { x: 40, y: 0, w: 30, h: 10, rgba: [31, 42, 68, 255] }, // navy 30%
      { x: 70, y: 0, w: 25, h: 10, rgba: [244, 243, 239, 255] }, // white 25%
      { x: 95, y: 0, w: 5, h: 10, rgba: [226, 193, 63, 255] }, // yellow 5%
    ]);
    const colors = extractColors(px);
    expect(colors.map((c) => c.name)).toEqual(["red", "navy", "white"]);
  });

  it("merges shades of one cloth colour that folds and shadows split apart", () => {
    const px = frame(100, 10, [
      { x: 0, y: 0, w: 70, h: 10, rgba: [185, 138, 86, 255] }, // camel
      { x: 70, y: 0, w: 30, h: 10, rgba: [170, 126, 78, 255] }, // camel in shadow
    ]);
    const colors = extractColors(px);
    expect(colors).toHaveLength(1);
    expect(colors[0]).toMatchObject({ name: "camel", share: 1 });
  });

  it("is deterministic", () => {
    const px = frame(64, 64, [
      { x: 0, y: 0, w: 32, h: 64, rgba: [185, 138, 86, 255] },
      { x: 32, y: 0, w: 32, h: 64, rgba: [63, 122, 70, 255] },
    ]);
    expect(extractColors(px)).toEqual(extractColors(px));
  });

  it("samples only the centre region of a manual crop, where the garment is", () => {
    const px = frame(100, 100, [{ x: 30, y: 30, w: 40, h: 40, rgba: [106, 74, 140, 255] }], [216, 199, 168, 255]);
    const colors = extractColors(px, { region: { x: 30, y: 30, w: 40, h: 40 } });
    expect(colors).toHaveLength(1);
    expect(colors[0].name).toBe("purple");
  });

  it("returns nothing for a fully transparent frame", () => {
    expect(extractColors(frame(10, 10, []))).toEqual([]);
  });
});

describe("cutout geometry", () => {
  it("measures how much of the frame the garment covers", () => {
    expect(opaqueShare(frame(10, 10, [{ x: 0, y: 0, w: 5, h: 10, rgba: [1, 1, 1, 255] }]))).toBe(0.5);
  });

  it("trims to the garment plus 4% padding, clamped to the frame", () => {
    const px = frame(200, 200, [{ x: 50, y: 40, w: 100, h: 120, rgba: [1, 1, 1, 255] }]);
    // pad = round(119 * 0.04) = 5
    expect(trimBounds(px)).toEqual({ x: 45, y: 35, w: 110, h: 130 });
    expect(trimBounds(frame(10, 10, [{ x: 0, y: 0, w: 10, h: 10, rgba: [1, 1, 1, 255] }]))).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });
});
