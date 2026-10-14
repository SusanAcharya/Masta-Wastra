"use client";

import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons/icon";
import { ExampleDeck } from "@/components/lounge/card-stacked-deck/example-deck";
import { ChoiceRow } from "@/components/lounge/mobile-filter-chips-list/chips";
import { LocationSheet } from "@/components/location-sheet";
import { OutfitCard } from "@/components/outfit-card";
import { PageHeader } from "@/components/page-header";
import { OUTFIT_WORN } from "@/components/pwa/install-sheet";
import { StarterSlots } from "@/components/starter-slots";
import { TodayDate } from "@/components/today-date";
import { WeatherStrip } from "@/components/weather-strip";
import { listItems, updateSettings } from "@/db/repo";
import { getDb } from "@/db/schema";
import { useLive } from "@/db/use-live";
import { useSettings } from "@/db/use-settings";
import type { DealResult } from "@/engine";
import { OCCASIONS, type Occasion, type WeatherSnapshot } from "@/engine/types";
import { copy } from "@/lib/copy";
import { haptic, useCalm } from "@/lib/motion";
import { pickFirst, pickNext, preparePicker, react, rememberToday, wear, type PickContext, type Shown } from "@/lib/outfit-service";
import { isDressable } from "@/lib/provisional";
import { renderShareCard, shareOrDownload } from "@/lib/share-card";
import { OCCASION_LABELS } from "@/lib/vocab";
import { manualWeather } from "@/lib/weather";
import { weatherFor } from "@/lib/weather-cache";

const LIMIT_WORDS: Record<string, string> = {
  top: "a top",
  bottom: "a bottom",
  shoes: "a pair of shoes",
  outer: "a jacket or coat",
  mid: "a sweater or cardigan",
};

const noSubscribe = () => () => {};

