"use client";

import { motion } from "motion/react";

export interface SheetItem {
  id: string;
  url: string;
  alt: string;
  manual: boolean;
}

// Adapted from Design Lounge gallery-contact-sheet (Nº 201): the growing closet as a sheet of
// frames. Each new cutout lands with a small rotation (9.4 step 4).
export function ContactSheet({ items, label }: { items: SheetItem[]; label: string }) {
  if (!items.length) return null;
  return (
    <ul className="grid grid-cols-4 gap-2" aria-label={label}>
      {items.map((it, i) => (
        <li
          key={it.id}
          className="relative aspect-square overflow-hidden rounded-ui border border-line bg-surface"
          style={{ rotate: `${((i * 37) % 5) - 2}deg` }}
        >
          <motion.img
            layoutId={`cut-${it.id}`}
            src={it.url}
            alt={it.alt}
            className={`absolute inset-[8%] h-[84%] w-[84%] ${it.manual ? "object-cover" : "object-contain"}`}
            style={{ filter: it.manual ? undefined : "drop-shadow(0 4px 5px rgba(42,33,27,0.18))" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          />
        </li>
      ))}
    </ul>
  );
}
