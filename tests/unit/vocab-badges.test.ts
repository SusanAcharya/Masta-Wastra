import { describe, expect, it } from "vitest";
import type { Item } from "@/engine/types";
import { colorFamily, earnedBadges, nextBadge } from "@/lib/badges";
import { defaultWarmth, itemAlt, itemName, occasionsFromVibes, subtypesOf } from "@/lib/vocab";

const item = (over: Partial<Item>): Item =>
  ({ id: crypto.randomUUID(), archived: false, waterproof: false, colors: [{ hex: "#1f2a44", name: "navy", share: 1 }], ...over }) as Item;

describe("vocabulary", () => {
  it("names a piece colour first, in plain words", () => {
    expect(itemName([{ hex: "#1f2a44", name: "navy", share: 1 }], "shirt")).toBe("Navy shirt");
    expect(
      itemName(
        [
          { hex: "#1f2a44", name: "navy", share: 0.7 },
          { hex: "#f4f3ef", name: "white", share: 0.3 },
        ],
        "tshirt",
      ),
    ).toBe("Navy and white t-shirt");
    expect(itemName([], "boots")).toBe("Boots");
  });

  it("writes alt text with the colours", () => {
    expect(itemAlt("Navy oxford shirt", [{ hex: "#1f2a44", name: "navy", share: 0.8 }, { hex: "#fff", name: "white", share: 0.2 }])).toBe(
      "Navy oxford shirt, navy and white",
    );
  });

  it("lists subtypes per category and defaults warmth sensibly", () => {
    expect(subtypesOf("shoes")).toContain("sneakers");
    expect(subtypesOf("shoes")).not.toContain("coat");
    expect(defaultWarmth("puffer")).toBe(5);
    expect(defaultWarmth("tank")).toBe(1);
  });

  it("derives occasions from vibes", () => {
    expect(occasionsFromVibes(["sporty"])).toEqual(["casual", "workout"]);
    expect(occasionsFromVibes(["smart", "formal"])).toContain("work");
  });
});

describe("badges", () => {
  it("are earned from the closet as it is", () => {
    expect(earnedBadges([])).toEqual([]);
    const closet = [
      item({ category: "top" }),
      item({ category: "bottom", colors: [{ hex: "#b98a56", name: "camel", share: 1 }] }),
      item({ category: "shoes", colors: [{ hex: "#f4f3ef", name: "white", share: 1 }] }),
      item({ category: "outer", waterproof: true, colors: [{ hex: "#3f7a46", name: "green", share: 1 }] }),
    ];
    expect(earnedBadges(closet)).toEqual(["first-thread", "full-outfit", "layer-up", "monsoon-ready"]);
    expect(nextBadge(earnedBadges(closet))?.id).toBe("ten-strong");
  });

  it("counts colour families, neutrals by lightness and colours by hue", () => {
    expect(colorFamily("#f4f3ef")).toBe("light");
    expect(colorFamily("#1c1c1c")).toBe("dark");
    expect(colorFamily("#b8312f")).not.toBe(colorFamily("#2f5fa8"));
    const rainbow = ["#b8312f", "#d9722e", "#e2c13f", "#3f7a46", "#2f5fa8"].map((hex) =>
      item({ category: "top", colors: [{ hex, name: "x", share: 1 }] }),
    );
    expect(earnedBadges(rainbow)).toContain("rainbow-rack");
  });

  it("ignores retired pieces", () => {
    expect(earnedBadges([item({ category: "top", archived: true })])).toEqual([]);
  });
});

import { isDressable } from "@/lib/provisional";
describe("which pieces may join outfits", () => {
  const base = { archived: false, tagSource: "ai", tagStatus: "done" };
  it("uses recognised and hand tagged pieces", () => {
    expect(isDressable(base)).toBe(true);
    expect(isDressable({ ...base, tagSource: "manual", tagStatus: "manual" })).toBe(true);
    expect(isDressable({ ...base, tagSource: "ai-edited", tagStatus: "queued" })).toBe(true);
  });
  it("keeps out pieces still being recognised, untagged, unsure or retired", () => {
    expect(isDressable({ ...base, tagStatus: "queued" })).toBe(false);
    expect(isDressable({ ...base, tagSource: "manual", tagStatus: "pending" })).toBe(false);
    expect(isDressable({ ...base, tagCheck: true })).toBe(false);
    expect(isDressable({ ...base, archived: true })).toBe(false);
  });
});
