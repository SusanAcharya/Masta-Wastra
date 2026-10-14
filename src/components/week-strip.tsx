"use client";

import { useSyncExternalStore } from "react";

// This week, Monday first, today marked. Empty cells until outfits are worn.
const subscribe = () => () => {};

function week() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const day = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { key: d.toDateString(), label: day.format(d), date: d.getDate(), isToday: d.toDateString() === today.toDateString() };
  });
}

let cache: { stamp: string; days: ReturnType<typeof week> } | undefined;
function snapshot() {
  const stamp = new Date().toDateString();
  if (cache?.stamp !== stamp) cache = { stamp, days: week() };
  return cache.days;
}
const empty: ReturnType<typeof week> = [];

export function WeekStrip() {
  const days = useSyncExternalStore(subscribe, snapshot, () => empty);
  return (
    <ol className="grid min-h-[96px] grid-cols-7 gap-1.5" aria-hidden="true">
      {days.map((d) => (
        <li key={d.key} className="flex flex-col items-center gap-1.5">
          <span className="text-[12px] text-ink-2">{d.label}</span>
          <span
            className={`num flex aspect-[3/4] w-full items-end justify-center rounded-ui border pb-1 text-[12px] ${
              d.isToday ? "border-primary text-ink" : "border-line text-ink-2"
            } bg-surface`}
          >
            {d.date}
          </span>
        </li>
      ))}
    </ol>
  );
}
