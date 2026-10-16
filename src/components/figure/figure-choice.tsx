"use client";

import { Sheet } from "@/components/lounge/ios-bottom-sheet-detents/sheet";
import { copy } from "@/lib/copy";
import type { Body } from "@/lib/figure";
import { FIGURE } from "./paths";

function Preview({ body }: { body: Body }) {
  const f = FIGURE[body];
  return (
    <svg viewBox="0 0 400 1000" className="h-40 w-16" aria-hidden="true">
      <g fill="var(--figure)" stroke="var(--figure-line)" strokeWidth="3">
        {f.arms.map((d) => (
          <path key={d} d={d} />
        ))}
        <path d={f.body} />
        <path d={f.neck} />
        <ellipse cx={f.head.cx} cy={f.head.cy} rx={f.head.rx} ry={f.head.ry} />
      </g>
    </svg>
  );
}

// Asked once, the first time an outfit is shown on the figure. Changeable in Settings.
export function FigureChoice({ open, onPick, onClose }: { open: boolean; onPick: (b: Body) => void; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={copy.figure.title} detent="auto">
      <p className="text-[15px] text-ink-2">{copy.figure.body}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {(["female", "male"] as Body[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => onPick(b)}
            className="flex flex-col items-center gap-3 rounded-ui border border-line-strong bg-bg py-5 text-[15px] hover:bg-surface-2"
          >
            <Preview body={b} />
            {copy.figure[b]}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
