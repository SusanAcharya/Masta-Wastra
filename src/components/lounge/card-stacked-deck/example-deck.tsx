import { Garment, type GarmentKind } from "@/components/art/garment";
import s from "./example-deck.module.css";

type Piece = { kind: GarmentKind; fill: string };

// Three drawn outfits in the theme's own colours. Shown only as an example, labelled so.
const EXAMPLES: Piece[][] = [
  [
    { kind: "outer", fill: "var(--tertiary)" },
    { kind: "bottom", fill: "var(--ink-2)" },
    { kind: "shoes", fill: "var(--ink)" },
  ],
  [
    { kind: "dress", fill: "var(--primary)" },
    { kind: "outer", fill: "var(--surface-3)" },
    { kind: "shoes", fill: "var(--tertiary)" },
  ],
  [
    { kind: "top", fill: "var(--secondary)" },
    { kind: "bottom", fill: "var(--ink)" },
    { kind: "shoes", fill: "var(--primary)" },
  ],
];

export function ExampleCard({ pieces, label, reason }: { pieces: Piece[]; label: string; reason?: string }) {
  const [a, b, shoes] = pieces;
  return (
    <div className={s.card}>
      <div className={s.lay}>
        <Garment kind={a.kind} fill={a.fill} />
        <Garment kind={b.kind} fill={b.fill} />
        <Garment kind={shoes.kind} fill={shoes.fill} className={s.shoes} />
      </div>
      <div className={s.meta}>
        <p className={s.tag}>{label}</p>
        {reason ? <p className={s.reason}>{reason}</p> : null}
      </div>
    </div>
  );
}

export function ExampleDeck({ label, reason }: { label: string; reason?: string }) {
  return (
    <div className={s.deck} role="img" aria-label={`${label}: three outfit cards stacked like a dealt hand`}>
      {EXAMPLES.map((pieces, i) => (
        <ExampleCard key={i} pieces={pieces} label={label} reason={i === EXAMPLES.length - 1 ? reason : undefined} />
      ))}
    </div>
  );
}
