"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons/icon";
import { copy } from "@/lib/copy";
import { readThemeMode, saveThemeMode, type ThemeMode } from "@/lib/theme";
import s from "./settings-list.module.css";

const MODES: { value: ThemeMode; label: string }[] = [
  { value: "system", label: copy.settings.themeSystem },
  { value: "light", label: copy.settings.themeLight },
  { value: "dark", label: copy.settings.themeDark },
];

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function ThemeRow() {
  const mode = useSyncExternalStore(subscribe, readThemeMode, () => "system" as ThemeMode);
  const [draft, setDraft] = useState<ThemeMode>(mode);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();
  const current = MODES.find((m) => m.value === mode)?.label;

  function open() {
    setDraft(mode);
    dialog.current?.showModal();
  }

  function confirm() {
    saveThemeMode(draft);
    listeners.forEach((fn) => fn());
    dialog.current?.close();
  }

  return (
    <li>
      <button
        type="button"
        className={s.row}
        aria-haspopup="dialog"
        onClick={open}
      >
        <Icon name="moon" className={s.icon} />
        <span>
          <span className={s.title}>
            {copy.settings.theme}
          </span>
          <span className={s.support}>
            {current}
          </span>
        </span>
        <span />
      </button>
      <dialog ref={dialog} className={s.dialog} aria-labelledby={dialogTitleId}>
        <h2 id={dialogTitleId} className={s.dialogTitle}>
          {copy.settings.theme}
        </h2>
        <p className={s.dialogBody}>{copy.settings.themeHint}</p>
        <div role="radiogroup" aria-labelledby={dialogTitleId} className={s.options}>
          {MODES.map((m) => (
            <label key={m.value} className={s.opt}>
              <input
                type="radio"
                name="theme"
                value={m.value}
                checked={draft === m.value}
                onChange={() => setDraft(m.value)}
              />
              {m.label}
            </label>
          ))}
        </div>
        <div className={s.actions}>
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            {copy.common.cancel}
          </button>
          <button type="button" className="btn btn-primary" onClick={confirm}>
            {copy.common.save}
          </button>
        </div>
      </dialog>
    </li>
  );
}
