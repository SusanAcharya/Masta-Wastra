// Dominant colours of a garment (6.1 step 4): k-means, k = 4, in OKLab, on opaque pixels.
// Clusters under 8% share are dropped, the top 3 kept, shares renormalised. Pure and
// deterministic (same pixels, same colours), so it runs in the worker and in tests alike.
import type { ItemColor } from "@/engine/types";
import { hueDelta, labToLch, nearestColorName, oklabToHex, rgbToOklab, type Lab } from "./oklab";

export interface Pixels {
  data: Uint8ClampedArray | Uint8Array; // RGBA
  width: number;
  height: number;
}

export interface ExtractOptions {
  k?: number;
  minShare?: number;
  maxColors?: number;
  alphaMin?: number; // pixels below this alpha are background
  maxSamples?: number;
  region?: { x: number; y: number; w: number; h: number }; // manual crops: sample the centre only
}

export function extractColors(px: Pixels, opts: ExtractOptions = {}): ItemColor[] {
  const { k = 4, minShare = 0.08, maxColors = 3, alphaMin = 200, maxSamples = 6000 } = opts;
  const region = opts.region ?? { x: 0, y: 0, w: px.width, h: px.height };

  // Count opaque pixels first so sampling is an even stride over them.
  let opaque = 0;
  for (let y = region.y; y < region.y + region.h; y++)
    for (let x = region.x; x < region.x + region.w; x++) if (px.data[(y * px.width + x) * 4 + 3] >= alphaMin) opaque++;
  if (opaque === 0) return [];

  const stride = Math.max(1, Math.floor(opaque / maxSamples));
  const samples: Lab[] = [];
  let seen = 0;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      const i = (y * px.width + x) * 4;
      if (px.data[i + 3] < alphaMin) continue;
      if (seen++ % stride === 0) samples.push(rgbToOklab([px.data[i], px.data[i + 1], px.data[i + 2]]));
    }
  }

  const centers = initCenters(samples, Math.min(k, samples.length));
  const assign = new Int32Array(samples.length);
  for (let iter = 0; iter < 12; iter++) {
    let moved = false;
    for (let s = 0; s < samples.length; s++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(samples[s], centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[s] !== best) {
        assign[s] = best;
        moved = true;
      }
    }
    const sums = centers.map(() => ({ L: 0, a: 0, b: 0, n: 0 }));
    for (let s = 0; s < samples.length; s++) {
      const acc = sums[assign[s]];
      acc.L += samples[s].L;
      acc.a += samples[s].a;
      acc.b += samples[s].b;
      acc.n++;
    }
    sums.forEach((acc, c) => {
      if (acc.n) centers[c] = { L: acc.L / acc.n, a: acc.a / acc.n, b: acc.b / acc.n };
    });
    if (!moved && iter > 0) break;
  }

  const counts = centers.map(() => 0);
  for (let s = 0; s < samples.length; s++) counts[assign[s]]++;
  // Folds and shadows split one cloth colour into several clusters: merge clusters that are
  // perceptually the same (OKLab distance under 0.06, or same name), weighted by share.
  const merged: { lab: Lab; share: number }[] = [];
  for (const c of centers.map((lab, i) => ({ lab, share: counts[i] / samples.length })).sort((a, b) => b.share - a.share)) {
    const twin = merged.find((m) => sameCloth(m.lab, c.lab));
    if (!twin) merged.push({ ...c });
    else {
      const t = twin.share + c.share;
      twin.lab = {
        L: (twin.lab.L * twin.share + c.lab.L * c.share) / t,
        a: (twin.lab.a * twin.share + c.lab.a * c.share) / t,
        b: (twin.lab.b * twin.share + c.lab.b * c.share) / t,
      };
      twin.share = t;
    }
  }
  const clusters = merged
    .filter((c) => c.share >= minShare)
    .sort((a, b) => b.share - a.share)
    .slice(0, maxColors);
  const total = clusters.reduce((sum, c) => sum + c.share, 0) || 1;

  return clusters.map((c) => {
    const hex = oklabToHex(c.lab);
    return { hex, name: nearestColorName(hex), share: Math.round((c.share / total) * 1000) / 1000 };
  });
}

// Deterministic farthest-point initialisation: start from the median lightness sample,
// then repeatedly take the sample farthest from every chosen centre.
function initCenters(samples: Lab[], k: number): Lab[] {
  const sorted = [...samples].sort((a, b) => a.L - b.L);
  const centers: Lab[] = [sorted[Math.floor(sorted.length / 2)]];
  while (centers.length < k) {
    let far = samples[0];
    let farD = -1;
    for (const s of samples) {
      const d = Math.min(...centers.map((c) => dist2(s, c)));
      if (d > farD) {
        farD = d;
        far = s;
      }
    }
    if (farD <= 0) break;
    centers.push(far);
  }
  return centers;
}

// One cloth colour seen in light and shadow: close in OKLab, the same name, the same hue with
// similar chroma (lightness may differ a lot), or two greys of similar lightness.
function sameCloth(p: Lab, q: Lab): boolean {
  if (Math.sqrt(dist2(p, q)) < 0.06) return true;
  if (nearestColorName(oklabToHex(p)) === nearestColorName(oklabToHex(q))) return true;
  const a = labToLch(p);
  const b = labToLch(q);
  if (a.C > 0.05 && b.C > 0.05) return hueDelta(a.h, b.h) < 22 && Math.abs(a.C - b.C) < 0.09;
  if (a.C < 0.035 && b.C < 0.035) return Math.abs(a.L - b.L) < 0.12;
  return false;
}

const dist2 = (p: Lab, q: Lab) => (p.L - q.L) ** 2 + (p.a - q.a) ** 2 + (p.b - q.b) ** 2;

// Share of the frame the garment covers. Under 5% or over 97% means the cutout failed (6.5).
export function opaqueShare(px: Pixels, alphaMin = 128): number {
  let n = 0;
  for (let i = 3; i < px.data.length; i += 4) if (px.data[i] >= alphaMin) n++;
  return n / (px.width * px.height);
}

// Bounds of the visible garment plus padding (6.1 step 4: 4%), clamped to the frame.
export function trimBounds(px: Pixels, padRatio = 0.04, alphaMin = 16) {
  let minX = px.width;
  let minY = px.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < px.height; y++) {
    for (let x = 0; x < px.width; x++) {
      if (px.data[(y * px.width + x) * 4 + 3] < alphaMin) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: px.width, h: px.height };
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * padRatio);
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  return { x, y, w: Math.min(px.width, maxX + pad + 1) - x, h: Math.min(px.height, maxY + pad + 1) - y };
}
