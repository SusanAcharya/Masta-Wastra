"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { CutoutImage } from "@/components/cutout-image";
import { Icon } from "@/components/icons/icon";
import { OutfitCard } from "@/components/outfit-card";
import { PageHeader } from "@/components/page-header";
import { archiveItem, listItems, updateSettings } from "@/db/repo";
import { getDb } from "@/db/schema";
import { useLive } from "@/db/use-live";
import { useSettings } from "@/db/use-settings";
import type { DealtOutfit } from "@/engine";
import type { Item, Wear } from "@/engine/types";
import { copy } from "@/lib/copy";
import { addDays, toLocalDate } from "@/lib/dates";
import { monthStats, neverWorn, notWornSince, wearsByDay } from "@/lib/history-stats";

const noSubscribe = () => () => {};
const pad = (n: number) => String(n).padStart(2, "0");

// A worn outfit, drawn with the same flat lay as the Outfit tab.
function asDealt(w: Wear, items: Map<string, Item>): DealtOutfit {
  const pieces = w.itemIds.map((id) => items.get(id)).filter((i): i is Item => !!i);
  const slots: Record<string, string> = {};
  const first = (pred: (i: Item) => boolean) => pieces.find((i) => pred(i))?.id;
  slots.dress = first((i) => i.category === "dress") ?? "";
  slots.bottom = first((i) => i.category === "bottom") ?? "";
  slots.shoes = first((i) => i.category === "shoes") ?? "";
  slots.accessory = first((i) => i.category === "accessory") ?? "";
  slots.outer = first((i) => i.category === "outer" && i.layer === 2) ?? "";
  // A base top sits under; a sweater is the mid layer when there is a base, else the top.
  const base = first((i) => i.category === "top" && i.layer === 0);
  const mid = first((i) => (i.category === "top" && i.layer === 1) || (i.category === "outer" && i.layer === 1));
  slots.top = base ?? mid ?? "";
  slots.mid = base && mid ? mid : "";
  for (const k of Object.keys(slots)) if (!slots[k]) delete slots[k];
  return { slots, itemIds: w.itemIds } as unknown as DealtOutfit;
}

