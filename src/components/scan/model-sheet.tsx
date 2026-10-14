"use client";

import { Icon } from "@/components/icons/icon";
import { Sheet } from "@/components/lounge/ios-bottom-sheet-detents/sheet";
import { copy } from "@/lib/copy";

// Adapted from Design Lounge phone-permission-prompt (Nº 346): explain in our own words first.
export function ModelSheet({
  open,
  progress,
  error,
  saveData,
  onDownload,
  onLater,
}: {
  open: boolean;
  progress?: number; // 0..1 while downloading
  error?: boolean;
  saveData: boolean;
  onDownload: () => void;
  onLater: () => void;
}) {
  const downloading = progress !== undefined && !error;
  return (
    <Sheet open={open} onClose={onLater} title={copy.model.title} detent="auto" dismissible={!downloading}>
      <p className="text-[15px] text-ink-2">{copy.model.body}</p>
      <ul className="mt-5 flex flex-col gap-3 text-[15px]">
        {copy.model.reasons.map((r, i) => (
          <li key={r} className="flex items-start gap-3">
            <Icon name={(["download", "wifi", "spark"] as const)[i]} size={20} className="mt-0.5 shrink-0 text-ink-2" />
            {r}
          </li>
        ))}
      </ul>
      <p className="mt-5 flex items-start gap-3 rounded-ui bg-surface-2 p-3 text-[13px] text-ink-2">
        <Icon name="lock" size={18} className="mt-0.5 shrink-0" />
        {copy.model.ai}
      </p>
      {downloading ? (
        <div className="mt-6" aria-live="polite">
          <div className="h-[6px] overflow-hidden rounded-ui bg-surface-2" role="progressbar" aria-label={copy.model.downloading} aria-valuenow={Math.round((progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
          <p className="num mt-2 text-[13px] text-ink-2">{copy.model.percent(Math.round((progress ?? 0) * 100))}</p>
        </div>
      ) : null}
      {error ? (
        <p className="mt-5 flex items-center gap-2 text-[14px] text-danger-on-soft" role="alert">
          <Icon name="alert" size={18} />
          {copy.model.failed}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-2">
        {/* With Save-Data on, Later is the first choice (6.2). */}
        {saveData ? (
          <>
            <button type="button" className="btn btn-primary w-full" onClick={onLater} autoFocus>
              {copy.model.later}
            </button>
            <button type="button" className="btn w-full" onClick={onDownload} disabled={downloading}>
              {copy.model.download}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary w-full" onClick={onDownload} disabled={downloading}>
              {error ? copy.model.retry : copy.model.download}
            </button>
            <button type="button" className="btn w-full border-transparent" onClick={onLater} disabled={downloading}>
              {copy.model.later}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
