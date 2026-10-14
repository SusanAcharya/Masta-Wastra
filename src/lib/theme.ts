export type ThemeMode = "system" | "light" | "dark";

export const THEME_KEY = "mw-theme";

// Theme colour for the browser chrome: linen-shop --surface, atelier-noir --bg.
export const THEME_COLOR = { light: "#f8f2e8", dark: "#0c0b0a" } as const;

// Runs before first paint (inline in <head>) so there is no flash of the wrong theme.
// Keep it tiny and dependency free; it is stringified as is.
export const themeScript = `(function(){try{var m=localStorage.getItem(${JSON.stringify(THEME_KEY)})||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.dataset.themeMode=m}catch(e){}})();`;

export function readThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themeMode = mode;
  // A forced theme must also win over the media-query theme-color tags.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.content = mode === "system" ? (m.media.includes("dark") ? THEME_COLOR.dark : THEME_COLOR.light) : THEME_COLOR[resolved];
  });
}

export function saveThemeMode(mode: ThemeMode) {
  try {
    if (mode === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
  applyTheme(mode);
}
