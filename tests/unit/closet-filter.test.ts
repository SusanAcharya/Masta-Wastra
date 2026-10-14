import { describe, expect, it } from "vitest";
import type { Item } from "@/engine/types";
import { filterCloset, sortCloset, activeFilterCount, type WearStat } from "@/lib/closet-filter";

let n = 0;
const item = (over: Partial<Item>): Item =>
  ({
    id: `i${++n}`,
    createdAt: `2026-10-${String(n).padStart(2, "0")}T08:00:00.000Z`,
    name: "x",
    category: "top",
    subtype: "tshirt",
    colors: [{ hex: "#1f2a44", name: "navy", share: 1 }],
    primaryHex: "#1f2a44",
    warmth: 2,
    pattern: "solid",
    vibes: ["casual"],
    occasions: ["casual"],
    tagSource: "ai",
    tagStatus: "done",
    archived: false,
    ...over,
  }) as Item;

const navyTee = item({ name: "navy tee" });
const redSweater = item({ name: "red sweater", warmth: 3, colors: [{ hex: "#b8312f", name: "red", share: 1 }], primaryHex: "#b8312f", vibes: ["smart"], occasions: ["work"] });
const jeans = item({ name: "jeans", category: "bottom", subtype: "jeans", warmth: 3, colors: [{ hex: "#4a6a8f", name: "denim", share: 1 }], primaryHex: "#4a6a8f" });
const stripes = item({ name: "striped shirt", pattern: "stripe", colors: [{ hex: "#f4f3ef", name: "white", share: 0.6 }, { hex: "#b8312f", name: "red", share: 0.4 }], primaryHex: "#f4f3ef" });
const queued = item({ name: "queued", tagStatus: "queued" });
const retired = item({ name: "retired", archived: true });
const all = [navyTee, redSweater, jeans, stripes, queued, retired];
const stats = new Map<string, WearStat>([
  [navyTee.id, { count: 5, last: "2026-10-12" }],
  [jeans.id, { count: 2, last: "2026-10-13" }],
]);
const names = (xs: Item[]) => xs.map((i) => i.name);

describe("closet filters", () => {
  it("hides retired pieces unless asked", () => {
    expect(names(filterCloset(all, {}, stats))).not.toContain("retired");
    expect(names(filterCloset(all, { archived: true }, stats))).toEqual(["retired"]);
  });

  it("ORs within a group and ANDs across groups", () => {
    expect(names(filterCloset(all, { categories: ["top", "bottom"] }, stats))).toEqual(["navy tee", "red sweater", "jeans", "striped shirt", "queued"]);
    expect(names(filterCloset(all, { categories: ["top"], warmth: [3] }, stats))).toEqual(["red sweater"]);
    expect(names(filterCloset(all, { categories: ["top"], vibes: ["smart"], occasions: ["work"] }, stats))).toEqual(["red sweater"]);
  });

  it("matches a colour family on any of a piece's colours", () => {
    expect(names(filterCloset(all, { families: ["red"] }, stats))).toEqual(["red sweater", "striped shirt"]);
  });

  it("finds never worn pieces and pieces that need tags", () => {
    expect(names(filterCloset(all, { neverWorn: true, categories: ["top"] }, stats))).toEqual(["red sweater", "striped shirt", "queued"]);
    expect(names(filterCloset(all, { needsTags: true }, stats))).toEqual(["queued"]);
  });

  it("filters by pattern and counts active groups", () => {
    expect(names(filterCloset(all, { patterns: ["stripe"] }, stats))).toEqual(["striped shirt"]);
    expect(activeFilterCount({ categories: ["top"], neverWorn: true, vibes: [] })).toBe(2);
  });
});

describe("closet sorts", () => {
  const live = filterCloset(all, {}, stats);
  it("sorts newest first by default", () => {
    expect(names(sortCloset(live, "newest", stats))[0]).toBe("queued");
  });
  it("sorts by wear count both ways", () => {
    expect(names(sortCloset(live, "most-worn", stats)).slice(0, 2)).toEqual(["navy tee", "jeans"]);
    expect(names(sortCloset(live, "least-worn", stats)).at(-1)).toBe("navy tee");
  });
  it("sorts by colour: neutrals by lightness, then hues", () => {
    const sorted = names(sortCloset(live, "colour", stats));
    expect(sorted.indexOf("striped shirt")).toBeLessThan(sorted.indexOf("red sweater")); // white is neutral
    expect(sorted).toHaveLength(live.length);
  });
});
