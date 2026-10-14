"use client";

import { motion } from "motion/react";
import { Icon } from "@/components/icons/icon";
import { copy } from "@/lib/copy";

// Adapted from Design Lounge card-progress-goals (Nº 256) and diamond-badge-rail (Nº 221):
// one bar, n of goal, the next badge waiting at its end.
export function ScanProgress({ count, goal, nextBadge, calm }: { count: number; goal: number; nextBadge?: string; calm: boolean }) {
  const pct = Math.min(100, (count / goal) * 100);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="num text-[15px]">
          <span className="text-ink">{count}</span>
          <span className="text-ink-2"> {copy.scan.of(goal)}</span>
        </p>
        {nextBadge ? (
          <p className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <Icon name="star" size={16} />
            {copy.scan.nextBadge(nextBadge)}
          </p>
        ) : null}
      </div>
      <div
        className="h-[6px] overflow-hidden rounded-ui bg-surface-2"
        role="progressbar"
        aria-label={copy.scan.progressLabel}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={count}
      >
        <motion.div
          className="h-full bg-primary"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={calm ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 28 }}
        />
      </div>
    </div>
  );
}
