import { describe, expect, it } from "vitest";
import { explain, formatRange, formatTemp } from "@/engine/explain";
import { deal } from "@/engine/deal";
import type { Item, WeatherSnapshot } from "@/engine/types";
import { HEX, TODAY, capsule, item, scoreOutfit, syntheticCloset, weather } from "./_fixtures";

function line(o: Parameters<typeof scoreOutfit>[0], w: WeatherSnapshot = weather({ feelsMax: 18 }), extra: { units?: "c" | "f"; items?: Item[]; wears?: { localDate: string; itemIds: string[] }[] } = {}) {
  const r = scoreOutfit(o, { weather: w, items: extra.items, wears: extra.wears });
  return explain({ parts: r.parts, detail: r, w: r.ctx.w, flags: r.ctx.flags, weather: w, occasion: "casual", units: extra.units });
}

const recentWear = (items: Item[]) => [{ localDate: "2026-09-01", itemIds: items.map((i) => i.id) }];

describe("explanations", () => {
  it("names a classic neutral pair and the layer", () => {
    const o = {
      outer: item({ subtype: "jacket", hex: HEX.navy, warmth: 3 }),
      base: item({ subtype: "shirt", hex: HEX.navy }),
      bottom: item({ subtype: "chinos", hex: HEX.camel }),
      shoes: item({ subtype: "loafers", hex: HEX.brown }),
    };
    expect(line(o, weather({ feelsMax: 12, feelsMin: 8 }), { wears: recentWear(Object.values(o)) })).toBe(
      "Navy and camel, a classic pair. 12°C, so a jacket on top.",
    );
  });

  it("says when white sneakers pick up the white stripe", () => {
    const o = {
      base: item({
        subtype: "shirt",
        pattern: "stripe",
        colors: [
          { hex: HEX.navy, name: "navy", share: 0.6 },
          { hex: HEX.white, name: "white", share: 0.4 },
        ],
      }),
      bottom: item({ subtype: "chinos", hex: HEX.khaki }),
      shoes: item({ subtype: "sneakers", hex: HEX.white }),
    };
    expect(line(o)).toMatch(/^White sneakers pick up the white stripe\./);
  });

  it("names the accent", () => {
    const o = {
      base: item({ subtype: "blouse", hex: HEX.red }),
      bottom: item({ subtype: "trousers", hex: HEX.navy }),
      shoes: item({ subtype: "sneakers", hex: HEX.white }),
    };
    expect(line(o)).toMatch(/^Red blouse with navy and white, one clear accent\./);
  });

  it("brings up the waterproof layer on rain days", () => {
    const o = {
      outer: item({ subtype: "raincoat", hex: HEX.navy, waterproof: true }),
      base: item({ subtype: "tshirt", hex: HEX.navy }),
      bottom: item({ subtype: "jeans", hex: HEX.denim }),
      shoes: item({ subtype: "boots", hex: HEX.black, waterproof: true }),
    };
    expect(line(o, weather({ feelsMax: 14, precipProb: 80 }), { wears: recentWear(Object.values(o)) })).toContain(
      "Rain on the way. Your waterproof raincoat comes along.",
    );
  });

  it("mentions a never worn piece", () => {
    const shirt = item({ subtype: "shirt", hex: HEX.green, name: "Green shirt", createdAt: "2026-09-01T00:00:00.000Z" });
    const rest = { bottom: item({ subtype: "chinos", hex: HEX.khaki }), shoes: item({ subtype: "sneakers", hex: HEX.white }) };
    const text = line({ base: shirt, ...rest }, weather({ feelsMax: 18 }), { wears: recentWear(Object.values(rest)) });
    expect(text).toContain("You have not worn the green shirt yet.");
  });

  it("does not praise colours that do not work", () => {
    const o = {
      base: item({ subtype: "tshirt", hex: HEX.navy }),
      bottom: item({ subtype: "trousers", hex: HEX.black }),
      shoes: item({ subtype: "boots", hex: "#202020" }),
    };
    expect(line(o)).not.toMatch(/pair|accent|match/);
  });

  it("uses the user's units", () => {
    expect(formatTemp(12, "c")).toBe("12°C");
    expect(formatTemp(12, "f")).toBe("54°F");
    expect(formatRange(8, 19, "c")).toBe("8 to 19°C");
    const o = {
      outer: item({ subtype: "jacket", hex: HEX.navy, warmth: 3 }),
      base: item({ subtype: "shirt", hex: HEX.navy }),
      bottom: item({ subtype: "chinos", hex: HEX.camel }),
      shoes: item({ subtype: "loafers", hex: HEX.brown }),
    };
    expect(line(o, weather({ feelsMax: 12, feelsMin: 8 }), { units: "f", wears: recentWear(Object.values(o)) })).toContain("54°F");
  });

  it("never uses long dashes and always ends a sentence", () => {
    for (const items of [capsule(), syntheticCloset()])
      for (const feelsMax of [-3, 5, 12, 18, 24, 31])
        for (const o of deal({ items, weather: weather({ feelsMax, precipProb: feelsMax === 12 ? 80 : 0 }), occasion: "casual", localDate: TODAY, seed: 1 }).outfits) {
          expect(o.reason).not.toMatch(/[\u2013\u2014]/);
          expect(o.reason).toMatch(/^[-A-Z0-9].*\.$/); // "-3°C, ..." starts with a minus
        }
  });
});
