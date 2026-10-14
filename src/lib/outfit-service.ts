"use client";

// Glue between the screens and the pure engine: reads the closet, wears and taste from
// Dexie, asks the engine for one outfit at a time, and records what happened.
import {
  addFeedback,
  getDealDay,
  getSettings,
  getWeights,
  listItems,
  logWear,
  putDealDay,
  putWeights,
  saveOutfit,
} from "@/db/repo";
import { getDb } from "@/db/schema";
import { applyFeedback, createPicker, decayIfDue, meanFeatures, type DealtOutfit, type DealResult } from "@/engine";
import type { Item, Occasion, Outfit, Signal, WeatherSnapshot } from "@/engine/types";
import { toLocalDate } from "./dates";
import { isDressable } from "./provisional";

export interface PickContext {
  picker: ReturnType<typeof createPicker>;
  relaxed: boolean; // nothing fitted the occasion, so every piece is allowed (said on screen)
  relax: () => void;
  items: Map<string, Item>;
  dressable: number;
  waiting: number; // pieces still being recognised or needing a tag
  localDate: string;
}

const freshSeed = () => Math.floor(Math.random() * 2 ** 31);

export async function preparePicker(occasion: Occasion, weather: WeatherSnapshot): Promise<PickContext> {
  const db = getDb();
  const [all, weights, wears, settings] = await Promise.all([
    listItems(db),
    getWeights(db),
    db.wears.toArray(), // all wears: "never worn" is computed from them
    getSettings(db),
  ]);
  const now = new Date();
  const decayed = decayIfDue(weights, now.toISOString());
  if (decayed !== weights) await putWeights(db, decayed);
  const localDate = toLocalDate(now);
  const dressable = all.filter(isDressable);
  const base = {
    weights: decayed,
    wears,
    weather,
    occasion,
    localDate,
    units: settings.units,
    neverWornBoostActive: !!settings.neverWornBoostUntil && settings.neverWornBoostUntil > now.toISOString(),
  };
  const ctx: PickContext = {
    picker: createPicker({ ...base, items: dressable }),
    relaxed: false,
    // The result is what matters: when no outfit fits the occasion, every piece may join and the
    // screen says this is the closest match. Colour, weather and layers still rule.
    relax: () => {
      if (ctx.relaxed) return;
      ctx.relaxed = true;
      ctx.picker = createPicker({ ...base, items: dressable.map((i) => ({ ...i, occasions: [...new Set([...i.occasions, occasion])] })) });
    },
    items: new Map(all.map((i) => [i.id, i])),
    dressable: dressable.length,
    waiting: all.length - dressable.length,
    localDate,
  };
  return ctx;
}

export interface Shown {
  dealt: DealtOutfit;
  outfit: Outfit;
}

export async function pickFirst(ctx: PickContext): Promise<{ shown?: Shown; result: DealResult }> {
  let { outfit, result } = ctx.picker.pick(freshSeed());
  if (!outfit && !ctx.relaxed) {
    ctx.relax();
    ({ outfit, result } = ctx.picker.pick(freshSeed()));
  }
  return { shown: outfit ? await record(outfit) : undefined, result };
}

export async function pickNext(ctx: PickContext, already: Shown[]): Promise<{ shown?: Shown; result: DealResult }> {
  const { outfit, result } = ctx.picker.another(
    already.map((s) => s.dealt.signature),
    freshSeed(),
  );
  return { shown: outfit ? await record(outfit) : undefined, result };
}

// Every shown outfit is stored (so a wear can point at it) and remembered for today.
async function record(dealt: DealtOutfit): Promise<Shown> {
  const db = getDb();
  const outfit = await saveOutfit(db, dealt.itemIds, {
    source: "deal",
    score: dealt.displayScore,
    breakdown: dealt.breakdown,
    reason: dealt.reason,
  });
  return { dealt, outfit };
}

export async function rememberToday(occasion: Occasion, weather: WeatherSnapshot, shown: Shown[], pickedId?: string) {
  const db = getDb();
  const localDate = toLocalDate();
  const prev = await getDealDay(db, localDate);
  await putDealDay(db, {
    localDate,
    occasion,
    weather,
    outfitIds: shown.slice(-3).map((s) => s.outfit.id),
    shownOutfitIds: [...new Set([...(prev?.shownOutfitIds ?? []), ...shown.map((s) => s.outfit.id)])],
    seed: prev?.seed ?? 0,
    reshuffles: Math.max(0, shown.length - 1),
    pickedOutfitId: pickedId ?? prev?.pickedOutfitId,
  });
}

// Learning (8.6): every signal is centred on the outfits shown in this session.
export async function react(signal: Signal, target: Shown, session: Shown[]) {
  const db = getDb();
  const dealMean = meanFeatures(session.map((s) => s.dealt.features));
  await addFeedback(db, { outfitId: target.outfit.id, signal, features: target.dealt.features, dealMean });
  const weights = await getWeights(db);
  await putWeights(db, applyFeedback(weights, { signal, features: target.dealt.features, dealMean, itemIds: target.dealt.itemIds }));
}

export async function wear(target: Shown, session: Shown[], occasion: Occasion, weather: WeatherSnapshot) {
  const db = getDb();
  await logWear(db, target.outfit, toLocalDate());
  await react("wear", target, session);
  await rememberToday(occasion, weather, session, target.outfit.id);
}
