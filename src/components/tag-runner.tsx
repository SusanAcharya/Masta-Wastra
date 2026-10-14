"use client";

import { useEffect } from "react";
import { ITEM_ADDED, kickTagQueue } from "@/lib/tag-runner";

// Runs the tagging queue on app open, when the connection returns, when the app is
// visible again, and after each new piece. Nothing runs while hidden (7.4).
export function TagRunner() {
  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") kickTagQueue().catch(() => undefined);
    };
    run();
    window.addEventListener("online", run);
    window.addEventListener(ITEM_ADDED, run);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.removeEventListener("online", run);
      window.removeEventListener(ITEM_ADDED, run);
      document.removeEventListener("visibilitychange", run);
    };
  }, []);
  return null;
}
