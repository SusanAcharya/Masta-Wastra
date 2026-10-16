"use client";

import { useState } from "react";
import { useImageUrl } from "@/db/use-image";
import type { Item } from "@/engine/types";
import { fitPiece, placeOutfit, type Body, type Placed } from "@/lib/figure";
import { itemAlt } from "@/lib/vocab";
import { FIGURE } from "./paths";

// The paper doll (Susan's choice over an AI try on: free, instant, offline). A faceless dress
// form in the theme's own tones, with the outfit's cutouts placed where each piece is worn.
function Piece({ p }: { p: Placed }) {
  const url = useImageUrl(p.item.cutoutId);
  const [size, setSize] = useState<{ w: number; h: number }>();
  const manual = p.item.cutoutQuality === "manual";
  // Until the image has loaded its size is unknown: hold the box, hidden.
  const r = size ? fitPiece(p.box, p.zone, size.w, size.h) : p.box;
  return (
    <div
      className="absolute"
      style={{ left: `${(r.x / 400) * 100}%`, top: `${(r.y / 1000) * 100}%`, width: `${(r.w / 400) * 100}%`, height: `${(r.h / 1000) * 100}%`, zIndex: p.z }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={itemAlt(p.item.name, p.item.colors)}
          draggable={false}
          onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className="h-full w-full object-fill"
          style={{
            visibility: size ? "visible" : "hidden",
            filter: manual ? undefined : "drop-shadow(0 3px 4px rgba(42,33,27,0.18))",
          }}
        />
      ) : null}
    </div>
  );
}

export function OnFigure({ items, body, className = "" }: { items: Item[]; body: Body; className?: string }) {
  const f = FIGURE[body];
  const placed = placeOutfit(items, body);
  return (
    <div className={`relative aspect-[2/5] ${className}`}>
      <svg viewBox="0 0 400 1000" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <g fill="var(--figure)" stroke="var(--figure-line)" strokeWidth="2" strokeLinejoin="round">
          {f.arms.map((d) => (
            <path key={d} d={d} />
          ))}
          <path d={f.body} />
          <path d={f.neck} />
          <ellipse cx={f.head.cx} cy={f.head.cy} rx={f.head.rx} ry={f.head.ry} />
        </g>
      </svg>
      {placed.map((p) => (
        <Piece key={p.item.id} p={p} />
      ))}
    </div>
  );
}
