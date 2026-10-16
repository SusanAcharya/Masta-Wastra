import { describe, expect, it } from "vitest";
import type { Item } from "@/engine/types";
import { fitInBox, fitPiece, placeOutfit, zoneOf } from "@/lib/figure";

const it_ = (subtype: string) => ({ id: subtype, subtype }) as unknown as Item;

describe("paper doll placement", () => {
  it("knows where every kind of piece goes", () => {
    expect(zoneOf(it_("tshirt"))).toBe("top");
    expect(zoneOf(it_("hoodie"))).toBe("mid");
    expect(zoneOf(it_("coat"))).toBe("outerLong");
    expect(zoneOf(it_("loafers"))).toBe("shoes");
  });

  it("paints legs, then shoes, then the top over the waist, then layers and accessories", () => {
    const order = placeOutfit([it_("coat"), it_("bag"), it_("tshirt"), it_("loafers"), it_("chinos"), it_("sweater")], "female").map((p) => p.item.subtype);
    expect(order).toEqual(["chinos", "loafers", "tshirt", "sweater", "coat", "bag"]);
  });

  it("gives the male figure wider shoulders", () => {
    const [f] = placeOutfit([it_("tshirt")], "female");
    const [m] = placeOutfit([it_("tshirt")], "male");
    expect(m.box.w).toBeGreaterThan(f.box.w);
  });

  it("fits a piece inside its box: tops hang from the shoulders, shoes stand on the floor", () => {
    const top = fitInBox({ x: 100, y: 150, w: 200, h: 300, anchor: "top" }, 400, 300); // a wide flat lay tee
    expect(top).toEqual({ x: 100, y: 150, w: 200, h: 150 });
    const shoes = fitInBox({ x: 128, y: 900, w: 144, h: 92, anchor: "bottom" }, 300, 100);
    expect(shoes.y + shoes.h).toBeCloseTo(992);
  });
});

describe("fitting pieces to the body", () => {
  it("fits flat lay trousers to the leg length, spreading wider than the legs", () => {
    const box = { x: 132, y: 400, w: 136, h: 540, anchor: "top" as const };
    const r = fitPiece(box, "pants", 432, 720); // legs splayed in the photo
    expect(r.h).toBeGreaterThan(400); // not shorts
    expect(r.w).toBeLessThanOrEqual(136 * 2 + 0.01);
    expect(r.x + r.w / 2).toBeCloseTo(200); // centred on the figure
  });

  it("keeps shoes inside their box", () => {
    const r = fitPiece({ x: 116, y: 892, w: 168, h: 104, anchor: "bottom" }, "shoes", 881, 196);
    expect(r.w).toBeLessThanOrEqual(168 + 0.01);
    expect(r.y + r.h).toBeCloseTo(996);
  });
});
