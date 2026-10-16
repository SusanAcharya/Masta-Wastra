"use client";

import { LayoutGroup } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Garment, type GarmentKind } from "@/components/art/garment";
import { Icon } from "@/components/icons/icon";
import { Sheet } from "@/components/lounge/ios-bottom-sheet-detents/sheet";
import { addItem, listItems, updateSettings } from "@/db/repo";
import { getDb } from "@/db/schema";
import { useLive } from "@/db/use-live";
import { useSettings } from "@/db/use-settings";
import { BADGES, earnedBadges, nextBadge } from "@/lib/badges";
import { autoCutout, cleanCut, CUT_VERSION, manualCrop, prepare, type Captured, type CropRect, type Prepared } from "@/lib/capture";
import { copy } from "@/lib/copy";
import { useCalm } from "@/lib/motion";
import { hexToOklch } from "@/lib/oklab";
import { requestPersist, shouldAskPersist } from "@/lib/storage";
import { provisionalTags } from "@/lib/provisional";
import { announceItemAdded } from "@/lib/tag-runner";
import { itemAlt, itemName, occasionsFromVibes } from "@/lib/vocab";
import { cutoutSupported, preloadModel } from "@/workers/cutout-client";
import { ContactSheet, type SheetItem } from "./contact-sheet";
import { CropSheet } from "./crop-sheet";
import { Lift } from "./lift";
import { ModelSheet } from "./model-sheet";
import { ScanProgress } from "./progress";

type Stage = "preparing" | "cutting" | "unclean" | "crop" | "lift" | "saving";

interface Job {
  id: string;
  prepared: Prepared;
  stage: Stage;
  captured?: Captured;
  cutoutUrl?: string;
  reason?: string;
}

// Bytes the first download fetches, from resources.json for imgly 1.7.0 (docs/VERIFICATIONS.md).
// Plus the clothes parser that removes people from product photos (about 29 MB).
const PARSER_BYTES = 28_837_959;
const MODEL_BYTES = {
  isnet_quint8: 44_348_940 + 11_819_815 + 25_539 + PARSER_BYTES,
  isnet_fp16: 88_152_708 + 11_819_815 + 25_539 + PARSER_BYTES,
};

const SLOT_KIND: Record<string, GarmentKind> = { top: "top", bottom: "bottom", shoes: "shoes", outer: "outer", any: "dress" };

// Provisional until the engine's colour module lands: chroma under 0.04 is neutral (8.2).
const looksNeutral = (hex: string) => hexToOklch(hex).C < 0.04;

