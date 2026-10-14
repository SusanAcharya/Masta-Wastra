"use client";

import type { DealtOutfit } from "@/engine";
import type { Item } from "@/engine/types";
import { CutoutImage } from "./cutout-image";

// Flat lay (10.1): outer or top on the left, bottom on the right, shoes along the bottom,
// an accessory tucked top right. The pieces are the user's own cutouts.
export function OutfitCard({ dealt, items }: { dealt: DealtOutfit; items: Map<string, Item> }) {
  const get = (id?: string) => (id ? items.get(id) : undefined);
  const slots = dealt.slots as Record<string, string | undefined>;
  const outer = get(slots.outer) ?? get(slots.mid);
  const mid = slots.outer ? get(slots.mid) : undefined;
  const top = get(slots.top) ?? get(slots.dress);
  const bottom = get(slots.bottom);
  const shoes = get(slots.shoes);
  const accessory = get(slots.accessory);

  // A dress takes the bottom's column, so the card never leans to one side; worn alone it
  // spans both columns.
  const dress = !bottom && slots.dress ? get(slots.dress) : undefined;
  const left = (dress ? [outer, mid] : [outer, mid, top]).filter(Boolean) as Item[];
  const right = (dress ? [accessory, dress] : [accessory, bottom]).filter(Boolean) as Item[];
  const solo = dress && !left.length;

  return (
    <div className="grid aspect-[4/5] w-full grid-cols-2 grid-rows-[1fr_auto] gap-2 bg-bg p-4">
      <div className={`flex min-h-0 flex-col gap-2 ${solo ? "hidden" : ""}`}>
        {left.map((it, i) => (
          <CutoutImage key={it.id} item={it} className={`min-h-0 w-full flex-1 ${i > 0 ? "-mt-6" : ""}`} />
        ))}
      </div>
      <div className={`flex min-h-0 flex-col gap-2 ${solo ? "col-span-2" : ""}`}>
        {right.map((it) => (
          <CutoutImage
            key={it.id}
            item={it}
            className={`min-h-0 w-full ${it.category === "accessory" ? "h-[28%] flex-none self-end" : "flex-1"}`}
          />
        ))}
      </div>
      {shoes ? <CutoutImage item={shoes} className="col-span-2 mx-auto h-[86px] w-[60%]" /> : null}
    </div>
  );
}
