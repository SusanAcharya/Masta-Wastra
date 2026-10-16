"use client";

import { useEffect } from "react";
import { ITEM_ADDED, kickTagQueue } from "@/lib/tag-runner";

const MIN_WAIT = 5_000;
const MAX_WAIT = 5 * 60_000;

// Runs the tagging queue on app open, when the connection returns, when the app is visible
// again, after each new piece, and, while the app stays visible, when the next job is due
// (a retry after a busy minute, or a job whose lease ran out). Nothing runs while hidden (7.4).
export function TagRunner() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      kickTagQueue()
        .then((summary) => {
          const due = summary.nextDueAt ? new Date(summary.nextDueAt).getTime() - Date.now() : undefined;
          if (due !== undefined && document.visibilityState === "visible") {
            timer = setTimeout(run, Math.min(MAX_WAIT, Math.max(MIN_WAIT, due)));
          }
        })
        .catch(() => undefined);
    };
    run();
    window.addEventListener("online", run);
    window.addEventListener(ITEM_ADDED, run);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", run);
      window.removeEventListener(ITEM_ADDED, run);
      document.removeEventListener("visibilitychange", run);
    };
  }, []);
  return null;
}
