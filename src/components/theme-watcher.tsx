"use client";

import { useEffect } from "react";
import { applyTheme, readThemeMode } from "@/lib/theme";

// Follows the system setting live while the mode is "system".
export function ThemeWatcher() {
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readThemeMode() === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return null;
}
