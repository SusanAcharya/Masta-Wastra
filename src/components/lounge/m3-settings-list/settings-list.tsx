import Link from "next/link";
import { useId } from "react";
import { Icon, type IconName } from "@/components/icons/icon";
import s from "./settings-list.module.css";

export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section className={s.section} aria-labelledby={id}>
      <h2 id={id} className={s.header}>
        {title}
      </h2>
      <ul className={s.list}>{children}</ul>
    </section>
  );
}

export function LinkRow({ href, icon, title, support }: { href: string; icon: IconName; title: string; support?: string }) {
  return (
    <li>
      <Link href={href} className={s.row}>
        <Icon name={icon} className={s.icon} />
        <span>
          <span className={s.title}>{title}</span>
          {support ? <span className={s.support}>{support}</span> : null}
        </span>
        <Icon name="chevron-right" className={s.trail} />
      </Link>
    </li>
  );
}
