"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons/icon";
import s from "./settings-list.module.css";

// Rows for the flat settings list (Design Lounge m3-settings-list, Nº 502), with the switch
// from toggle-switch-set. The supporting line says what the setting does now, not "On".
export function SwitchRow({
  icon,
  title,
  support,
  checked,
  onChange,
}: {
  icon: IconName;
  title: string;
  support: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <li>
      <button type="button" role="switch" aria-checked={checked} className={s.row} onClick={() => onChange(!checked)}>
        <Icon name={icon} className={s.icon} />
        <span>
          <span className={s.title}>{title}</span>
          <span className={s.support}>{support}</span>
        </span>
        <span className={s.switch} data-on={checked ? "" : undefined} aria-hidden="true">
          <span />
        </span>
      </button>
    </li>
  );
}

export function ActionRow({
  icon,
  title,
  support,
  onClick,
  trailing,
  tone,
}: {
  icon: IconName;
  title: string;
  support?: ReactNode;
  onClick: () => void;
  trailing?: ReactNode;
  tone?: "danger";
}) {
  return (
    <li>
      <button type="button" className={s.row} onClick={onClick}>
        <Icon name={icon} className={tone === "danger" ? "text-danger" : s.icon} />
        <span>
          <span className={`${s.title} ${tone === "danger" ? "text-danger-on-soft" : ""}`}>{title}</span>
          {support ? <span className={s.support}>{support}</span> : null}
        </span>
        {trailing ?? <span />}
      </button>
    </li>
  );
}

export function StaticRow({ icon, title, support, children }: { icon: IconName; title: string; support?: ReactNode; children?: ReactNode }) {
  return (
    <li className={`${s.row} cursor-default hover:bg-transparent`}>
      <Icon name={icon} className={s.icon} />
      <span>
        <span className={s.title}>{title}</span>
        {support ? <span className={s.support}>{support}</span> : null}
        {children}
      </span>
      <span />
    </li>
  );
}
