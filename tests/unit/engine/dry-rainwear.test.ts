import { describe, expect, it } from "vitest";
import { pickOutfit } from "@/engine/deal";
import { HEX, item, resetIds, weather } from "./_fixtures";

// Found in the 15 photo journey: on a dry 13 to 19 °C day the raincoat won on warmth alone.
describe("rain gear on dry days", () => {
  const closet = () => {
    resetIds();
    return [
      item({ subtype: "tshirt", hex: HEX.white }),
      item({ subtype: "chinos", hex: HEX.khaki }),
      item({ subtype: "sneakers", hex: HEX.white }),
      item({ id: "rain", subtype: "raincoat", hex: HEX.olive, waterproof: true }),
      item({ id: "jacket", subtype: "jacket", hex: HEX.navy, warmth: 2 }),
    ];
  };
  const base = { occasion: "casual" as const, localDate: "2026-10-14", seed: 1 };

  it("prefers a regular jacket when it is dry", () => {
    const { outfit } = pickOutfit({ ...base, items: closet(), weather: weather({ feelsMax: 18, feelsMin: 13 }) });
    expect(outfit?.slots.outer).toBe("jacket");
  });

  it("still takes the raincoat when rain is coming", () => {
    const { outfit } = pickOutfit({ ...base, items: closet(), weather: weather({ feelsMax: 18, feelsMin: 13, precipProb: 80, precipMm: 5 }) });
    expect(outfit?.slots.outer).toBe("rain");
  });
});
