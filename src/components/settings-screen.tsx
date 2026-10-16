"use client";

import { useEffect, useRef, useState } from "react";
import { Credit } from "@/components/credit";
import { Icon } from "@/components/icons/icon";
import { ConfirmDialog } from "@/components/lounge/m3-dialog/confirm";
import { LinkRow, SettingsSection } from "@/components/lounge/m3-settings-list/settings-list";
import { ActionRow, StaticRow, SwitchRow } from "@/components/lounge/m3-settings-list/rows";
import { ThemeRow } from "@/components/lounge/m3-settings-list/theme-row";
import { Sheet } from "@/components/lounge/ios-bottom-sheet-detents/sheet";
import { ChoiceRow } from "@/components/lounge/mobile-filter-chips-list/chips";
import { LocationSheet } from "@/components/location-sheet";
import { backupFileName, exportBackup, importBackup, previewBackup, readBackup, type BackupPreview, type ParsedBackup } from "@/db/backup";
import { clearAllData, dropOriginals, resetWeights, updateSettings } from "@/db/repo";
import { getDb } from "@/db/schema";
import { useSettings } from "@/db/use-settings";
import { OCCASIONS, type Occasion } from "@/engine/types";
import { copy } from "@/lib/copy";
import { daysBetween, toLocalDate } from "@/lib/dates";
import { setCalmOverride, useCalmOverride } from "@/lib/motion";
import { formatBytes, storageUse, type StorageUse } from "@/lib/storage";
import { OCCASION_LABELS } from "@/lib/vocab";

const DAY_NAMES = (i: number) => new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date(2026, 9, 11 + i)); // 11 Oct 2026 is a Sunday

