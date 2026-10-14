"use client";

import { useRef, useState } from "react";
import { Sheet } from "@/components/lounge/ios-bottom-sheet-detents/sheet";
import { copy } from "@/lib/copy";
import type { CropRect } from "@/lib/capture";

type Corner = "tl" | "tr" | "bl" | "br";
const MIN = 0.15;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// The soft rectangular crop (6.5): drag the four corners, or use arrow keys on a focused corner.
export function CropSheet({
  open,
  photoUrl,
  reason,
  onCrop,
  onClose,
}: {
  open: boolean;
  photoUrl?: string;
  reason?: string;
  onCrop: (rect: CropRect) => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<CropRect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef<Corner | null>(null);

  function move(corner: Corner, nx: number, ny: number) {
    setRect((r) => {
      let { x, y, w, h } = r;
      const right = x + w;
      const bottom = y + h;
      if (corner === "tl" || corner === "bl") {
        x = clamp(nx, 0, right - MIN);
        w = right - x;
      } else w = clamp(nx, x + MIN, 1) - x;
      if (corner === "tl" || corner === "tr") {
        y = clamp(ny, 0, bottom - MIN);
        h = bottom - y;
      } else h = clamp(ny, y + MIN, 1) - y;
      return { x, y, w, h };
    });
  }

  function pointer(e: React.PointerEvent) {
    const c = dragging.current;
    const b = box.current?.getBoundingClientRect();
    if (!c || !b) return;
    move(c, (e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height);
  }

  function key(corner: Corner, e: React.KeyboardEvent) {
    const d = 0.02;
    const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
    const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const cx = corner === "tl" || corner === "bl" ? rect.x : rect.x + rect.w;
    const cy = corner === "tl" || corner === "tr" ? rect.y : rect.y + rect.h;
    move(corner, cx + dx, cy + dy);
  }

  const corners: { id: Corner; left: number; top: number; label: string }[] = [
    { id: "tl", left: rect.x, top: rect.y, label: copy.crop.corners.tl },
    { id: "tr", left: rect.x + rect.w, top: rect.y, label: copy.crop.corners.tr },
    { id: "bl", left: rect.x, top: rect.y + rect.h, label: copy.crop.corners.bl },
    { id: "br", left: rect.x + rect.w, top: rect.y + rect.h, label: copy.crop.corners.br },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={copy.crop.title} detent="full" closeLabel={copy.common.cancel}>
      {reason ? <p className="mb-4 text-[15px] text-ink-2">{reason}</p> : null}
      {photoUrl ? (
        <div
          ref={box}
          className="relative mx-auto w-full max-w-[420px] touch-none select-none"
          onPointerMove={pointer}
          onPointerUp={() => (dragging.current = null)}
          onPointerCancel={() => (dragging.current = null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt={copy.crop.photoAlt} className="block w-full rounded-ui" draggable={false} />
          <div
            className="pointer-events-none absolute border-2 border-surface"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.w * 100}%`,
              height: `${rect.h * 100}%`,
              boxShadow: "0 0 0 9999px color-mix(in oklab, var(--overlay) 45%, transparent)",
            }}
          />
          {corners.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.label}
              className="absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center"
              style={{ left: `${c.left * 100}%`, top: `${c.top * 100}%` }}
              onPointerDown={(e) => {
                dragging.current = c.id;
                (e.currentTarget.parentElement as HTMLElement).setPointerCapture?.(e.pointerId);
              }}
              onKeyDown={(e) => key(c.id, e)}
            >
              <span className="block h-4 w-4 rounded-ui border-2 border-ink bg-surface" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-6 flex flex-col gap-2">
        <button type="button" className="btn btn-primary w-full" onClick={() => onCrop(rect)}>
          {copy.crop.use}
        </button>
        <button type="button" className="btn w-full" onClick={() => onCrop({ x: 0, y: 0, w: 1, h: 1 })}>
          {copy.crop.whole}
        </button>
      </div>
    </Sheet>
  );
}
