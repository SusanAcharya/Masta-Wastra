import type { ReactNode } from "react";

// One header language for every tab screen: a small label above, the Didone title, an optional
// trailing control. The title is the screen's answer; the label says where you are.
export function PageHeader({ eyebrow, title, trailing }: { eyebrow?: ReactNode; title: string; trailing?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4 pt-4 pb-6">
      <div>
        <p className="label min-h-[18px]">{eyebrow}</p>
        <h1 className="mt-2 text-[34px] leading-[1.05]">{title}</h1>
      </div>
      {trailing}
    </header>
  );
}
