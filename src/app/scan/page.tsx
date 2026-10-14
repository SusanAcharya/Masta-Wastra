import type { Metadata } from "next";
import Link from "next/link";
import { Garment } from "@/components/art/garment";
import { Icon } from "@/components/icons/icon";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.scan.title };

// Full screen flow, outside the tab shell. Capture and cutout arrive in M3.
export default function ScanPage() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(32px,env(safe-area-inset-bottom))]"
    >
      <div className="flex h-[56px] items-center justify-between">
        <p className="label">{copy.scan.title}</p>
        <Link href="/today" className="btn -mr-3 border-transparent px-3" aria-label={copy.scan.close}>
          <Icon name="x" />
        </Link>
      </div>

      <div className="relative mt-2 grid aspect-square place-items-center rounded-ui border border-line bg-surface" aria-hidden="true">
        <span className="absolute top-5 left-5 h-7 w-7 border-t-2 border-l-2 border-ink-2" />
        <span className="absolute top-5 right-5 h-7 w-7 border-t-2 border-r-2 border-ink-2" />
        <span className="absolute bottom-5 left-5 h-7 w-7 border-b-2 border-l-2 border-ink-2" />
        <span className="absolute right-5 bottom-5 h-7 w-7 border-r-2 border-b-2 border-ink-2" />
        <Garment kind="top" fill="var(--surface-3)" size={170} />
      </div>

      <h1 className="mt-8 text-[36px]">{copy.scan.headline}</h1>
      <p className="mt-3 text-[15px] text-ink-2">{copy.scan.body}</p>
      <ul className="mt-5 flex flex-col gap-3 text-[15px]">
        {copy.scan.tips.map((tip) => (
          <li key={tip} className="flex items-center gap-3">
            <Icon name="check" size={20} className="text-secondary" />
            {tip}
          </li>
        ))}
      </ul>

      <p className="mt-auto rounded-ui border border-line bg-surface px-4 py-3 text-[14px] text-ink-2" role="status">
        {copy.scan.soon}
      </p>
    </main>
  );
}
