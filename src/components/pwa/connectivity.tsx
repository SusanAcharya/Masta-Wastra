"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons/icon";
import { copy } from "@/lib/copy";

const subscribe = (fn: () => void) => {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
};

// Adapted from Design Lounge pwa-connectivity-banner: offline is a state, not an error page.
export function ConnectivityBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const [back, setBack] = useState(false);
  const [was, setWas] = useState(online);
  if (was !== online) {
    setWas(online);
    if (online) setBack(true);
  }
  useEffect(() => {
    if (!back) return;
    const t = setTimeout(() => setBack(false), 2500);
    return () => clearTimeout(t);
  }, [back]);

  if (online && !back) return null;
  return (
    <p
      role="status"
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-2 bg-surface-2 px-4 pt-[max(6px,env(safe-area-inset-top))] pb-1.5 text-[13px] text-ink"
    >
      <Icon name={online ? "check" : "wifi"} size={16} />
      {online ? copy.pwa.online : copy.pwa.offline}
    </p>
  );
}
