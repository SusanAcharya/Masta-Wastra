"use client";

import { LayoutGroup } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons/icon";
import { Sheet } from "@/components/lounge/ios-bottom-sheet-detents/sheet";
import { Chip, ChipRow } from "@/components/lounge/mobile-filter-chips-list/chips";
import { PageHeader } from "@/components/page-header";
import { StarterSlots } from "@/components/starter-slots";
import { listItems, wearStats } from "@/db/repo";
import { getDb } from "@/db/schema";
import { useLive } from "@/db/use-live";
import { CATEGORIES, OCCASIONS, PATTERNS, VIBES, type Category, type Warmth } from "@/engine/types";
import { activeFilterCount, filterCloset, sortCloset, type ClosetFilter, type ClosetSort } from "@/lib/closet-filter";
import { copy } from "@/lib/copy";
import { OCCASION_LABELS, PATTERN_LABELS, VIBE_LABELS, WARMTH_LABELS } from "@/lib/vocab";
import { ItemDetail } from "./item-detail";
import { ItemTile } from "./item-tile";
import { RecutBanner } from "./recut-banner";

const FAMILIES: { id: string; label: string; swatch: string }[] = [
  { id: "dark", label: "Black and dark", swatch: "#1c1c1c" },
  { id: "grey", label: "Grey", swatch: "#8e8f91" },
  { id: "light", label: "White and cream", swatch: "#f4f3ef" },
  { id: "red", label: "Red", swatch: "#b8312f" },
  { id: "orange", label: "Orange and brown", swatch: "#b98a56" },
  { id: "yellow", label: "Yellow", swatch: "#e2c13f" },
  { id: "green", label: "Green", swatch: "#3f7a46" },
  { id: "teal", label: "Teal", swatch: "#2d7f7c" },
  { id: "blue", label: "Blue", swatch: "#2f5fa8" },
  { id: "purple", label: "Purple", swatch: "#6a4a8c" },
  { id: "pink", label: "Pink", swatch: "#e3a1b4" },
];

const SORTS: ClosetSort[] = ["newest", "most-worn", "least-worn", "colour"];

function toggle<T>(list: T[] | undefined, v: T): T[] {
  const cur = list ?? [];
  return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
}