export function HistoryScreen() {
  const db = getDb();
  const items = useLive(() => listItems(db, { includeArchived: true }));
  const wears = useLive(() => db.wears.toArray());
  const settings = useSettings();
  const today = useSyncExternalStore(noSubscribe, () => toLocalDate(), () => "");
  const [month, setMonth] = useState<string>();
  const [picked, setPicked] = useState<string>();

  const current = month ?? today.slice(0, 7);
  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const days = useMemo(() => wearsByDay(wears ?? []), [wears]);
  const stats = useMemo(() => (items && wears && current ? monthStats(items, wears, current) : undefined), [items, wears, current]);
  const waiting = useMemo(() => (items && wears && today ? neverWorn(items, wears, today) : []), [items, wears, today]);
  const old = useMemo(() => (items && wears && today ? notWornSince(items, wears, today) : []), [items, wears, today]);

  if (!today || !items || !wears) return <PageHeader title={copy.history.title} />;

  const [y, m] = current.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const length = new Date(y, m, 0).getDate();
  const monthName = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(first);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    setPicked(undefined);
  };
  const selected = picked ? days.get(picked) : undefined;
  const boostUntil = settings?.neverWornBoostUntil;
  const boosting = !!boostUntil && boostUntil > new Date().toISOString();

  return (
    <>
      <PageHeader eyebrow={monthName} title={copy.history.title} />

      <section aria-label={monthName}>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" className="btn px-3" onClick={() => shift(-1)} aria-label={copy.history.prev}>
            <Icon name="chevron-left" size={20} />
          </button>
          <p className="text-[16px]">{monthName}</p>
          <button type="button" className="btn px-3" onClick={() => shift(1)} aria-label={copy.history.next} disabled={current >= today.slice(0, 7)}>
            <Icon name="chevron-right" size={20} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[12px] text-ink-2" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i}>{weekday.format(new Date(2026, 9, 12 + i))}</span>
          ))}
        </div>
        <ol className="mt-1.5 grid grid-cols-7 gap-1.5">
          {Array.from({ length: lead }, (_, i) => (
            <li key={`lead-${i}`} aria-hidden="true" />
          ))}
          {Array.from({ length }, (_, i) => {
            const date = `${current}-${pad(i + 1)}`;
            const w = days.get(date);
            const hero = w?.itemIds.map((id) => byId.get(id)).find((it) => it && it.category !== "shoes" && it.category !== "accessory");
            const isToday = date === today;
            const label = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date(y, m - 1, i + 1));
            return (
              <li key={date}>
                <button
                  type="button"
                  onClick={() => setPicked(date === picked ? undefined : date)}
                  aria-pressed={date === picked}
                  aria-label={`${label}${w ? `, ${w.itemIds.length} pieces worn` : ""}`}
                  disabled={date > today}
                  className={`relative flex aspect-[3/4] w-full flex-col items-center justify-end overflow-hidden rounded-ui border bg-surface pb-1 ${
                    date === picked ? "border-primary bg-primary-soft" : isToday ? "border-ink-2" : "border-line"
                  } disabled:opacity-40`}
                >
                  {hero ? <CutoutImage item={hero} thumb className="absolute inset-1 bottom-4 h-auto w-auto" /> : null}
                  <span className="num relative text-[12px]">{i + 1}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {picked ? (
          <div className="mt-4" aria-live="polite">
            {selected ? (
              <div className="mx-auto max-w-[300px] overflow-hidden rounded-ui border border-line bg-surface">
                <OutfitCard dealt={asDealt(selected, byId)} items={byId} view={settings?.outfitView ?? "figure"} body={settings?.figure ?? "female"} mini />
              </div>
            ) : (
              <p className="text-[14px] text-ink-2">{copy.history.dayEmpty}</p>
            )}
          </div>
        ) : null}
      </section>

      {!wears.length ? (
        <section className="mt-10" aria-labelledby="history-empty">
          <h2 id="history-empty" className="plain text-[20px]">
            {copy.history.emptyTitle}
          </h2>
          <p className="mt-2 max-w-[44ch] text-[15px] text-ink-2">{copy.history.emptyBody}</p>
          <Link href="/today" className="btn btn-primary mt-6">
            {copy.history.emptyAction}
          </Link>
        </section>
      ) : stats ? (
        <section className="mt-10" aria-labelledby="stats">
          <h2 id="stats" className="plain text-[20px]">
            {copy.history.stats}
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-2">
            <div className="flex items-center gap-3 rounded-ui border border-line bg-surface p-3">
              <svg viewBox="0 0 36 36" className="h-12 w-12 shrink-0 -rotate-90" aria-hidden="true">
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-2)" strokeWidth="4" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--success)" strokeWidth="4" strokeDasharray={`${stats.closetUsed * 94.25} 94.25`} />
              </svg>
              <div>
                <dt className="text-[12px] text-ink-2">{copy.history.used}</dt>
                <dd className="num text-[22px]">{Math.round(stats.closetUsed * 100)}%</dd>
              </div>
            </div>
            {(
              [
                [copy.history.days, String(stats.wornDays)],
                [copy.history.pieces, String(stats.piecesWorn)],
                [copy.history.streak, copy.history.streakDays(stats.streak)],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-ui border border-line bg-surface p-3">
                <dt className="text-[12px] text-ink-2">{k}</dt>
                <dd className="num mt-1 text-[22px]">{v}</dd>
              </div>
            ))}
          </dl>
          {stats.mostWorn ? (
            <div className="mt-2 flex items-center gap-3 rounded-ui border border-line bg-surface p-3">
              <CutoutImage item={stats.mostWorn.item} thumb className="h-14 w-14 shrink-0" />
              <div>
                <p className="text-[12px] text-ink-2">{copy.history.mostWorn}</p>
                <p className="text-[15px]">
                  {stats.mostWorn.item.name} <span className="num text-ink-2">× {stats.mostWorn.count}</span>
                </p>
              </div>
            </div>
          ) : null}
          {stats.colourMix.length ? (
            <div className="mt-2 rounded-ui border border-line bg-surface p-3">
              <p className="text-[12px] text-ink-2">{copy.history.mix}</p>
              <div className="mt-2 flex h-3 overflow-hidden rounded-ui border border-line" role="img" aria-label={stats.colourMix.map((c) => `${c.name} ${Math.round(c.share * 100)}%`).join(", ")}>
                {stats.colourMix.map((c) => (
                  <span key={c.name} style={{ width: `${c.share * 100}%`, background: c.hex }} />
                ))}
              </div>
              <p className="mt-2 text-[13px] text-ink-2">
                {stats.colourMix
                  .slice(0, 4)
                  .map((c) => `${c.name} ${Math.round(c.share * 100)}%`)
                  .join(", ")}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {waiting.length ? (
        <section className="mt-8 rounded-ui border border-line bg-surface p-4" aria-labelledby="waiting">
          <h2 id="waiting" className="plain text-[18px]">
            {copy.history.waitingTitle(waiting.length)}
          </h2>
          <p className="mt-1 text-[14px] text-ink-2">{copy.history.waitingBody}</p>
          <ul className="mt-3 flex gap-2 overflow-x-auto">
            {waiting.slice(0, 8).map((i) => (
              <li key={i.id} className="h-16 w-16 shrink-0 rounded-ui bg-bg p-1">
                <CutoutImage item={i} thumb className="h-full w-full" />
              </li>
            ))}
          </ul>
          {boosting ? (
            <p className="mt-3 flex items-center justify-between gap-2 text-[14px] text-success-on-soft">
              <span className="flex items-center gap-2">
                <Icon name="check" size={18} />
                {copy.history.boosted(new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(new Date(boostUntil!)))}
              </span>
              <button type="button" className="btn px-3" onClick={() => updateSettings(db, { neverWornBoostUntil: undefined })}>
                {copy.history.stopBoost}
              </button>
            </p>
          ) : (
            <button
              type="button"
              className="btn mt-3 w-full"
              onClick={() => updateSettings(db, { neverWornBoostUntil: new Date(Date.parse(addDays(today, 7))).toISOString() })}
            >
              {copy.history.boost}
            </button>
          )}
        </section>
      ) : null}

      {old.length ? (
        <section className="mt-6 rounded-ui border border-line bg-surface p-4" aria-labelledby="old">
          <h2 id="old" className="plain text-[18px]">
            {copy.history.oldTitle}
          </h2>
          <p className="mt-1 text-[14px] text-ink-2">{copy.history.oldBody}</p>
          <ul className="mt-3 divide-y divide-line">
            {old.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2">
                <CutoutImage item={i} thumb className="h-12 w-12 shrink-0" />
                <span className="flex-1 text-[15px]">{i.name}</span>
                <button type="button" className="btn px-3" onClick={() => archiveItem(db, i.id)}>
                  {copy.history.retire}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
