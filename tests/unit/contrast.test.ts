import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 2.2 AA for every text and UI colour pair the app uses, in both themes.
// Tokens come from the copied theme files plus theme-adjustments.css, the same
// cascade the browser sees.
const STYLES = join(__dirname, "..", "..", "src", "styles");

function blocks(file: string): { selector: string; vars: Record<string, string> }[] {
  const css = readFileSync(join(STYLES, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.trim(),
    vars: Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]])),
  }));
}

function theme(mode: "light" | "dark"): Record<string, string> {
  const base = mode === "light" ? "theme-linen-shop.css" : "theme-atelier-noir.css";
  const vars: Record<string, string> = {};
  for (const file of [base, "theme-adjustments.css"]) {
    for (const b of blocks(file)) {
      const isDark = b.selector.includes('data-theme="dark"');
      if ((mode === "dark") === isDark) Object.assign(vars, b.vars);
    }
  }
  return vars;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text pairs (1.4.3, 4.5:1). Rules that keep the list honest:
// --primary text never sits on --surface-2 (outline buttons fill with --primary on hover),
// and --ink-2 never sits on --surface-3 (selected and hovered rows use --ink).
const TEXT: [string, string][] = [
  ...["ink", "ink-2", "ink-3"].flatMap((f) => ["bg", "surface", "surface-2"].map((b) => [f, b] as [string, string])),
  ["ink", "surface-3"],
  ["ink", "primary-soft"],
  ["primary-ink", "primary"],
  ["secondary-ink", "secondary"],
  ["tertiary-ink", "tertiary"],
  ["success-ink", "success"],
  ["warning-ink", "warning"],
  ["danger-ink", "danger"],
  ["info-ink", "info"],
  ["success-on-soft", "success-soft"],
  ["warning-on-soft", "warning-soft"],
  ["danger-on-soft", "danger-soft"],
  ["info-on-soft", "info-soft"],
  ["link", "bg"],
  ["link", "surface"],
  ["primary", "bg"],
  ["primary", "surface"],
  ["inverse-ink", "inverse"],
];

// Non-text UI (1.4.11, 3:1): focus rings, control borders, outline button edges.
const UI: [string, string][] = [
  ["focus", "bg"],
  ["focus", "surface"],
  ["line-strong", "bg"],
  ["line-strong", "surface"],
  ["primary", "bg"],
  ["primary", "surface"],
];

describe.each(["light", "dark"] as const)("%s theme contrast", (mode) => {
  const t = theme(mode);

  it.each(TEXT)("text --%s on --%s is at least 4.5:1", (fg, bg) => {
    expect(t[fg], fg).toBeDefined();
    expect(t[bg], bg).toBeDefined();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI)("ui --%s on --%s is at least 3:1", (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(3);
  });
});
