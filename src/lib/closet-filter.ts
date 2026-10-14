// The closet grid's filters and sorts (10.2), as one pure query builder: every filter
// narrows (AND across groups, OR within a group), and sorting never drops a piece.
import type { Category, Item, Occasion, Pattern, Vibe, Warmth } from "@/engine/types";
import { colorFamily } from "./badges";
import { hexToOklch } from "./oklab";
import { isDressable } from "./provisional";

export interface ClosetFilter {
  categories?: Category[];
  families?: string[]; // colour families from badges.colorFamily
  warmth?: Warmth[];
  occasions?: Occasion[];
  vibes?: Vibe[];
  patterns?: Pattern[];
  neverWorn?: boolean;
  needsTags?: boolean;
  archived?: boolean; // show retired pieces instead of active ones
}

export type ClosetSort = "newest" | "most-worn" | "least-worn" | "colour";

export interface WearStat {
  count: number;
  last: string;
}

export const needsTag = (i: Item) => !isDressable({ ...i, archived: false }) || !!i.tagCheck;

const anyOf = <T,>(want: T[] | undefined, has: T[]) => !want?.length || want.some((w) => has.includes(w));

export function filterCloset(items: Item[], f: ClosetFilter, stats: Map<string, WearStat>): Item[] {
  return items.filter((i) => {
    if (!!i.archived !== !!f.archived) return false;
    if (f.categories?.length && !f.categories.includes(i.category)) return false;
    if (!anyOf(f.families, i.colors.map((c) => colorFamily(c.hex)))) return false;
    if (f.warmth?.length && !f.warmth.includes(i.warmth)) return false;
    if (!anyOf(f.occasions, i.occasions)) return false;
    if (!anyOf(f.vibes, i.vibes)) return false;
    if (f.patterns?.length && !f.patterns.includes(i.pattern)) return false;
    if (f.neverWorn && stats.has(i.id)) return false;
    if (f.needsTags && !needsTag(i)) return false;
    return true;
  });
}

export function sortCloset(items: Item[], sort: ClosetSort, stats: Map<string, WearStat>): Item[] {
  const worn = (i: Item) => stats.get(i.id)?.count ?? 0;
  const byNew = (a: Item, b: Item) => b.createdAt.localeCompare(a.createdAt);
  const list = [...items];
  switch (sort) {
    case "most-worn":
      return list.sort((a, b) => worn(b) - worn(a) || byNew(a, b));
    case "least-worn":
      return list.sort((a, b) => worn(a) - worn(b) || byNew(a, b));
    case "colour": {
      // A rainbow rack: neutrals first by lightness, then colours by hue.
      const key = (i: Item) => {
        const { L, C, h } = hexToOklch(i.primaryHex);
        return C < 0.04 ? [0, -L] : [1, h];
      };
      return list.sort((a, b) => {
        const [ga, va] = key(a);
        const [gb, vb] = key(b);
        return ga - gb || va - vb || byNew(a, b);
      });
    }
    default:
      return list.sort(byNew);
  }
}

export function activeFilterCount(f: ClosetFilter): number {
  return (
    (f.categories?.length ? 1 : 0) +
    (f.families?.length ? 1 : 0) +
    (f.warmth?.length ? 1 : 0) +
    (f.occasions?.length ? 1 : 0) +
    (f.vibes?.length ? 1 : 0) +
    (f.patterns?.length ? 1 : 0) +
    (f.neverWorn ? 1 : 0) +
    (f.needsTags ? 1 : 0)
  );
}
