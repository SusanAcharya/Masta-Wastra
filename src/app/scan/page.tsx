import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons/icon";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.scan.title };

// Full screen flow, outside the tab shell. Capture and cutout arrive in M3.
export default function ScanPage() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-[720px] flex-col px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(34px,env(safe-area-inset-bottom))]"
    >
      <div className="flex h-[56px] items-center justify-between">
        <p className="label">{copy.scan.title}</p>
        <Link href="/today" className="btn -mr-3 border-transparent px-3" aria-label={copy.scan.close}>
          <Icon name="x" />
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-start justify-center gap-4">
        <h1 className="text-[44px]">{copy.scan.headline}</h1>
        <p className="max-w-[34ch] text-ink-2">{copy.scan.body}</p>
      </div>
    </main>
  );
}
