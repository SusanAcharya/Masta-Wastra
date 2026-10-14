"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/icon";
import { Sheet } from "@/components/lounge/ios-bottom-sheet-detents/sheet";
import { copy } from "@/lib/copy";

export const OUTFIT_WORN = "mw-outfit-worn";
const SNOOZE_KEY = "mw-install-snooze";
const SNOOZE_DAYS = 21;

interface BeforeInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const snoozed = () => {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
};

// Adapted from Design Lounge pwa-install-sheet: asks only after the first real success (an
// outfit worn), never on first load; "Not now" hides it for three weeks (native.md, PWAs).
export function InstallSheet() {
  const [deferred, setDeferred] = useState<BeforeInstallPrompt>();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPrompt);
    };
    const onWorn = () => {
      if (!standalone() && !snoozed()) setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener(OUTFIT_WORN, onWorn);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener(OUTFIT_WORN, onWorn);
    };
  }, []);

  function later() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
    } catch {}
    setOpen(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(undefined);
    setOpen(false);
  }

  const ios = typeof navigator !== "undefined" && isIos();
  if (!open || (!deferred && !ios)) return null;
  return (
    <Sheet open onClose={later} title={ios && !deferred ? copy.pwa.iosTitle : copy.pwa.installTitle} detent="auto">
      <p className="text-[15px] text-ink-2">{copy.pwa.installBody}</p>
      {ios && !deferred ? (
        <ol className="mt-5 flex flex-col gap-3 text-[15px]">
          {copy.pwa.iosSteps.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2">{i + 1}</span>
              {i === 0 ? (
                <span className="flex items-center gap-2">
                  {step} <Icon name="share" size={18} />
                </span>
              ) : (
                step
              )}
            </li>
          ))}
        </ol>
      ) : (
        <button type="button" className="btn btn-primary mt-6 w-full" onClick={install}>
          {copy.pwa.install}
        </button>
      )}
      <button type="button" className="btn mt-2 w-full border-transparent" onClick={later}>
        {copy.pwa.later}
      </button>
    </Sheet>
  );
}
