// sRGB <-> OKLab / OKLCH (Björn Ottosson). Pure. Shared by the cutout worker (colour
// extraction) and the outfit engine (harmony, neutrals).
import { COLOR_NAMES, type ColorName } from "@/engine/types";

export type RGB = [number, number, number]; // 0..255
export interface Lab {
  L: number;
  a: number;
  b: number;
}
export interface Lch {
  L: number; // 0..1
  C: number; // chroma, 0..~0.37
  h: number; // hue in degrees, 0..360
}

const toLinear = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (x: number) => {
  const c = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

export function rgbToOklab([r8, g8, b8]: RGB): Lab {
  const r = toLinear(r8);
  const g = toLinear(g8);
  const b = toLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb({ L, a, b }: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

export function labToLch({ L, a, b }: Lab): Lch {
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { L, C: Math.hypot(a, b), h: h < 0 ? h + 360 : h };
}

export const hexToOklab = (hex: string) => rgbToOklab(hexToRgb(hex));
export const hexToOklch = (hex: string) => labToLch(hexToOklab(hex));
export const oklabToHex = (lab: Lab) => rgbToHex(oklabToRgb(lab));

export function deltaE(a: Lab, b: Lab): number {
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

// Shortest distance between two hues, 0..180 degrees.
export function hueDelta(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

const NAMED = (Object.entries(COLOR_NAMES) as [ColorName, string][]).map(([name, hex]) => ({
  name,
  lab: hexToOklab(hex),
}));

// Nearest of the 24 colour names, so measured colours get a name without AI.
export function nearestColorName(hex: string): ColorName {
  const lab = hexToOklab(hex);
  let best = NAMED[0];
  let bestD = Infinity;
  for (const c of NAMED) {
    const d = deltaE(lab, c.lab);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best.name;
}
