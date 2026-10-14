"use client";

import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";

const RELOAD_KEY = "mw-sw-reload";

// Adapted from Design Lounge pwa-update-toast: registers the worker (production only) and,
// when a new one is waiting, offers a reload. Never reloads by itself (prompt 11).
export function ServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker>();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    // Reload only when the person tapped Reload (the first install also changes the
    // controller, via clientsClaim, and must not reload the page under them).
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (sessionStorage.getItem(RELOAD_KEY) !== "1") return;
      sessionStorage.removeItem(RELOAD_KEY);
      window.location.reload();
    });
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          next?.addEventListener("statechange", () => {
            if (next.state === "installed" && navigator.serviceWorker.controller) setWaiting(next);
          });
        });
        // Look for a new version whenever the app comes back to the front.
        document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && reg.update().catch(() => {}));
      })
      .catch(() => {});
  }, []);

  if (!waiting) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[max(12px,env(safe-area-inset-top))] z-50 mx-auto flex max-w-[480px] items-center justify-between gap-3 rounded-ui bg-inverse px-4 py-2 text-[14px] text-inverse-ink"
    >
      {copy.pwa.update}
      <button
        type="button"
        className="min-h-[44px] px-2 underline"
        onClick={() => {
          sessionStorage.setItem(RELOAD_KEY, "1");
          waiting.postMessage({ type: "SKIP_WAITING" });
        }}
      >
        {copy.pwa.reload}
      </button>
    </div>
  );
}
