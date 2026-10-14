"use client";

import { motion } from "motion/react";
import { CutoutImage } from "@/components/cutout-image";
import type { Item } from "@/engine/types";
import { needsTag } from "@/lib/closet-filter";
import { copy } from "@/lib/copy";

// A tile of the masonry wall (Design Lounge masonry-gallery-captions, Nº 035). The caption is
// always visible: phones have no hover. Status has words, not only a dot (prompt 12).
export function ItemTile({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const recognising = item.tagSource === "ai" && (item.tagStatus === "queued" || item.tagStatus === "pending");
  const attention = !recognising && needsTag(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-3 block w-full break-inside-avoid overflow-hidden rounded-ui border border-line bg-surface text-left"
    >
      <motion.div layoutId={`item-${item.id}`} className="relative bg-bg p-3" style={{ aspectRatio: aspect(item.id) }}>
        <CutoutImage item={item} thumb className="h-full w-full" />
      </motion.div>
      <div className="px-3 pt-2 pb-3">
        {recognising ? (
          <span className="shimmer block h-[18px] w-3/4 rounded-ui" aria-label={copy.closet.recognising} />
        ) : (
          <span className="block truncate text-[14px]">{item.name}</span>
        )}
        {recognising ? (
          <span className="mt-1 block text-[12px] text-ink-2">{copy.closet.recognising}</span>
        ) : attention ? (
          <span className="mt-1 flex items-center gap-1.5 text-[12px] text-warning-on-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
            {item.tagCheck ? copy.closet.check : copy.closet.needsTags}
          </span>
        ) : null}
      </div>
    </button>
  );
}

// A stable, slightly varied height per piece, so the wall reads as masonry.
const RATIOS = ["4 / 5", "1 / 1", "3 / 4", "4 / 5", "5 / 6"];
function aspect(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return RATIOS[Math.abs(h) % RATIOS.length];
}
