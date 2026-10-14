"use client";

import { useEffect, useId, useRef } from "react";

// Adapted from Design Lounge m3-dialog: a centred confirm. Cancel is outline; the destructive
// action is the one solid button (app.md, Break one rule). Native <dialog> traps focus.
export function ConfirmDialog({
  open,
  title,
  body,
  confirm,
  cancel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(340px,calc(100%-48px))] rounded-ui border border-line bg-surface p-0 text-ink backdrop:bg-[color-mix(in_oklab,var(--overlay)_45%,transparent)]"
    >
      <h2 id={titleId} className="plain px-6 pt-6 text-[20px]">
        {title}
      </h2>
      <p id={bodyId} className="px-6 pt-2 text-[15px] text-ink-2">
        {body}
      </p>
      <div className="flex justify-end gap-2 px-6 pt-6 pb-5">
        <button type="button" className="btn" onClick={onCancel} autoFocus>
          {cancel}
        </button>
        <button
          type="button"
          className="btn"
          style={danger ? { background: "var(--danger)", borderColor: "var(--danger)", color: "var(--danger-ink)" } : undefined}
          onClick={onConfirm}
        >
          {confirm}
        </button>
      </div>
    </dialog>
  );
}
