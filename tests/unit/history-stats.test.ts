import { describe, expect, it } from "vitest";
import type { Item, Wear } from "@/engine/types";
import { longestStreak, monthStats, neverWorn, notWornSince, wearsByDay } from "@/lib/history-stats";

const item = (id: string, over: Partial<Item> = {}): Item =>
  ({ id, name: id, archived: false, createdAt: "2026-08-01T08:00:00.000Z", colors: [{ hex: "#1f2a44", name: "navy", share: 1 }], ...over }) as Item;
const wear = (localDate: string, itemIds: string[], at = `${localDate}T07:00:00.000Z`): Wear => ({ id: `${localDate}-${itemIds.join()}`, localDate, outfitId: "o", itemIds, at });

const items = [
  item("tee"),
  item("jeans", { colors: [{ hex: "#4a6a8f", name: "denim", share: 1 }] }),
  item("sneakers", { colors: [{ hex: "#f4f3ef", name: "white", share: 1 }] }),
  item("coat", { createdAt: "2026-10-10T08:00:00.000Z" }), // new: too young for "never worn"
  item("silk shirt"), // old and never worn
  item("old boots"), // worn long ago
  item("retired", { archived: true }),
];
const wears = [
  wear("2026-06-01", ["old boots"]),
  wear("2026-10-01", ["tee", "jeans", "sneakers"]),
  wear("2026-10-02", ["tee", "jeans", "sneakers"]),
  wear("2026-10-03", ["tee", "sneakers"]),
  wear("2026-10-05", ["jeans"]),
];

describe("history", () => {
  it("keeps the latest wear per day for the calendar", () => {
    const days = wearsByDay([...wears, wear("2026-10-05", ["tee"], "2026-10-05T19:00:00.000Z")]);
    expect(days.get("2026-10-05")?.itemIds).toEqual(["tee"]);
    expect(days.size).toBe(5);
  });

  it("counts this month's wears, closet use and the most worn piece", () => {
    const s = monthStats(items, wears, "2026-10");
    expect(s.wornDays).toBe(4);
    expect(s.piecesWorn).toBe(3);
    expect(s.closetUsed).toBeCloseTo(3 / 6); // 6 active pieces
    expect(s.mostWorn?.item.id).toBe("tee"); // 3 (tie with sneakers broken by first seen)
    expect(s.colourMix[0].share).toBeGreaterThan(0);
    expect(s.colourMix.map((c) => c.name)).toContain("denim");
    expect(s.colourMix.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1);
  });

  it("finds the longest streak of consecutive days", () => {
    expect(longestStreak(wears)).toBe(3);
    expect(longestStreak([])).toBe(0);
  });

  it("lists pieces never worn and older than 14 days", () => {
    expect(neverWorn(items, wears, "2026-10-15").map((i) => i.id)).toEqual(["silk shirt"]);
  });

  it("lists pieces not worn in 90 days", () => {
    expect(notWornSince(items, wears, "2026-10-15").map((i) => i.id)).toEqual(["old boots"]);
  });
});
