"use client";

import { useReducedMotion } from "motion/react";
import { useSyncExternalStore } from "react";

// Reduced motion = the system setting OR the in-app override (Settings, prompt 9.3).
export const CALM_KEY = "mw-calm";
const subscribe = (fn: () => void) => {
  window.addEventListener("storage", fn);
  window.addEventListener("mw-calm", fn);
  return () => {
    window.removeEventListener("storage", fn);
    window.removeEventListener("mw-calm", fn);
  };
};
const read = () => {
  try {
    return localStorage.getItem(CALM_KEY) === "on";
  } catch {
    return false;
  }
};

export function setCalmOverride(on: boolean) {
  try {
    if (on) localStorage.setItem(CALM_KEY, "on");
    else localStorage.removeItem(CALM_KEY);
  } catch {
    // storage blocked: the system setting still applies
  }
  window.dispatchEvent(new Event("mw-calm"));
}

export function useCalmOverride() {
  return useSyncExternalStore(subscribe, read, () => false);
}

export function useCalm(): boolean {
  const system = useReducedMotion();
  const override = useCalmOverride();
  return Boolean(system) || override;
}

export const haptic = (ms = 12) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // not supported (iOS): silent
  }
};
