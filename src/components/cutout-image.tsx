"use client";

import { useImageUrl } from "@/db/use-image";
import type { Item } from "@/engine/types";
import { itemAlt } from "@/lib/vocab";

// A garment cutout as an object: soft drop shadow on cutouts only (DESIGN.md, the Lift
// departure); a hand cropped photo fills its frame instead.
export function CutoutImage({ item, thumb = false, className = "" }: { item: Item; thumb?: boolean; className?: string }) {
  const url = useImageUrl(thumb ? item.thumbId : item.cutoutId);
  const manual = item.cutoutQuality === "manual";
  if (!url) return <span className={`block ${className}`} aria-hidden="true" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={itemAlt(item.name, item.colors)}
      className={`${manual ? "object-cover" : "object-contain"} ${className}`}
      style={manual ? undefined : { filter: "drop-shadow(0 6px 8px rgba(42,33,27,0.18))" }}
      draggable={false}
    />
  );
}
