// Where each piece sits on the paper doll (pure). The figures are drawn on a 400 x 1000 grid
// (components/figure/mannequin.tsx); boxes are in that grid. A piece is fitted inside its box
// ("contain"), anchored at the box's top (garments hang from shoulders and waist) or bottom
// (shoes stand on the floor).
import type { Item, Subtype } from "@/engine/types";

export type Body = "female" | "male";
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  anchor: "top" | "bottom" | "center";
}
export interface Placed {
  item: Item;
  box: Box;
  z: number;
  zone: Zone;
}

export type Zone = "top" | "mid" | "outerShort" | "outerLong" | "vest" | "dress" | "long" | "pants" | "shorts" | "skirt" | "shoes" | "hat" | "scarf" | "bag" | "belt" | "gloves";

const ZONE_OF: Record<Subtype, Zone> = {
  tshirt: "top", shirt: "top", blouse: "top", polo: "top", tank: "top", kurta: "top",
  sweater: "mid", cardigan: "mid", hoodie: "mid", sweatshirt: "mid",
  jeans: "pants", chinos: "pants", trousers: "pants", joggers: "pants", leggings: "pants",
  skirt: "skirt", shorts: "shorts",
  dress: "dress", jumpsuit: "long", saree: "long",
  jacket: "outerShort", blazer: "outerShort", coat: "outerLong", raincoat: "outerLong", puffer: "outerShort", vest: "vest",
  sneakers: "shoes", boots: "shoes", loafers: "shoes", heels: "shoes", flats: "shoes", sandals: "shoes",
  scarf: "scarf", hat: "hat", cap: "hat", bag: "bag", belt: "belt", gloves: "gloves",
};

const B = (x: number, y: number, w: number, h: number, anchor: Box["anchor"] = "top"): Box => ({ x, y, w, h, anchor });

const BOXES: Record<Body, Record<Zone, Box>> = {
  female: {
    top: B(108, 152, 184, 300),
    mid: B(102, 150, 196, 318),
    outerShort: B(96, 146, 208, 340),
    outerLong: B(96, 146, 208, 520),
    vest: B(128, 152, 144, 290),
    dress: B(110, 154, 180, 600),
    long: B(110, 154, 180, 790),
    pants: B(132, 400, 136, 540),
    shorts: B(130, 400, 140, 200),
    skirt: B(124, 400, 152, 290),
    shoes: B(116, 892, 168, 104, "bottom"),
    hat: B(146, 0, 108, 78, "bottom"),
    scarf: B(150, 112, 100, 200),
    bag: B(268, 380, 104, 170, "center"),
    belt: B(150, 396, 100, 34, "center"),
    gloves: B(78, 450, 70, 80, "center"),
  },
  male: {
    top: B(100, 156, 200, 318),
    mid: B(94, 154, 212, 334),
    outerShort: B(88, 150, 224, 356),
    outerLong: B(88, 150, 224, 530),
    vest: B(122, 156, 156, 300),
    dress: B(104, 158, 192, 600),
    long: B(104, 158, 192, 790),
    pants: B(134, 420, 132, 520),
    shorts: B(132, 420, 136, 190),
    skirt: B(126, 420, 148, 280),
    shoes: B(114, 896, 172, 104, "bottom"),
    hat: B(144, 0, 112, 80, "bottom"),
    scarf: B(148, 116, 104, 200),
    bag: B(274, 396, 104, 170, "center"),
    belt: B(148, 416, 104, 34, "center"),
    gloves: B(72, 466, 72, 80, "center"),
  },
};

// Painting order, bottom to top: legs wear first, then shoes, the top tucks over the waist, then
// layers, then accessories.
const Z: Record<Zone, number> = {
  pants: 10, shorts: 10, skirt: 12, long: 14, dress: 14, shoes: 16, top: 20, belt: 22, mid: 30, vest: 34,
  outerShort: 40, outerLong: 40, scarf: 50, gloves: 52, bag: 60, hat: 70,
};

export function zoneOf(item: Pick<Item, "subtype">): Zone {
  return ZONE_OF[item.subtype];
}

export function placeOutfit(items: Item[], body: Body): Placed[] {
  return items
    .map((item) => {
      const zone = zoneOf(item);
      return { item, box: BOXES[body][zone], z: Z[zone], zone };
    })
    .sort((a, b) => a.z - b.z);
}

// How far a piece may spread past its box's width when it is fitted to the box's height. A flat
// lay pair of trousers is wider than the legs it covers; fitted inside the leg box it shrinks to
// shorts. So long pieces fit the length and may spread; shoes and accessories stay inside.
const SPREAD: Record<Zone, number> = {
  pants: 2.0, shorts: 1.5, skirt: 1.3, long: 1.5, dress: 1.4, top: 1.3, mid: 1.3, vest: 1.1,
  outerShort: 1.3, outerLong: 1.35, shoes: 1, hat: 1, scarf: 1, bag: 1, belt: 1, gloves: 1,
};

export function fitPiece(box: Box, zone: Zone, w: number, h: number) {
  const s = Math.min(box.h / h, (box.w * SPREAD[zone]) / w);
  const fw = w * s;
  const fh = h * s;
  const x = box.x + (box.w - fw) / 2;
  const y = box.anchor === "top" ? box.y : box.anchor === "bottom" ? box.y + box.h - fh : box.y + (box.h - fh) / 2;
  return { x, y, w: fw, h: fh };
}

// The fitted rectangle of a w x h image inside a box, in grid units.
export function fitInBox(box: Box, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const s = Math.min(box.w / w, box.h / h);
  const fw = w * s;
  const fh = h * s;
  const x = box.x + (box.w - fw) / 2;
  const y = box.anchor === "top" ? box.y : box.anchor === "bottom" ? box.y + box.h - fh : box.y + (box.h - fh) / 2;
  return { x, y, w: fw, h: fh };
}
