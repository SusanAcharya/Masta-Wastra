"use client";

import { Garment, type GarmentKind } from "@/components/art/garment";
import { Icon } from "@/components/icons/icon";
import { slotCounts, type SlotCounts } from "@/db/repo";
import { getDb } from "@/db/schema";
import { useLive } from "@/db/use-live";
import { copy } from "@/lib/copy";

const SLOTS: { key: keyof SlotCounts; kind: GarmentKind; label: string }[] = [
  { key: "top", kind: "top", label: copy.closet.slots.top },
  { key: "bottom", kind: "bottom", label: copy.closet.slots.bottom },
  { key: "shoes", kind: "shoes", label: copy.closet.slots.shoes },
];

// The three pieces a first outfit needs, with live counts from the closet.
export function StarterSlots({ compact = false }: { compact?: boolean }) {
  const counts = useLive(() => slotCounts(getDb()));
  return (
    <ul className={`grid grid-cols-3 ${compact ? "gap-2" : "gap-3"}`}>
      {SLOTS.map((slot) => {
        const n = counts?.[slot.key] ?? 0;
        const done = n > 0;
        return (
          <li
            key={slot.key}
            className={`flex flex-col items-center rounded-ui border ${done ? "border-success" : "border-line"} bg-surface ${compact ? "px-2 py-3" : "px-3 py-4"}`}
          >
            <Garment
              kind={slot.kind}
              fill={done ? "var(--success)" : "var(--surface-3)"}
              size={compact ? 40 : 64}
            />
            <span className="mt-2 text-[14px]">{slot.label}</span>
            <span className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-2">
              {done ? <Icon name="check" size={14} className="text-success" /> : null}
              {done ? copy.closet.count(n) : copy.closet.none}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
