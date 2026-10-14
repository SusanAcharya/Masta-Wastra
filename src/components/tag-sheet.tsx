"use client";

import { useState } from "react";
import { Garment, type GarmentKind } from "@/components/art/garment";
import { Icon } from "@/components/icons/icon";
import { Sheet } from "@/components/lounge/ios-bottom-sheet-detents/sheet";
import { Chip, ChipRow, ChoiceRow } from "@/components/lounge/mobile-filter-chips-list/chips";
import {
  CATEGORIES,
  PATTERNS,
  SUBTYPES,
  VIBES,
  type Category,
  type Item,
  type Pattern,
  type Subtype,
  type Vibe,
  type Warmth,
} from "@/engine/types";
import { copy } from "@/lib/copy";
import {
  CATEGORY_LABELS,
  defaultVibes,
  defaultWarmth,
  defaultWaterproof,
  itemName,
  PATTERN_LABELS,
  SUBTYPE_LABELS,
  subtypesOf,
  VIBE_LABELS,
  WARMTH_LABELS,
} from "@/lib/vocab";

export type TagFields = Pick<Item, "category" | "subtype" | "layer" | "warmth" | "pattern" | "vibes" | "waterproof" | "name">;

const KIND: Record<Category, GarmentKind | null> = {
  top: "top",
  bottom: "bottom",
  dress: "dress",
  outer: "outer",
  shoes: "shoes",
  accessory: null,
};

type Props = {
  open: boolean;
  colors: Item["colors"];
  initial?: Partial<TagFields>;
  title?: string;
  onSave: (tags: TagFields) => void;
  onClose: () => void;
};

// Manual tagging (7.4): what it is first, then everything else is pre-filled from it.
// Two taps for most pieces: a category tile and a subtype chip, then Save.
export function TagSheet({ open, colors, initial, title = copy.tag.title, onSave, onClose }: Props) {
  const [category, setCategory] = useState<Category | undefined>(initial?.category);
  const [subtype, setSubtype] = useState<Subtype | undefined>(initial?.subtype);
  const [warmth, setWarmth] = useState<Warmth>(initial?.warmth ?? 2);
  const [pattern, setPattern] = useState<Pattern>(initial?.pattern ?? "solid");
  const [vibes, setVibes] = useState<Vibe[]>(initial?.vibes ?? ["casual"]);
  const [waterproof, setWaterproof] = useState(initial?.waterproof ?? false);
  const [touched, setTouched] = useState({ warmth: !!initial?.warmth, vibes: !!initial?.vibes, waterproof: initial?.waterproof !== undefined });

  // Each opening starts from `initial` (state adjusted during render, not in an effect).
  const [openedWith, setOpenedWith] = useState<{ open: boolean; initial?: Partial<TagFields> }>({ open, initial });
  if (openedWith.open !== open || openedWith.initial !== initial) {
    setOpenedWith({ open, initial });
    if (open) {
      setCategory(initial?.category);
      setSubtype(initial?.subtype);
      setWarmth(initial?.warmth ?? 2);
      setPattern(initial?.pattern ?? "solid");
      setVibes(initial?.vibes ?? ["casual"]);
      setWaterproof(initial?.waterproof ?? false);
      setTouched({ warmth: !!initial?.warmth, vibes: !!initial?.vibes, waterproof: initial?.waterproof !== undefined });
    }
  }

  function pickSubtype(s: Subtype) {
    setSubtype(s);
    if (!touched.warmth) setWarmth(defaultWarmth(s));
    if (!touched.vibes) setVibes(defaultVibes(s));
    if (!touched.waterproof) setWaterproof(defaultWaterproof(s));
  }

  function pickCategory(c: Category) {
    setCategory(c);
    if (subtype && SUBTYPES[subtype].category !== c) setSubtype(undefined);
    const only = subtypesOf(c);
    if (only.length === 1) pickSubtype(only[0]);
  }

  function toggleVibe(v: Vibe) {
    setTouched((t) => ({ ...t, vibes: true }));
    setVibes((cur) => (cur.includes(v) ? (cur.length > 1 ? cur.filter((x) => x !== v) : cur) : cur.length >= 3 ? cur : [...cur, v]));
  }

  const ready = category && subtype;

  return (
    <Sheet open={open} onClose={onClose} title={title} detent="full" closeLabel={copy.common.cancel}>
      <div className="flex flex-col gap-7 pb-4">
        <section>
          <p className="label mb-3">{copy.tag.what}</p>
          <ChoiceRow
            label={copy.tag.what}
            variant="tiles"
            value={category}
            onChange={pickCategory}
            options={CATEGORIES.map((c) => ({
              value: c,
              label: (
                <>
                  {KIND[c] ? (
                    <Garment kind={KIND[c]!} fill={category === c ? "var(--primary)" : "var(--ink-2)"} size={40} />
                  ) : (
                    <Icon name="bag" size={32} />
                  )}
                  <span>{CATEGORY_LABELS[c]}</span>
                </>
              ),
            }))}
          />
        </section>

        {category ? (
          <section>
            <p className="label mb-3">{copy.tag.kind}</p>
            <ChoiceRow
              label={copy.tag.kind}
              value={subtype}
              onChange={pickSubtype}
              options={subtypesOf(category).map((s) => ({ value: s, label: SUBTYPE_LABELS[s] }))}
            />
          </section>
        ) : null}

        {ready ? (
          <>
            <section>
              <p className="label mb-3">{copy.tag.warmth}</p>
              <ChoiceRow
                label={copy.tag.warmth}
                variant="segmented"
                value={warmth}
                onChange={(w) => {
                  setTouched((t) => ({ ...t, warmth: true }));
                  setWarmth(w);
                }}
                options={([1, 2, 3, 4, 5] as Warmth[]).map((w) => ({ value: w, label: <span className="num">{w}</span>, sub: WARMTH_LABELS[w] }))}
              />
            </section>
            <section>
              <p className="label mb-3">{copy.tag.pattern}</p>
              <ChoiceRow
                label={copy.tag.pattern}
                value={pattern}
                onChange={setPattern}
                options={PATTERNS.map((p) => ({ value: p, label: PATTERN_LABELS[p] }))}
              />
            </section>
            <section>
              <p className="label mb-3">{copy.tag.vibes}</p>
              <ChipRow label={copy.tag.vibes}>
                {VIBES.map((v) => (
                  <Chip key={v} pressed={vibes.includes(v)} onClick={() => toggleVibe(v)}>
                    {VIBE_LABELS[v]}
                  </Chip>
                ))}
              </ChipRow>
            </section>
            {category === "outer" || category === "shoes" ? (
              <section>
                <ChipRow label={copy.tag.waterproof}>
                  <Chip
                    pressed={waterproof}
                    onClick={() => {
                      setTouched((t) => ({ ...t, waterproof: true }));
                      setWaterproof(!waterproof);
                    }}
                  >
                    <Icon name="rain" size={20} />
                    {copy.tag.waterproof}
                  </Chip>
                </ChipRow>
              </section>
            ) : null}
          </>
        ) : null}

        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={!ready}
          onClick={() =>
            ready &&
            onSave({
              category,
              subtype,
              layer: SUBTYPES[subtype].layer,
              warmth,
              pattern,
              vibes,
              waterproof,
              name: initial?.name && initial.subtype === subtype ? initial.name : itemName(colors, subtype),
            })
          }
        >
          {ready ? copy.tag.save : copy.tag.pickFirst}
        </button>
      </div>
    </Sheet>
  );
}