async function share(bytes: Uint8Array, name: string) {
  const file = new File([bytes as Uint8Array<ArrayBuffer>], name, { type: "application/zip" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch {
      // cancelled: fall back to a download
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function SettingsScreen() {
  const db = getDb();
  const settings = useSettings();
  const calm = useCalmOverride();
  const [use, setUse] = useState<StorageUse>();
  const [note, setNote] = useState<string>();
  const [placeOpen, setPlaceOpen] = useState(false);
  const [daysOpen, setDaysOpen] = useState(false);
  const [restore, setRestore] = useState<{ parsed: ParsedBackup; preview: BackupPreview }>();
  const [wipe, setWipe] = useState<0 | 1 | 2>(0);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storageUse().then(setUse);
  }, []);

  if (!settings) return <h1 className="pt-4 pb-6 text-[34px]">{copy.settings.title}</h1>;

  const sinceBackup = settings.lastBackupAt ? daysBetween(settings.lastBackupAt.slice(0, 10), toLocalDate()) : undefined;
  const set = (patch: Parameters<typeof updateSettings>[1]) => updateSettings(db, patch);

  async function backup(withPhotos: boolean) {
    setBusy(true);
    try {
      const bytes = await exportBackup(db, { withPhotos });
      await set({ lastBackupAt: new Date().toISOString() });
      await share(bytes, backupFileName());
    } finally {
      setBusy(false);
    }
  }

  async function pickBackup(f: File | undefined) {
    if (!f) return;
    try {
      const parsed = readBackup(new Uint8Array(await f.arrayBuffer()));
      setRestore({ parsed, preview: previewBackup(parsed) });
    } catch (e) {
      setNote(e instanceof Error ? e.message : copy.settings.importFailed);
    }
  }

  async function applyRestore(mode: "merge" | "replace") {
    if (!restore) return;
    setBusy(true);
    try {
      await importBackup(db, restore.parsed, mode);
      setNote(copy.settings.imported);
    } catch {
      setNote(copy.settings.importFailed);
    } finally {
      setRestore(undefined);
      setBusy(false);
    }
  }

  // Prompt 13: clears Dexie, caches and local storage, and unregisters the service worker.
  async function wipeEverything() {
    setWipe(0);
    await clearAllData(db);
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
    for (const r of (await navigator.serviceWorker?.getRegistrations()) ?? []) await r.unregister();
    window.location.assign(new URL("/", window.location.origin).href); // a full reload: no old worker or state survives
  }

  return (
    <>
      <h1 className="pt-4 pb-6 text-[34px]">{copy.settings.title}</h1>

      {sinceBackup === undefined || sinceBackup > 30 ? (
        <p className="mb-4 flex items-center gap-3 rounded-ui border border-line bg-surface p-3 text-[14px] text-ink-2">
          <Icon name="download" size={18} />
          {sinceBackup === undefined ? copy.settings.noBackup : copy.settings.remind}
        </p>
      ) : null}

      <SettingsSection title={copy.settings.dressing}>
        <ActionRow icon="map-pin" title={copy.settings.place} support={settings.location?.name ?? copy.settings.placeNone} onClick={() => setPlaceOpen(true)} />
        <ActionRow
          icon="calendar"
          title={copy.settings.weekdays}
          support={copy.settings.weekdaysHint}
          onClick={() => setDaysOpen(true)}
          trailing={<Icon name="chevron-right" className="text-ink-2" />}
        />
        <ActionRow
          icon="thermometer"
          title={copy.settings.units}
          support={settings.units === "f" ? copy.settings.unitsF : copy.settings.unitsC}
          onClick={() => set({ units: settings.units === "f" ? "c" : "f" })}
          trailing={<span className="num text-[15px] text-ink-2">{settings.units === "f" ? "°F" : "°C"}</span>}
        />
      </SettingsSection>

      <SettingsSection title={copy.settings.appearance}>
        <ThemeRow />
        <ActionRow
          icon="user"
          title={copy.figure.setting}
          support={settings.figure === "male" ? copy.figure.male : settings.figure === "female" ? copy.figure.female : copy.settings.placeNone}
          onClick={() => set({ figure: settings.figure === "female" ? "male" : "female" })}
          trailing={<span className="text-[15px] text-ink-2">{settings.figure === "male" ? copy.figure.male : copy.figure.female}</span>}
        />
        <SwitchRow
          icon="layers"
          title={copy.figure.view}
          support={(settings.outfitView ?? "figure") === "figure" ? copy.figure.viewFigure : copy.figure.viewFlat}
          checked={(settings.outfitView ?? "figure") === "figure"}
          onChange={(on) => set({ outfitView: on ? "figure" : "flat" })}
        />
        <SwitchRow
          icon="eye"
          title={copy.settings.calm}
          support={calm ? copy.settings.calmOn : copy.settings.calmOff}
          checked={calm}
          onChange={(v) => {
            setCalmOverride(v);
            void set({ reducedMotion: v ? "on" : "system" });
          }}
        />
      </SettingsSection>

      <SettingsSection title={copy.settings.closetSection}>
        <SwitchRow
          icon="spark"
          title={copy.settings.ai}
          support={settings.aiConsent === false ? copy.settings.aiOff : copy.settings.aiOn}
          checked={settings.aiConsent !== false}
          onChange={(v) => set({ aiConsent: v })}
        />
        <SwitchRow
          icon="layers"
          title={copy.settings.quality}
          support={settings.cutoutModel === "isnet_fp16" ? copy.settings.qualityHigh : copy.settings.qualityStandard}
          checked={settings.cutoutModel === "isnet_fp16"}
          onChange={(v) => set({ cutoutModel: v ? "isnet_fp16" : "isnet_quint8", modelReady: false })}
        />
        <SwitchRow
          icon="image"
          title={copy.settings.originals}
          support={settings.keepOriginals ? copy.settings.originalsOn : copy.settings.originalsOff}
          checked={settings.keepOriginals}
          onChange={(v) => set({ keepOriginals: v })}
        />
        {!settings.keepOriginals ? (
          <ActionRow
            icon="trash"
            title={copy.settings.dropOriginals}
            onClick={async () => setNote(copy.settings.dropped(await dropOriginals(db)))}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection title={copy.settings.data}>
        <StaticRow icon="folder" title={copy.settings.storage} support={use ? copy.settings.storageUse(formatBytes(use.usedBytes), use.persisted) : "…"} />
        <ActionRow
          icon="download"
          title={copy.settings.export}
          support={sinceBackup !== undefined ? copy.settings.lastBackup(sinceBackup) : copy.settings.exportHint}
          onClick={() => !busy && backup(true)}
        />
        <ActionRow icon="file" title={copy.settings.exportLite} support={copy.settings.exportLiteHint} onClick={() => !busy && backup(false)} />
        <ActionRow icon="upload" title={copy.settings.import} support={copy.settings.importHint} onClick={() => file.current?.click()} />
        <ActionRow
          icon="undo"
          title={copy.settings.resetTaste}
          support={copy.settings.resetTasteHint}
          onClick={async () => {
            await resetWeights(db);
            setNote(copy.settings.resetDone);
          }}
        />
        <ActionRow icon="trash" title={copy.settings.wipe} support={copy.settings.wipeHint} onClick={() => setWipe(1)} tone="danger" />
      </SettingsSection>

      <SettingsSection title={copy.settings.aboutSection}>
        <LinkRow href="/about" icon="info" title={copy.settings.about} support={copy.settings.aboutSupport} />
        <LinkRow href="/about#privacy" icon="lock" title={copy.settings.privacy} support={copy.settings.privacySupport} />
      </SettingsSection>

      <Credit className="mt-10 text-center" />

      <input
        ref={file}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        aria-label={copy.settings.import}
        tabIndex={-1}
        onChange={(e) => {
          void pickBackup(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <p className="sr-only" aria-live="polite">
        {note}
      </p>
      {note ? (
        <div className="fixed inset-x-4 bottom-[calc(var(--tabbar-clear)-20px)] z-30 mx-auto flex max-w-[480px] items-center justify-between gap-3 rounded-ui bg-inverse px-4 py-3 text-[14px] text-inverse-ink">
          {note}
          <button type="button" className="min-h-[44px] px-2 underline" onClick={() => setNote(undefined)}>
            {copy.common.close}
          </button>
        </div>
      ) : null}

      <LocationSheet
        open={placeOpen}
        onClose={() => setPlaceOpen(false)}
        onPlace={async (location) => {
          setPlaceOpen(false);
          await set({ location });
        }}
        onManual={() => setPlaceOpen(false)}
      />

      <Sheet open={daysOpen} onClose={() => setDaysOpen(false)} title={copy.settings.weekdays} detent="full">
        <div className="flex flex-col gap-5">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <div key={d}>
              <p className="label mb-2">{DAY_NAMES(d)}</p>
              <ChoiceRow
                label={DAY_NAMES(d)}
                value={settings.defaultOccasionByWeekday[d]}
                onChange={(o: Occasion) => {
                  const next = [...settings.defaultOccasionByWeekday];
                  next[d] = o;
                  void set({ defaultOccasionByWeekday: next });
                }}
                options={OCCASIONS.map((o) => ({ value: o, label: OCCASION_LABELS[o] }))}
              />
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet open={!!restore} onClose={() => setRestore(undefined)} title={copy.settings.import} detent="auto">
        {restore ? (
          <>
            <p className="num text-[15px]">{copy.settings.preview(restore.preview.items, restore.preview.outfits, restore.preview.wears)}</p>
            <div className="mt-6 flex flex-col gap-2">
              <button type="button" className="btn btn-primary w-full" onClick={() => applyRestore("merge")} disabled={busy}>
                {copy.settings.merge}
              </button>
              <button type="button" className="btn w-full" onClick={() => applyRestore("replace")} disabled={busy}>
                {copy.settings.replace}
              </button>
            </div>
          </>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={wipe === 1}
        title={copy.settings.wipeTitle}
        body={copy.settings.wipeBody}
        confirm={copy.settings.wipeConfirm}
        cancel={copy.common.cancel}
        danger
        onConfirm={() => setWipe(2)}
        onCancel={() => setWipe(0)}
      />
      <ConfirmDialog
        open={wipe === 2}
        title={copy.settings.wipeAgainTitle}
        body={copy.settings.wipeAgainBody}
        confirm={copy.settings.wipeConfirm}
        cancel={copy.common.cancel}
        danger
        onConfirm={wipeEverything}
        onCancel={() => setWipe(0)}
      />
    </>
  );
}