export function ScanFlow() {
  const db = getDb();
  const settings = useSettings();
  const items = useLive(() => listItems(db));
  const calm = useCalm();

  const [queue, setQueue] = useState<File[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [session, setSession] = useState<SheetItem[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelProgress, setModelProgress] = useState<number>();
  const [modelError, setModelError] = useState(false);
  const [manualThisSession, setManualThisSession] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [badge, setBadge] = useState<string>();
  const [cutProgress, setCutProgress] = useState<string>();
  const busy = useRef(false);

  const auto = cutoutSupported() && !!settings?.modelReady && !manualThisSession;
  const model = settings?.cutoutModel ?? "isnet_quint8";
  const count = items?.length ?? 0;
  const goal = count < 10 ? 10 : 15;
  const earned = useMemo(() => (items ? earnedBadges(items) : []), [items]);
  const upcoming = nextBadge(earned);
  const canDress = earned.includes("full-outfit");

  const slot = useMemo(() => {
    const has = (c: string) => items?.some((i) => i.category === c);
    if (!has("top") && !has("dress")) return "top";
    if (!has("bottom") && !has("dress")) return "bottom";
    if (!has("shoes")) return "shoes";
    if (!has("outer")) return "outer";
    return "any";
  }, [items]);

  // Photos always queue, even before settings have loaded; nothing a user picks is dropped.
  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    setQueue((q) => [...q, ...list]);
  }

  // The first photo without a downloaded model asks once: download, or crop by hand.
  const needsModelChoice = !!settings && queue.length > 0 && cutoutSupported() && !settings.modelReady && !manualThisSession;
  const modelSheetOpen = modelOpen || needsModelChoice;

  async function downloadModel() {
    setModelError(false);
    if (settings?.aiConsent == null) await updateSettings(db, { aiConsent: true });
    setModelProgress(0);
    const seen = new Map<string, number>();
    try {
      await preloadModel(model, (key, current) => {
        if (!key.startsWith("fetch:")) return;
        seen.set(key, current);
        const sum = [...seen.values()].reduce((a, b) => a + b, 0);
        setModelProgress(Math.min(1, sum / MODEL_BYTES[model]));
      });
      await updateSettings(db, { modelReady: true });
      setModelProgress(undefined);
      setModelOpen(false);
    } catch {
      setModelError(true);
    }
  }

  function later() {
    if (settings?.aiConsent == null) void updateSettings(db, { aiConsent: true });
    setManualThisSession(true);
    setModelOpen(false);
  }

  // Take the next photo when idle. Waits while the model sheet is deciding.
  useEffect(() => {
    if (job || busy.current || !queue.length || !settings || modelOpen || needsModelChoice) return;
    busy.current = true;
    const [file, ...rest] = queue;
    setQueue(rest);
    const id = crypto.randomUUID();
    (async () => {
      try {
        const prepared = await prepare(file, settings.keepOriginals);
        if (!auto) {
          setJob({ id, prepared, stage: "crop" });
          return;
        }
        setJob({ id, prepared, stage: "cutting" });
        setCutProgress(copy.scan.cutting);
        try {
          const captured = await autoCutout(prepared, model, (key) =>
            setCutProgress(key.startsWith("fetch:") ? copy.scan.loadingModel : copy.scan.cutting),
          );
          const cutoutUrl = URL.createObjectURL(captured.images.cutout.blob);
          setJob({ id, prepared, captured, cutoutUrl, stage: cleanCut(captured.coverage ?? 0.5) ? "lift" : "unclean" });
        } catch (err) {
          console.warn("cutout failed, falling back to a hand crop:", err);
          setJob({ id, prepared, stage: "crop", reason: copy.scan.failed });
        }
      } catch {
        setAnnounce(copy.scan.failed);
      } finally {
        busy.current = false;
      }
    })();
  }, [job, queue, settings, modelOpen, needsModelChoice, auto, model]);

  async function cropDone(rect: CropRect) {
    if (!job) return;
    const captured = await manualCrop(job.prepared, rect);
    setJob({ ...job, captured, cutoutUrl: URL.createObjectURL(captured.images.cutout.blob), stage: "lift" });
  }

  // After the Lift the piece files itself: no questions (Susan, docs/DECISIONS.md).
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const liftDone = useCallback(() => {
    setJob((j) => (j && j.stage === "lift" ? { ...j, stage: "saving" } : j));
    void saveRef.current();
  }, []);


  function discard() {
    if (job) {
      URL.revokeObjectURL(job.prepared.photoUrl);
      if (job.cutoutUrl) URL.revokeObjectURL(job.cutoutUrl);
    }
    setJob(null);
  }

  async function save() {
    if (!job?.captured || !settings) return;
    const { captured } = job;
    const colors = captured.colors.length ? captured.colors : [{ hex: "#808080", name: "grey", share: 1 }];
    const guess = provisionalTags(captured.images.cutout.w, captured.images.cutout.h, captured.detected);
    const ai = settings.aiConsent !== false;
    const { item, activeCount } = await addItem(db, {
      item: {
        ...guess,
        name: itemName(colors, guess.subtype),
        colors,
        isNeutral: looksNeutral(colors[0].hex),
        occasions: occasionsFromVibes(guess.vibes),
        // With AI on, the queue fills in the real tags. With it off, the piece waits as
        // "Needs a tag" and is never used in outfits until fixed with one tap.
        tagSource: ai ? "ai" : "manual",
        tagStatus: ai ? "queued" : "pending",
        cutoutQuality: captured.quality,
        cutVersion: captured.quality === "auto" ? CUT_VERSION : undefined,
        archived: false,
      },
      images: captured.images,
      enqueueTag: ai,
    });
    if (ai) announceItemAdded();

    setSession((s) => [...s, { id: job.id, url: job.cutoutUrl!, alt: itemAlt(item.name, item.colors), manual: captured.quality === "manual" }]);
    URL.revokeObjectURL(job.prepared.photoUrl);
    setJob(null);

    const all = await listItems(db);
    const nowEarned = earnedBadges(all);
    const fresh = nowEarned.filter((b) => !settings.badges.includes(b));
    await updateSettings(db, { badges: [...new Set([...settings.badges, ...nowEarned])] });
    const label = fresh.length ? BADGES.find((b) => b.id === fresh[fresh.length - 1])?.label : undefined;
    setBadge(label);
    setAnnounce(
      [copy.scan.added(item.name, activeCount, activeCount < 10 ? 10 : 15), label ? copy.scan.badge(label) : ""].join(" ").trim(),
    );
    // Ask the browser to keep the closet after the third piece, quietly: no sheet in the middle
    // of a batch (Susan: adding clothes must be frictionless). docs/DECISIONS.md, M6 to M9.
    if (shouldAskPersist(activeCount, settings.persistAsked)) {
      await updateSettings(db, { persistAsked: true });
      void requestPersist();
    }
  }

  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    if (!badge) return;
    const t = setTimeout(() => setBadge(undefined), 2600);
    return () => clearTimeout(t);
  }, [badge]);

  const stage = job?.stage;

  return (
    <LayoutGroup>
      <main
        id="main"
        className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(32px,env(safe-area-inset-bottom))]"
      >
        <div className="flex h-[56px] items-center justify-between">
          <p className="label">{copy.scan.title}</p>
          <Link href={canDress ? "/today" : "/closet"} className="btn -mr-3 border-transparent px-3">
            {session.length ? copy.scan.done : <Icon name="x" label={copy.scan.close} />}
          </Link>
        </div>

        {count > 0 || session.length ? (
          <div className="mb-4">
            <ScanProgress count={count} goal={goal} nextBadge={upcoming?.label} calm={calm} />
          </div>
        ) : null}

        <div className="relative aspect-[4/5] overflow-hidden rounded-ui border border-line bg-surface">
          <span className="absolute top-5 left-5 h-7 w-7 border-t-2 border-l-2 border-ink-2" aria-hidden="true" />
          <span className="absolute top-5 right-5 h-7 w-7 border-t-2 border-r-2 border-ink-2" aria-hidden="true" />
          <span className="absolute bottom-5 left-5 h-7 w-7 border-b-2 border-l-2 border-ink-2" aria-hidden="true" />
          <span className="absolute right-5 bottom-5 h-7 w-7 border-r-2 border-b-2 border-ink-2" aria-hidden="true" />

          {job && (stage === "lift" || stage === "saving") && job.cutoutUrl ? (
            stage === "lift" ? (
              <Lift id={job.id} photoUrl={job.prepared.photoUrl} cutoutUrl={job.cutoutUrl} calm={calm} onDone={liftDone} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={job.cutoutUrl}
                alt=""
                className="absolute inset-[8%] h-[84%] w-[84%] object-contain"
                style={{ filter: "drop-shadow(0 14px 16px rgba(42,33,27,0.28))", transform: "scale(1.04)" }}
              />
            )
          ) : job && (stage === "cutting" || stage === "preparing" || stage === "unclean" || stage === "crop") ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={job.prepared.photoUrl} alt="" className="absolute inset-[8%] h-[84%] w-[84%] object-contain opacity-80" />
              {stage === "cutting" && !calm ? <span className="scan-beam" aria-hidden="true" /> : null}
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center" aria-hidden="true">
              <Garment kind={SLOT_KIND[slot]} fill="var(--surface-3)" size={150} />
            </div>
          )}

          <p className="absolute right-0 bottom-3 left-0 text-center text-[14px] text-ink-2">
            {stage === "cutting" ? cutProgress : !job ? copy.scan.next(copy.scan.slots[slot as keyof typeof copy.scan.slots]) : ""}
          </p>

          {badge ? (
            <p className="badge-pop absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-ui border border-tertiary bg-surface px-3 py-2 text-[14px]">
              <Icon name="star" size={18} className="text-tertiary" />
              {badge}
            </p>
          ) : null}
        </div>

        {!count && !session.length ? (
          <>
            <h1 className="mt-6 text-[32px]">{copy.scan.headline}</h1>
            <p className="mt-2 text-[15px] text-ink-2">{copy.scan.body}</p>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-ink-2">
              {copy.scan.tips.map((tip) => (
                <li key={tip} className="flex items-center gap-1.5">
                  <Icon name="check" size={16} className="text-ink-2" />
                  {tip}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {queue.length ? <p className="mt-3 text-[13px] text-ink-2">{copy.scan.queued(queue.length)}</p> : null}

        <div className="mt-6 grid grid-cols-2 gap-2">
          <label className={`btn ${canDress ? "" : "btn-primary"} px-3 whitespace-nowrap focus-within:outline-2 focus-within:outline-focus`}>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label={copy.scan.take}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Icon name="camera" size={20} />
            {copy.scan.take}
          </label>
          <label className="btn px-3 whitespace-nowrap focus-within:outline-2 focus-within:outline-focus">
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-label={copy.scan.choose}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Icon name="image" size={20} />
            {copy.scan.choose}
          </label>
        </div>

        {canDress && !job ? (
          <section className="mt-6 rounded-ui border border-success bg-surface p-4" aria-labelledby="ready">
            <h2 id="ready" className="plain text-[18px]">
              {copy.scan.readyTitle}
            </h2>
            <p className="mt-1 text-[14px] text-ink-2">{copy.scan.readyBody}</p>
            <Link href="/today" className="btn btn-primary mt-4 w-full">
              {copy.scan.readyAction}
            </Link>
          </section>
        ) : null}

        {session.length ? (
          <div className="mt-8">
            <p className="label mb-3">{copy.scan.sheet}</p>
            <ContactSheet items={session} label={copy.scan.sheet} />
          </div>
        ) : null}

        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </main>

      <ModelSheet
        open={modelSheetOpen}
        progress={modelProgress}
        error={modelError}
        saveData={typeof navigator !== "undefined" && Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)}
        onDownload={downloadModel}
        onLater={later}
      />

      <Sheet open={stage === "unclean"} onClose={discard} title={copy.scan.unclean} detent="auto">
        <p className="text-[15px] text-ink-2">{copy.scan.uncleanBody}</p>
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" className="btn btn-primary w-full" onClick={() => job && setJob({ ...job, stage: "lift" })}>
            {copy.scan.keep}
          </button>
          <button type="button" className="btn w-full" onClick={() => job && setJob({ ...job, stage: "crop" })}>
            {copy.scan.cropByHand}
          </button>
          <button type="button" className="btn w-full border-transparent" onClick={discard}>
            {copy.scan.retake}
          </button>
        </div>
      </Sheet>

      <CropSheet open={stage === "crop"} photoUrl={job?.prepared.photoUrl} reason={job?.reason} onCrop={cropDone} onClose={discard} />


    </LayoutGroup>
  );
}
