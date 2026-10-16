// Alpha mask clean up for cutouts (pure, runs in the worker and in tests).
// 1. cleanAlpha: background removal leaves faint specks and small islands around the garment
//    (seen on dark product photos). Keep only the garment's own connected regions.
// 2. applyGarmentMask: with a person in the photo, keep only the garment the photo is about.
import type { Pixels } from "./colors";

export interface CleanOptions {
  floor?: number; // alpha below this is background
  solid?: number; // alpha at or above this forms regions
  keepRatio?: number; // keep regions at least this share of the largest
  minPixels?: number;
}

export function cleanAlpha(px: Pixels, opts: CleanOptions = {}): { kept: number; dropped: number } {
  const { floor = 24, solid = 128, keepRatio = 0.03, minPixels = 64 } = opts;
  const { width: w, height: h, data } = px;
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    if (label[i] !== -1 || data[i * 4 + 3] < solid) continue;
    const id = sizes.length;
    let size = 0;
    let top = 0;
    stack[top++] = i;
    label[i] = id;
    while (top) {
      const p = stack[--top];
      size++;
      const x = p % w;
      const y = (p - x) / w;
      const neighbours = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of neighbours) {
        if (q < 0 || label[q] !== -1 || data[q * 4 + 3] < solid) continue;
        label[q] = id;
        stack[top++] = q;
      }
    }
    sizes.push(size);
  }
  if (!sizes.length) return { kept: 0, dropped: 0 };

  const largest = Math.max(...sizes);
  const keep = sizes.map((s) => s >= Math.max(minPixels, largest * keepRatio));
  // Soft edge pixels stay only next to a kept region (within 2 px), so the garment keeps its
  // antialiased edge but isolated haze goes.
  const near = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (label[i] >= 0 && keep[label[i]]) near[i] = 1;
  for (let pass = 0; pass < 2; pass++) {
    const next = near.slice();
    for (let i = 0; i < n; i++) {
      if (near[i]) continue;
      const x = i % w;
      if ((x > 0 && near[i - 1]) || (x < w - 1 && near[i + 1]) || (i >= w && near[i - w]) || (i < n - w && near[i + w])) next[i] = 1;
    }
    near.set(next);
  }

  let dropped = 0;
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3];
    if (a === 0) continue;
    const isSolid = a >= solid;
    const drop = a < floor || (isSolid ? !keep[label[i]] : !near[i]);
    if (drop) {
      data[i * 4 + 3] = 0;
      dropped++;
    }
  }
  return { kept: sizes.filter((_, i) => keep[i]).length, dropped };
}

// Multiplies the alpha by a soft mask of the target labels, upsampled from the parser's grid.
// The mask is dilated a little first: the parser is coarse, the background removal's edge is
// precise, so the parser decides "which garment" and the matte decides "where its edge is".
export function applyGarmentMask(
  px: Pixels,
  labels: Uint8Array,
  lw: number,
  lh: number,
  target: readonly number[],
  dilate = 2,
  remove: readonly number[] = [],
) {
  const want = new Set(target);
  const drop = new Set(remove);
  let m = new Float32Array(lw * lh);
  for (let i = 0; i < m.length; i++) m[i] = want.has(labels[i]) ? 1 : 0;
  for (let pass = 0; pass < dilate; pass++) {
    const next = m.slice();
    for (let y = 0; y < lh; y++)
      for (let x = 0; x < lw; x++) {
        const i = y * lw + x;
        if (m[i]) continue;
        if ((x > 0 && m[i - 1]) || (x < lw - 1 && m[i + 1]) || (y > 0 && m[i - lw]) || (y < lh - 1 && m[i + lw])) next[i] = 1;
      }
    m = next;
  }
  // The person's own pixels (arms crossed over a top, a chin above a collar) never belong to
  // the garment, even inside its dilated outline.
  if (drop.size) for (let i = 0; i < m.length; i++) if (drop.has(labels[i])) m[i] = 0;
  // One box blur pass softens the grid's stair steps before upsampling.
  const soft = new Float32Array(lw * lh);
  for (let y = 0; y < lh; y++)
    for (let x = 0; x < lw; x++) {
      let s = 0;
      let c = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= lw || yy >= lh) continue;
          s += m[yy * lw + xx];
          c++;
        }
      soft[y * lw + x] = s / c;
    }
  // ...and the blur must not refill them.
  if (drop.size) for (let i = 0; i < soft.length; i++) if (drop.has(labels[i])) soft[i] = 0;

  const { width: w, height: h, data } = px;
  for (let y = 0; y < h; y++) {
    const gy = Math.min(lh - 1, ((y + 0.5) * lh) / h - 0.5);
    const y0 = Math.max(0, Math.floor(gy));
    const y1 = Math.min(lh - 1, y0 + 1);
    const fy = Math.max(0, gy - y0);
    for (let x = 0; x < w; x++) {
      const gx = Math.min(lw - 1, ((x + 0.5) * lw) / w - 0.5);
      const x0 = Math.max(0, Math.floor(gx));
      const x1 = Math.min(lw - 1, x0 + 1);
      const fx = Math.max(0, gx - x0);
      const v =
        soft[y0 * lw + x0] * (1 - fx) * (1 - fy) +
        soft[y0 * lw + x1] * fx * (1 - fy) +
        soft[y1 * lw + x0] * (1 - fx) * fy +
        soft[y1 * lw + x1] * fx * fy;
      const k = Math.min(1, v * 1.6);
      const i = (y * w + x) * 4 + 3;
      data[i] = Math.round(data[i] * k);
    }
  }
}