// The home tab (Susan's flow): ask, and get one outfit for today's weather.
export function PickScreen() {
  const db = getDb();
  const settings = useSettings();
  const items = useLive(() => listItems(db));
  const calm = useCalm();

  const [occasion, setOccasion] = useState<Occasion>();
  const [weather, setWeather] = useState<{ snapshot: WeatherSnapshot; stale: boolean }>();
  const [placeOpen, setPlaceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ctxState, setCtxState] = useState<{ key: string; ctx: PickContext }>();
  const [session, setSession] = useState<Shown[]>([]);
  const [result, setResult] = useState<DealResult>();
  const [worn, setWorn] = useState<string>();
  const [reacted, setReacted] = useState<Record<string, "up" | "down">>({});
  const [announce, setAnnounce] = useState("");
  const [exit, setExit] = useState<1 | -1>(1);

  const dressable = items?.filter(isDressable) ?? [];
  const waiting = (items?.length ?? 0) - dressable.length;
  const canDress =
    dressable.some((i) => i.category === "shoes") &&
    (dressable.some((i) => i.category === "dress") ||
      (dressable.some((i) => i.category === "top") && dressable.some((i) => i.category === "bottom")));

  // The weekday only exists on the device: never read the clock while prerendering.
  const day = useSyncExternalStore(noSubscribe, () => new Date().getDay(), () => -1);
  const current = occasion ?? (day >= 0 ? settings?.defaultOccasionByWeekday[day] : undefined) ?? "casual";
  const units = settings?.units ?? "c";
  const shown = session[session.length - 1];

  // Weather for the saved place, once settings are known.
  const loc = settings?.location;
  useEffect(() => {
    if (!loc) return;
    let alive = true;
    weatherFor(loc.lat, loc.lon).then((w) => alive && w && setWeather(w));
    return () => {
      alive = false;
    };
  }, [loc]);

  // A new occasion, place or closet means a fresh ranking; what was shown stays on screen.
  const ctxKey = `${current}|${weather?.snapshot.fetchedAt}|${weather?.snapshot.feelsMax}|${items?.length}|${dressable.length}`;
  const ctx = ctxState?.key === ctxKey ? ctxState.ctx : undefined;

  async function ensureCtx(): Promise<PickContext | undefined> {
    if (ctx) return ctx;
    if (!weather) return undefined;
    const next = await preparePicker(current, weather.snapshot);
    setCtxState({ key: ctxKey, ctx: next });
    return next;
  }

  async function pick(more: boolean) {
    if (!weather) return setPlaceOpen(true);
    setBusy(true);
    try {
      const c = await ensureCtx();
      if (!c) return;
      const { shown: s, result: r } = more && session.length ? await pickNext(c, session) : await pickFirst(c);
      setResult(r);
      setWorn(undefined);
      if (s) {
        const nextSession = more ? [...session, s] : [s];
        setSession(nextSession);
        await rememberToday(current, weather.snapshot, nextSession);
        setAnnounce(s.dealt.reason);
      } else {
        setAnnounce(copy.today.outOf);
        if (!more) setSession([]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function another() {
    if (!shown || busy) return;
    setExit(-1);
    await react("skip", shown, session);
    await pick(true);
  }

  async function wearIt() {
    if (!shown || !weather || worn) return;
    setExit(1);
    haptic();
    await wear(shown, session, current, weather.snapshot);
    setWorn(shown.outfit.id);
    setAnnounce(copy.today.wornNote);
    window.dispatchEvent(new Event(OUTFIT_WORN));
  }

  const [sharing, setSharing] = useState(false);
  async function shareIt() {
    if (!shown || !ctx) return;
    setSharing(true);
    try {
      const slots = shown.dealt.slots as Record<string, string | undefined>;
      const get = (id?: string) => (id ? ctx.items.get(id) : undefined);
      const blob = await renderShareCard({
        pieces: {
          outer: get(slots.outer) ?? get(slots.mid),
          top: get(slots.top) ?? get(slots.dress),
          bottom: get(slots.bottom),
          shoes: get(slots.shoes),
          accessory: get(slots.accessory),
        },
        reason: shown.dealt.reason,
        weather: weather?.snapshot,
        units,
      });
      await shareOrDownload(blob, `masta-wastra-${new Date().toISOString().slice(0, 10)}.png`, copy.app.name);
    } finally {
      setSharing(false);
    }
  }

  async function thumb(signal: "up" | "down") {
    if (!shown) return;
    setReacted((r) => ({ ...r, [shown.outfit.id]: signal }));
    await react(signal, shown, session);
    if (signal === "down") await another();
  }

  // Swipe (prompt 9.3): commit past 35% of the width or a 600 px/s flick; max 8 degrees.
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-8, 0, 8]);
  const wearStamp = useTransform(x, [0, 70], [0, 1]);
  const nextStamp = useTransform(x, [-70, 0], [1, 0]);
  function onDragEnd(_: unknown, info: PanInfo) {
    const width = (info.point.x && window.innerWidth) || 390;
    if (info.offset.x > width * 0.35 || info.velocity.x > 600) void wearIt();
    else if (info.offset.x < -width * 0.35 || info.velocity.x < -600) void another();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      void wearIt();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      void another();
    }
  }

  async function setPlace(location: NonNullable<typeof loc>) {
    setPlaceOpen(false);
    setWeather(undefined);
    await updateSettings(db, { location });
  }

  function setManual(p: Parameters<typeof manualWeather>[0], rain: boolean) {
    setPlaceOpen(false);
    setWeather({ snapshot: manualWeather(p, rain), stale: false });
  }

  if (items && !canDress) {
    return (
      <>
        <PageHeader eyebrow={<TodayDate />} title={copy.today.title} />
        <ExampleDeck label={copy.today.exampleLabel} reason={copy.today.exampleReason} />
        <section className="mt-8" aria-labelledby="today-empty">
          <h2 id="today-empty" className="plain text-[20px]">
            {copy.today.emptyTitle}
          </h2>
          <p className="mt-2 max-w-[44ch] text-[15px] text-ink-2">{copy.today.emptyBody}</p>
          {waiting ? <p className="mt-2 text-[14px] text-ink-2">{copy.today.waiting(waiting)}</p> : null}
          <Link href="/scan" className="btn btn-primary mt-5 w-full">
            {copy.today.emptyAction}
          </Link>
          <p className="label mt-8 mb-3">{copy.today.need}</p>
          <StarterSlots compact />
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow={<TodayDate />} title={copy.today.title} />

      {weather && loc ? (
        <WeatherStrip place={loc.name} weather={weather.snapshot} stale={weather.stale} units={units} onChange={() => setPlaceOpen(true)} />
      ) : weather ? (
        <WeatherStrip place={copy.location.title} weather={weather.snapshot} units={units} onChange={() => setPlaceOpen(true)} />
      ) : settings && !loc ? (
        <section className="rounded-ui border border-line bg-surface p-4">
          <h2 className="plain text-[17px]">{copy.today.noWeather}</h2>
          <p className="mt-1 text-[14px] text-ink-2">{copy.today.noWeatherBody}</p>
          <button type="button" className="btn mt-3 w-full" onClick={() => setPlaceOpen(true)}>
            <Icon name="map-pin" size={18} />
            {copy.today.setPlace}
          </button>
        </section>
      ) : (
        <div className="h-[92px] rounded-ui border border-line bg-surface" aria-hidden="true" />
      )}

      <div className="-mx-5 mt-4 overflow-x-auto px-5 pb-1">
        <div className="w-max">
          <ChoiceRow
            label={copy.today.occasion}
            value={current}
            onChange={(o) => {
              setOccasion(o);
              setSession([]);
              setResult(undefined);
            }}
            options={OCCASIONS.map((o) => ({ value: o, label: OCCASION_LABELS[o] }))}
          />
        </div>
      </div>

      {shown && ctx ? (
        <section className="mt-6" aria-label={copy.today.deck}>
          <div className="relative mx-auto w-full max-w-[400px]">
            <AnimatePresence mode="popLayout" initial={false} custom={exit}>
              <motion.article
                key={shown.outfit.id}
                tabIndex={0}
                onKeyDown={onKey}
                aria-roledescription={copy.today.deck}
                aria-label={shown.dealt.reason}
                className="relative overflow-hidden rounded-ui border border-line bg-surface outline-offset-4"
                style={calm ? undefined : { x, rotate }}
                drag={calm || worn ? false : "x"}
                dragElastic={0.6}
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={onDragEnd}
                initial={calm ? { opacity: 0 } : { opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                exit={calm ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, x: exit * 320, rotate: exit * 8, transition: { duration: 0.28 } }}
                transition={calm ? { duration: 0.12 } : { type: "spring", stiffness: 260, damping: 26 }}
              >
                <OutfitCard dealt={shown.dealt} items={ctx.items} />
                {!calm ? (
                  <>
                    <motion.span
                      style={{ opacity: wearStamp }}
                      className="pointer-events-none absolute top-5 left-5 rotate-[-8deg] border-2 border-success px-2 py-1 text-[13px] tracking-[0.16em] text-success uppercase"
                      aria-hidden="true"
                    >
                      {copy.today.wear}
                    </motion.span>
                    <motion.span
                      style={{ opacity: nextStamp }}
                      className="pointer-events-none absolute top-5 right-5 rotate-[8deg] border-2 border-ink-2 px-2 py-1 text-[13px] tracking-[0.16em] text-ink-2 uppercase"
                      aria-hidden="true"
                    >
                      {copy.today.another}
                    </motion.span>
                  </>
                ) : null}
                <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-4">
                  <div>
                    <p className="text-[16px] leading-[1.45]">{shown.dealt.reason}</p>
                    <p className="num mt-1 text-[12px] text-ink-2">{copy.today.score(shown.dealt.displayScore)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="grid h-11 w-11 place-items-center rounded-ui text-ink-2 hover:bg-surface-2 aria-pressed:text-primary"
                      aria-pressed={reacted[shown.outfit.id] === "up"}
                      aria-label={copy.today.like}
                      onClick={() => thumb("up")}
                    >
                      <Icon name="thumbs-up" size={20} />
                    </button>
                    <button
                      type="button"
                      className="grid h-11 w-11 place-items-center rounded-ui text-ink-2 hover:bg-surface-2"
                      aria-label={copy.today.dislike}
                      onClick={() => thumb("down")}
                    >
                      <Icon name="thumbs-down" size={20} />
                    </button>
                  </div>
                </div>
              </motion.article>
            </AnimatePresence>
          </div>

          {worn ? (
            <div className="mt-4 flex flex-col items-center gap-3">
              <p className="flex items-center justify-center gap-2 text-[15px] text-success-on-soft" role="status">
                <Icon name="check" size={20} />
                {copy.today.wearing}
              </p>
              <button type="button" className="btn" onClick={shareIt} disabled={sharing}>
                <Icon name="share" size={18} />
                {sharing ? copy.today.sharing : copy.today.share}
              </button>
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" className="btn px-3 whitespace-nowrap" onClick={another} disabled={busy}>
                  <Icon name="undo" size={18} />
                  {copy.today.another}
                </button>
                <button type="button" className="btn btn-primary px-3 whitespace-nowrap" onClick={wearIt} disabled={busy}>
                  <Icon name="check" size={18} />
                  {copy.today.wear}
                </button>
              </div>
              {!calm ? <p className="mt-3 text-center text-[13px] text-ink-2">{copy.today.swipeHint}</p> : null}
            </>
          )}
        </section>
      ) : (
        <div className="mt-8">
          <button type="button" className="btn btn-primary w-full min-h-[64px] text-[17px]" onClick={() => pick(false)} disabled={busy || !settings}>
            <Icon name="spark" size={22} />
            {busy ? copy.today.picking : copy.today.pick}
          </button>
          {result && !result.outfits.length ? (
            <p className="mt-4 text-[15px] text-ink-2" role="status">
              {copy.today.outOf}
            </p>
          ) : null}
        </div>
      )}

      {ctx?.relaxed && shown ? <p className="mt-4 text-[14px] text-ink-2">{copy.today.closest(OCCASION_LABELS[current])}</p> : null}
      {result?.limiting && shown ? (
        <p className="mt-4 text-[14px] text-ink-2">
          {copy.today.limiting(LIMIT_WORDS[result.limiting.slot] ?? result.limiting.slot)}{" "}
          <Link href="/scan">{copy.tabs.scan}</Link>
        </p>
      ) : null}
      {waiting ? <p className="mt-2 text-[14px] text-ink-2">{copy.today.waiting(waiting)}</p> : null}

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <LocationSheet open={placeOpen} onClose={() => setPlaceOpen(false)} onPlace={setPlace} onManual={setManual} />
    </>
  );
}
