"use client";

// The outfit as a picture to save or send (10.6), drawn on the device: no server.
import { getDb } from "@/db/schema";
import type { Item, WeatherSnapshot } from "@/engine/types";
import { figureSvg } from "@/components/figure/paths";
import { formatRange } from "@/engine";
import { fitPiece, placeOutfit, type Body } from "./figure";

const W = 1080;
const H = 1350;

async function bitmapOf(item: Item): Promise<ImageBitmap | undefined> {
  const img = await getDb().images.get(item.cutoutId);
  return img ? createImageBitmap(img.blob) : undefined;
}

function css(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function fit(ctx: CanvasRenderingContext2D, bmp: ImageBitmap, x: number, y: number, w: number, h: number, shadow: boolean) {
  const s = Math.min(w / bmp.width, h / bmp.height);
  const dw = bmp.width * s;
  const dh = bmp.height * s;
  ctx.save();
  if (shadow) {
    ctx.shadowColor = "rgba(42,33,27,0.22)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 14;
  }
  ctx.drawImage(bmp, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, line: number) {
  const words = text.split(" ");
  let row = "";
  for (const w of words) {
    const next = row ? `${row} ${w}` : w;
    if (ctx.measureText(next).width > max && row) {
      ctx.fillText(row, x, y);
      row = w;
      y += line;
    } else row = next;
  }
  if (row) ctx.fillText(row, x, y);
}

async function drawOnFigure(ctx: CanvasRenderingContext2D, items: Item[], body: Body) {
  // The figure fills an 800 px tall stage: grid units (400 x 1000) times 0.8.
  const scale = 0.8;
  const ox = (W - 400 * scale) / 2;
  const oy = 230;
  const svg = figureSvg(body, "#d7cbbc", "#8e8275");
  const fig = new Image();
  fig.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await fig.decode();
  ctx.drawImage(fig, ox, oy, 400 * scale, 1000 * scale);
  for (const p of placeOutfit(items, body)) {
    const bmp = await bitmapOf(p.item);
    if (!bmp) continue;
    const r = fitPiece(p.box, p.zone, bmp.width, bmp.height);
    ctx.save();
    if (p.item.cutoutQuality !== "manual") {
      ctx.shadowColor = "rgba(42,33,27,0.18)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
    }
    ctx.drawImage(bmp, ox + r.x * scale, oy + r.y * scale, r.w * scale, r.h * scale);
    ctx.restore();
  }
}

export async function renderShareCard(opts: {
  pieces: { outer?: Item; top?: Item; bottom?: Item; shoes?: Item; accessory?: Item };
  figure?: { items: Item[]; body: Body };
  reason: string;
  weather?: WeatherSnapshot;
  units: "c" | "f";
}): Promise<Blob> {
  await document.fonts.ready; // the Didone must be loaded before drawing (10.6)
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  // Always the linen light theme: a shared picture should look the same everywhere.
  ctx.fillStyle = "#efe7dc";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f8f2e8";
  ctx.fillRect(60, 200, W - 120, 860);

  const display = css("--font-bodoni", "") ? `"Bodoni Moda", Georgia, serif` : "Georgia, serif";
  const text = `"Tenor Sans", "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = "#2a211b";
  ctx.font = `italic 400 64px ${display}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Masta Wastra", 60, 130);

  ctx.font = `400 30px ${text}`;
  ctx.fillStyle = "#6a5a4c";
  const date = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  ctx.textAlign = "right";
  ctx.fillText(opts.weather ? `${date} · ${formatRange(opts.weather.feelsMin, opts.weather.feelsMax, opts.units)}` : date, W - 60, 130);
  ctx.textAlign = "left";

  if (opts.figure) {
    await drawOnFigure(ctx, opts.figure.items, opts.figure.body);
    ctx.fillStyle = "#2a211b";
    ctx.font = `400 40px ${text}`;
    wrap(ctx, opts.reason, 60, 1150 - 40, W - 120, 54);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
  }

  const { outer, top, bottom, shoes, accessory } = opts.pieces;
  const draw = async (item: Item | undefined, x: number, y: number, w: number, h: number) => {
    if (!item) return;
    const bmp = await bitmapOf(item);
    if (bmp) fit(ctx, bmp, x, y, w, h, item.cutoutQuality !== "manual");
  };
  // Flat lay, as on the card: outer and top left, bottom right, shoes along the bottom.
  if (outer && top) {
    await draw(outer, 100, 240, 420, 440);
    await draw(top, 160, 420, 360, 360);
  } else await draw(outer ?? top, 100, 260, 440, 520);
  await draw(accessory, 760, 230, 220, 200);
  await draw(bottom, 560, accessory ? 400 : 260, 420, accessory ? 480 : 600);
  await draw(shoes, 290, 830, 500, 200);

  ctx.fillStyle = "#2a211b";
  ctx.font = `400 40px ${text}`;
  wrap(ctx, opts.reason, 60, 1150, W - 120, 54);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
}

export async function shareOrDownload(blob: Blob, name: string, title: string) {
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch {
      // cancelled, fall through
    }
  }
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
