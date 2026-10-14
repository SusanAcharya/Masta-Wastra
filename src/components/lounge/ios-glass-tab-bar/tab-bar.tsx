"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon, type IconName } from "@/components/icons/icon";
import { copy } from "@/lib/copy";
import s from "./tab-bar.module.css";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/today", label: copy.tabs.today, icon: "sun" },
  { href: "/closet", label: copy.tabs.closet, icon: "hanger" },
  { href: "/scan", label: copy.tabs.scan, icon: "camera" },
  { href: "/history", label: copy.tabs.history, icon: "calendar" },
  { href: "/settings", label: copy.tabs.settings, icon: "sliders" },
];

function activeIndex(pathname: string) {
  const i = TABS.findIndex((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return i < 0 ? 0 : i;
}

// Route links, not ARIA tabs: each item navigates to a page, so the current one
// carries aria-current="page" and every link stays in the Tab order.
export function TabBar() {
  const pathname = usePathname();
  const index = activeIndex(pathname);
  const lens = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = lens.current;
    if (!el) return;
    el.classList.remove(s.moving);
    void el.offsetWidth; // restart the squash keyframe
    el.classList.add(s.moving);
  }, [index]);

  return (
    <nav className={s.dock} aria-label={copy.tabs.nav}>
      <div className={s.bar} style={{ "--i": index } as React.CSSProperties}>
        <span ref={lens} className={s.lens} aria-hidden="true" />
        {TABS.map((t, i) => (
          <Link key={t.href} href={t.href} className={s.tab} aria-current={i === index ? "page" : undefined}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
