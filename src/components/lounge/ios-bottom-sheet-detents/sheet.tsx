"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons/icon";
import s from "./sheet.module.css";

type Detent = "half" | "full" | "auto";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  detent?: Detent;
  /** Hide the close button for steps that must end with a choice (the sheet still closes on Escape). */
  dismissible?: boolean;
  closeLabel?: string;
  children: ReactNode;
};

export function Sheet({ open, onClose, title, detent = "half", dismissible = true, closeLabel = "Close", children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [current, setCurrent] = useState<Detent>(detent);
  const drag = useRef<{ y: number; moved: number } | null>(null);

  // Each opening starts at the requested detent (state adjusted during render, not in an effect).
  const [seen, setSeen] = useState({ open, detent });
  if (seen.open !== open || seen.detent !== detent) {
    setSeen({ open, detent });
    setCurrent(detent);
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Drag the grabber: up opens to full, down from full goes to half, down from half closes.
  function onPointerDown(e: React.PointerEvent) {
    drag.current = { y: e.clientY, moved: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (drag.current) drag.current.moved = e.clientY - drag.current.y;
  }
  function onPointerUp() {
    const moved = drag.current?.moved ?? 0;
    drag.current = null;
    if (moved < -40) setCurrent("full");
    else if (moved > 60) {
      if (current === "full") setCurrent("half");
      else if (dismissible) onClose();
    }
  }

  return (
    <dialog
      ref={ref}
      className={s.sheet}
      data-detent={current}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && dismissible) onClose(); // backdrop tap
      }}
    >
      <button
        type="button"
        className={s.grab}
        aria-label={current === "full" ? "Make sheet smaller" : "Make sheet larger"}
        onClick={() => setCurrent(current === "full" ? "half" : "full")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span />
      </button>
      <div className={s.head}>
        <h2 id={titleId} className={s.title}>
          {title}
        </h2>
        {dismissible ? (
          <button type="button" className={s.close} onClick={onClose} aria-label={closeLabel}>
            <Icon name="x" />
          </button>
        ) : null}
      </div>
      <div className={s.body}>{children}</div>
    </dialog>
  );
}
