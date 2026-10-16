"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/icon";
import { listItems, updateSettings } from "@/db/repo";
import { getDb } from "@/db/schema";
import { useLive } from "@/db/use-live";
import { useSettings } from "@/db/use-settings";
import { copy } from "@/lib/copy";
import { needsRecut, recutItem } from "@/lib/recut";
import { preloadModel } from "@/workers/cutout-client";

// Offers the better cutout (people removed from product photos, specks cleaned) to pieces cut
// before it existed. One tap, then it works through them with a count.
export function RecutBanner() {
  const db = getDb();
  const items = useLive(() => listItems(db));
  const settings = useSettings();
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [failed, setFailed] = useState(0);
  const todo = items?.filter(needsRecut) ?? [];
  if (!settings || (!todo.length && !progress)) return null;

  async function run() {
    const model = settings!.cutoutModel ?? "isnet_quint8";
    setFailed(0);
    setProgress({ done: 0, total: todo.length });
    try {
      if (!settings!.modelReady) {
        await preloadModel(model);
        await updateSettings(db, { modelReady: true });
      }
      let done = 0;
      let bad = 0;
      for (const item of todo) {
        const ok = await recutItem(item, model).catch(() => false);
        if (!ok) bad++;
        done++;
        setProgress({ done, total: todo.length });
      }
      setFailed(bad);
    } finally {
      setTimeout(() => setProgress(undefined), 1500);
    }
  }

  const busy = !!progress && progress.done < progress.total;
  return (
    <section className="mb-4 rounded-ui border border-line bg-surface p-4" aria-live="polite">
      <p className="flex items-start gap-3 text-[15px]">
        <Icon name="spark" size={20} className="mt-0.5 shrink-0 text-ink-2" />
        {progress ? copy.recut.working(progress.done, progress.total) : copy.recut.offer(todo.length)}
      </p>
      {!progress ? <p className="mt-1 pl-8 text-[13px] text-ink-2">{copy.recut.why}</p> : null}
      {failed ? <p className="mt-1 pl-8 text-[13px] text-ink-2">{copy.recut.failed(failed)}</p> : null}
      {!progress ? (
        <button type="button" className="btn btn-primary mt-3 w-full" onClick={run}>
          {copy.recut.action}
        </button>
      ) : (
        <div className="mt-3 h-[6px] overflow-hidden rounded-ui bg-surface-2" role="progressbar" aria-label={copy.recut.action} aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
          <div className="h-full bg-primary transition-[width]" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
        </div>
      )}
      {busy ? <p className="mt-2 text-[12px] text-ink-2">{copy.recut.stay}</p> : null}
    </section>
  );
}
