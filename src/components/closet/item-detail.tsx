"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { CutoutImage } from "@/components/cutout-image";
import { Icon } from "@/components/icons/icon";
import { ConfirmDialog } from "@/components/lounge/m3-dialog/confirm";
import { OutfitCard } from "@/components/outfit-card";
import { TagSheet, type TagFields } from "@/components/tag-sheet";
import { archiveItem, deleteItem, editTags, enqueueTagJob, getWeights, listItems, updateItem, wearsForItem } from "@/db/repo";
import { getDb } from "@/db/schema";
import { useLive } from "@/db/use-live";
import { useSettings } from "@/db/use-settings";
import { outfitsWith } from "@/engine";
import type { Item } from "@/engine/types";
import { copy } from "@/lib/copy";
import { toLocalDate } from "@/lib/dates";
import { isDressable } from "@/lib/provisional";
import { announceItemAdded } from "@/lib/tag-runner";
import { CATEGORY_LABELS, OCCASION_LABELS, PATTERN_LABELS, SUBTYPE_LABELS, VIBE_LABELS, WARMTH_LABELS, occasionsFromVibes } from "@/lib/vocab";
import { manualWeather } from "@/lib/weather";
import { lastWeather } from "@/lib/weather-cache";

const fmtDate = (iso: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(new Date(iso));

// Adapted from Design Lounge luxe-product-detail (Nº 028): the piece on a stage, the name as
// the largest type, then the facts. A full screen layer over the closet, so the grid stays.
export function ItemDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const db = getDb();
  const item = useLive(() => db.items.get(id), [id]);
  const wears = useLive(() => wearsForItem(db, id), [id]);
  const closet = useLive(() => listItems(db));
  const settings = useSettings();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [price, setPrice] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !editing && !confirmDelete && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, confirmDelete, onClose]);

  const weights = useLive(() => getWeights(db));
  const units = settings?.units;
  const others = useMemo(() => {
    if (!item || !closet || !isDressable(item) || item.category === "accessory") return [];
    const weather = lastWeather() ?? manualWeather("mild", false);
    const occasion = item.occasions[0] ?? "casual";
    try {
      return outfitsWith(
        id,
        {
          items: closet.filter(isDressable),
          weights,
          wears: wears ?? [],
          weather,
          occasion,
          localDate: toLocalDate(),
          seed: 7,
          units,
        },
        6,
      );
    } catch {
      return [];
    }
  }, [id, item, closet, weights, wears, units]);
  const byId = useMemo(() => new Map((closet ?? []).map((i) => [i.id, i])), [closet]);

  if (!item) return null;

  const recognising = item.tagSource === "ai" && (item.tagStatus === "queued" || item.tagStatus === "pending");
  const untagged = !recognising && !isDressable({ ...item, archived: false });
  const count = wears?.length ?? 0;
  const last = wears?.at(-1)?.localDate;
  const money = item.price && count ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(item.price / count) : undefined;

  async function saveTags(tags: TagFields) {
    if (!item) return;
    setEditing(false);
    await editTags(db, item.id, { ...tags, occasions: occasionsFromVibes(tags.vibes) });
    if (!isDressable({ ...item, ...tags, tagSource: "manual", tagStatus: item.tagStatus })) await updateItem(db, item.id, { tagStatus: "manual" });
  }

  async function retag() {
    if (!item) return;
    await updateItem(db, item.id, { tagSource: "ai", tagStatus: "queued", tagCheck: false });
    await enqueueTagJob(db, item.id);
    announceItemAdded();
  }

  async function remove() {
    if (!item) return;
    setConfirmDelete(false);
    onClose();
    await deleteItem(db, item.id);
  }

  const facts: [string, string][] = [
    [copy.item.warmth, `${item.warmth} · ${WARMTH_LABELS[item.warmth]}`],
    [copy.item.pattern, PATTERN_LABELS[item.pattern]],
    [copy.item.style, item.vibes.map((v) => VIBE_LABELS[v]).join(", ")],
    [copy.item.occasions, item.occasions.map((o) => OCCASION_LABELS[o]).join(", ")],
    [copy.item.colours, [...new Set(item.colors.map((c) => c.name))].join(", ")],
  ];
  if (item.waterproof) facts.push([copy.item.waterproof, "Yes"]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label={item.name}>
      <div className="mx-auto max-w-[1120px] px-5 pt-[max(12px,env(safe-area-inset-top))] pb-[max(32px,env(safe-area-inset-bottom))]">
        <div className="flex h-[56px] items-center">
          <button type="button" className="btn -ml-3 border-transparent px-3" onClick={onClose} autoFocus>
            <Icon name="arrow-left" />
            {copy.item.back}
          </button>
        </div>

        <div className="grid gap-8 md:grid-cols-[55%_1fr] md:gap-14">
          <motion.div layoutId={`item-${item.id}`} className="relative aspect-[4/5] rounded-ui border border-line bg-surface p-8">
            <CutoutImage item={item} className="h-full w-full" />
          </motion.div>

          <section className="md:py-8">
            <p className="label">
              {CATEGORY_LABELS[item.category]} · {SUBTYPE_LABELS[item.subtype]}
            </p>
            {recognising ? (
              <span className="shimmer mt-3 block h-[40px] w-4/5 rounded-ui" aria-label={copy.closet.recognising} />
            ) : (
              <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[54px]">{item.name}</h1>
            )}
            <p className="num mt-3 text-[15px] text-ink-2">
              {copy.item.worn(count)}
              {last ? ` · ${copy.item.last(fmtDate(last))}` : ""}
              {money ? ` · ${copy.item.perWear(money)}` : ""}
            </p>

            {recognising || untagged || item.tagCheck ? (
              <p className="mt-5 rounded-ui border border-line bg-surface p-3 text-[14px] text-ink-2" role="status">
                {recognising ? copy.item.recognising : item.tagCheck ? copy.item.checkThese : copy.item.needsTag}
              </p>
            ) : null}

            <dl className="mt-6 divide-y divide-line border-y border-line">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3 text-[15px]">
                  <dt className="text-ink-2">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex flex-col gap-2">
              <button type="button" className={`btn w-full ${untagged || item.tagCheck ? "btn-primary" : ""}`} onClick={() => setEditing(true)}>
                <Icon name="edit" size={18} />
                {untagged ? copy.item.tagNow : copy.item.edit}
              </button>
              {item.tagCheck ? (
                <button type="button" className="btn w-full" onClick={() => updateItem(db, item.id, { tagCheck: false })}>
                  <Icon name="check" size={18} />
                  {copy.item.confirm}
                </button>
              ) : null}
              {settings?.aiConsent !== false && !recognising ? (
                <button type="button" className="btn w-full border-transparent" onClick={retag}>
                  <Icon name="spark" size={18} />
                  {copy.item.retag}
                </button>
              ) : null}
            </div>

            <label className="mt-6 block text-[13px] text-ink-2" htmlFor="price">
              {copy.item.price}
            </label>
            <input
              id="price"
              inputMode="decimal"
              defaultValue={item.price ?? ""}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={() => {
                const v = Number(price.replace(",", "."));
                if (price && Number.isFinite(v) && v >= 0) void updateItem(db, item.id, { price: v });
              }}
              className="num mt-1 min-h-[48px] w-40 rounded-ui border border-line-strong bg-surface px-3 text-[16px]"
            />
          </section>
        </div>

        {others.length ? (
          <section className="mt-12" aria-labelledby="with-this">
            <h2 id="with-this" className="plain text-[20px]">
              {copy.item.with}
            </h2>
            <ul className="-mx-5 mt-4 flex snap-x gap-3 overflow-x-auto px-5 pb-2">
              {others.map((o) => (
                <li key={o.signature} className="w-[220px] shrink-0 snap-start overflow-hidden rounded-ui border border-line bg-surface">
                  <OutfitCard dealt={o} items={byId} />
                  <p className="px-3 pt-2 pb-3 text-[13px] leading-[1.4] text-ink-2">{o.reason}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-12 flex flex-wrap gap-2 border-t border-line pt-6">
          <button type="button" className="btn" onClick={() => archiveItem(db, item.id, !item.archived)}>
            <Icon name="archive" size={18} />
            {item.archived ? copy.item.unretire : copy.item.retire}
          </button>
          <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={18} />
            {copy.item.delete}
          </button>
          <p className="w-full text-[13px] text-ink-2">{copy.item.retiredNote}</p>
        </section>
      </div>

      <TagSheet open={editing} colors={item.colors} initial={item as Partial<Item>} onSave={saveTags} onClose={() => setEditing(false)} />
      <ConfirmDialog
        open={confirmDelete}
        title={copy.item.deleteTitle}
        body={copy.item.deleteBody}
        confirm={copy.item.deleteConfirm}
        cancel={copy.common.cancel}
        danger
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
