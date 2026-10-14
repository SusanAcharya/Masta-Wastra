// History numbers (10.5). Pure: wears and items in, plain facts out.
import type { Item, Wear } from "@/engine/types";
import { addDays, daysBetween } from "./dates";

export interface MonthStats {
  wornDays: number;
  piecesWorn: number;
  closetUsed: number; // 0..1 of active pieces worn this month
  mostWorn?: { item: Item; count: number };
  streak: number; // longest run of consecutive days with a wear, all time
  colourMix: { name: string; hex: string; share: number }[]; // the colours actually worn, by name
}

// Wears by local date, for the calendar: the latest wear of each day wins.
export function wearsByDay(wears: Wear[]): Map<string, Wear> {
  const days = new Map<string, Wear>();
  for (const w of [...wears].sort((a, b) => a.at.localeCompare(b.at))) days.set(w.localDate, w);
  return days;
}

export function monthStats(items: Item[], wears: Wear[], month: string): MonthStats {
  const live = items.filter((i) => !i.archived);
  const byId = new Map(items.map((i) => [i.id, i]));
  const inMonth = wears.filter((w) => w.localDate.startsWith(month));
  const counts = new Map<string, number>();
  for (const w of inMonth) for (const id of w.itemIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  let mostWorn: MonthStats["mostWorn"];
  for (const [id, count] of counts) {
    const item = byId.get(id);
    if (item && (!mostWorn || count > mostWorn.count)) mostWorn = { item, count };
  }

  // By colour name (navy, khaki, olive), drawn in the piece's own measured colour: families
  // would paint olive and khaki as "yellow".
  const mix = new Map<string, { hex: string; v: number }>();
  let total = 0;
  for (const w of inMonth)
    for (const id of w.itemIds) {
      const item = byId.get(id);
      if (!item) continue;
      for (const c of item.colors) {
        const cur = mix.get(c.name);
        mix.set(c.name, { hex: cur?.hex ?? c.hex, v: (cur?.v ?? 0) + c.share });
        total += c.share;
      }
    }

  const wornLive = live.filter((i) => counts.has(i.id)).length;
  return {
    wornDays: new Set(inMonth.map((w) => w.localDate)).size,
    piecesWorn: counts.size,
    closetUsed: live.length ? wornLive / live.length : 0,
    mostWorn,
    streak: longestStreak(wears),
    colourMix: [...mix]
      .map(([name, { hex, v }]) => ({ name, hex, share: total ? v / total : 0 }))
      .sort((a, b) => b.share - a.share),
  };
}

export function longestStreak(wears: Wear[]): number {
  const days = [...new Set(wears.map((w) => w.localDate))].sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && daysBetween(days[i - 1], days[i]) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

// 10.5: never worn and added more than 14 days ago.
export function neverWorn(items: Item[], wears: Wear[], today: string, minAgeDays = 14): Item[] {
  const worn = new Set(wears.flatMap((w) => w.itemIds));
  return items.filter((i) => !i.archived && !worn.has(i.id) && daysBetween(i.createdAt.slice(0, 10), today) > minAgeDays);
}

// 10.5: worn before, but not in the last 90 days.
export function notWornSince(items: Item[], wears: Wear[], today: string, days = 90): Item[] {
  const last = new Map<string, string>();
  for (const w of wears) for (const id of w.itemIds) if ((last.get(id) ?? "") < w.localDate) last.set(id, w.localDate);
  const cutoff = addDays(today, -days);
  return items.filter((i) => !i.archived && last.has(i.id) && last.get(i.id)! < cutoff);
}