export function ClosetScreen() {
  const db = getDb();
  const items = useLive(() => listItems(db, { includeArchived: true }));
  const stats = useLive(() => wearStats(db));
  const [filter, setFilter] = useState<ClosetFilter>({});
  const [sort, setSort] = useState<ClosetSort>("newest");
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState<string>();

  // The open piece lives in the URL (?item=), so the back gesture closes it and a reload keeps it.
  useEffect(() => {
    const read = () => setOpen(new URLSearchParams(location.search).get("item") ?? undefined);
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  function openItem(id: string) {
    history.pushState(null, "", `/closet?item=${id}`);
    setOpen(id);
  }
  function closeItem() {
    if (new URLSearchParams(location.search).get("item")) history.back();
    setOpen(undefined);
  }

  const live = useMemo(() => items?.filter((i) => !i.archived) ?? [], [items]);
  const shown = useMemo(
    () => (items && stats ? sortCloset(filterCloset(items, filter, stats), sort, stats) : []),
    [items, stats, filter, sort],
  );
  const counts = useMemo(() => {
    const c = new Map<Category, number>();
    for (const i of live) c.set(i.category, (c.get(i.category) ?? 0) + 1);
    return c;
  }, [live]);
  const more = activeFilterCount({ ...filter, categories: undefined, neverWorn: undefined, needsTags: undefined });

  if (items && !items.length) {
    return (
      <>
        <PageHeader eyebrow={copy.closet.count(0)} title={copy.closet.title} />
        <p className="max-w-[44ch] text-[15px] text-ink-2">{copy.closet.emptyBody}</p>
        <div className="mt-6">
          <StarterSlots />
        </div>
        <Link href="/scan" className="btn btn-primary mt-8 w-full">
          {copy.closet.emptyAction}
        </Link>
      </>
    );
  }

  return (
    <LayoutGroup>
      <PageHeader
        eyebrow={items ? copy.closet.count(live.length) : ""}
        title={copy.closet.title}
        trailing={
          <Link href="/scan" className="btn">
            <Icon name="plus" size={18} />
            {copy.closet.add}
          </Link>
        }
      />

      <RecutBanner />

      <div className="-mx-5 overflow-x-auto px-5 pb-2" role="group" aria-label={copy.closet.filterLabel}>
        <div className="flex w-max gap-2">
          <Chip pressed={!filter.categories?.length} onClick={() => setFilter({ ...filter, categories: [] })}>
            {copy.closet.all}
          </Chip>
          {CATEGORIES.filter((c) => counts.get(c)).map((c) => (
            <Chip key={c} pressed={!!filter.categories?.includes(c)} onClick={() => setFilter({ ...filter, categories: toggle(filter.categories, c) })}>
              {copy.closet.groups[c]} <span className="num text-ink-2">{counts.get(c)}</span>
            </Chip>
          ))}
          <Chip pressed={!!filter.neverWorn} onClick={() => setFilter({ ...filter, neverWorn: !filter.neverWorn })}>
            {copy.closet.neverWorn}
          </Chip>
          <Chip pressed={!!filter.needsTags} onClick={() => setFilter({ ...filter, needsTags: !filter.needsTags })}>
            {copy.closet.needsTags}
          </Chip>
          <Chip pressed={!!filter.archived} onClick={() => setFilter({ ...filter, archived: !filter.archived })}>
            {copy.closet.retired}
          </Chip>
        </div>
      </div>

      <div className="mt-2 mb-4 flex items-center justify-between gap-3">
        <button type="button" className="btn px-3" onClick={() => setSheet(true)}>
          <Icon name="filter" size={18} />
          {more ? copy.closet.filtersActive(more) : copy.closet.filters}
        </button>
        <label className="flex items-center gap-2 text-[14px] text-ink-2">
          {copy.closet.sort}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ClosetSort)}
            className="min-h-[44px] rounded-ui border border-line-strong bg-surface px-2 text-[15px] text-ink"
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {copy.closet.sorts[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {items && !shown.length ? (
        <section className="py-10" aria-live="polite">
          <h2 className="plain text-[20px]">{copy.closet.noMatch}</h2>
          <p className="mt-2 text-[15px] text-ink-2">{copy.closet.noMatchBody}</p>
          <button type="button" className="btn mt-4" onClick={() => setFilter({})}>
            {copy.closet.clear}
          </button>
        </section>
      ) : (
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
          {shown.map((item) => (
            <ItemTile key={item.id} item={item} onOpen={() => openItem(item.id)} />
          ))}
        </div>
      )}

      <Sheet open={sheet} onClose={() => setSheet(false)} title={copy.closet.filters} detent="full">
        <div className="flex flex-col gap-6 pb-2">
          <section>
            <p className="label mb-3">{copy.closet.colour}</p>
            <ChipRow label={copy.closet.colour}>
              {FAMILIES.map((f) => (
                <Chip key={f.id} pressed={!!filter.families?.includes(f.id)} onClick={() => setFilter({ ...filter, families: toggle(filter.families, f.id) })}>
                  <span className="h-4 w-4 rounded-full border border-line-strong" style={{ background: f.swatch }} aria-hidden="true" />
                  {f.label}
                </Chip>
              ))}
            </ChipRow>
          </section>
          <section>
            <p className="label mb-3">{copy.closet.warmth}</p>
            <ChipRow label={copy.closet.warmth}>
              {([1, 2, 3, 4, 5] as Warmth[]).map((w) => (
                <Chip key={w} pressed={!!filter.warmth?.includes(w)} onClick={() => setFilter({ ...filter, warmth: toggle(filter.warmth, w) })}>
                  {WARMTH_LABELS[w]}
                </Chip>
              ))}
            </ChipRow>
          </section>
          <section>
            <p className="label mb-3">{copy.closet.occasion}</p>
            <ChipRow label={copy.closet.occasion}>
              {OCCASIONS.map((o) => (
                <Chip key={o} pressed={!!filter.occasions?.includes(o)} onClick={() => setFilter({ ...filter, occasions: toggle(filter.occasions, o) })}>
                  {OCCASION_LABELS[o]}
                </Chip>
              ))}
            </ChipRow>
          </section>
          <section>
            <p className="label mb-3">{copy.closet.style}</p>
            <ChipRow label={copy.closet.style}>
              {VIBES.map((v) => (
                <Chip key={v} pressed={!!filter.vibes?.includes(v)} onClick={() => setFilter({ ...filter, vibes: toggle(filter.vibes, v) })}>
                  {VIBE_LABELS[v]}
                </Chip>
              ))}
            </ChipRow>
          </section>
          <section>
            <p className="label mb-3">{copy.closet.pattern}</p>
            <ChipRow label={copy.closet.pattern}>
              {PATTERNS.map((p) => (
                <Chip key={p} pressed={!!filter.patterns?.includes(p)} onClick={() => setFilter({ ...filter, patterns: toggle(filter.patterns, p) })}>
                  {PATTERN_LABELS[p]}
                </Chip>
              ))}
            </ChipRow>
          </section>
          <div className="flex gap-2">
            <button type="button" className="btn flex-1" onClick={() => setFilter({})}>
              {copy.closet.clear}
            </button>
            <button type="button" className="btn btn-primary flex-1" onClick={() => setSheet(false)}>
              {copy.closet.show(shown.length)}
            </button>
          </div>
        </div>
      </Sheet>

      {open ? <ItemDetail id={open} onClose={closeItem} /> : null}
    </LayoutGroup>
  );
}
