"use client";

import type { ReactNode } from "react";
import s from "./chips.module.css";

export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={s.row}>
      {children}
    </div>
  );
}

export function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={s.chip} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

// Single choice as a radio group of chips (arrow keys move, like native radios).
export function ChoiceRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
  variant = "chips",
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: ReactNode; sub?: ReactNode }[];
  onChange: (v: T) => void;
  variant?: "chips" | "segmented" | "tiles";
}) {
  const cls = variant === "segmented" ? s.segmented : variant === "tiles" ? "grid grid-cols-3 gap-2" : s.row;
  const item = variant === "segmented" ? s.segment : variant === "tiles" ? s.tile : s.chip;
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cls}
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = options[(Math.max(0, index) + step + options.length) % options.length];
        onChange(next.value);
        (e.currentTarget.querySelectorAll<HTMLElement>("[role=radio]")[options.indexOf(next)] as HTMLElement)?.focus();
      }}
    >
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value || (index < 0 && i === 0) ? 0 : -1}
          className={item}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.sub ? <span className="text-[11px] text-ink-2">{o.sub}</span> : null}
        </button>
      ))}
    </div>
  );
}
