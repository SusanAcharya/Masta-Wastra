"use client";

import Link from "next/link";
import { Icon } from "@/components/icons/icon";
import { copy } from "@/lib/copy";

// Adapted from Design Lounge mobile-load-failed: what went wrong in one line, then one way on.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="page flex min-h-dvh flex-col justify-center">
      <p className="label">{copy.app.name}</p>
      <h1 className="mt-4 text-[32px]">{copy.errors.title}</h1>
      <p className="mt-3 flex max-w-[36ch] items-start gap-2 text-[15px] text-ink-2" role="alert">
        <Icon name="alert" size={18} className="mt-1 shrink-0 text-danger" />
        {copy.errors.body}
      </p>
      <div className="mt-6 flex gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          {copy.errors.retry}
        </button>
        <Link href="/today" className="btn">
          {copy.errors.home}
        </Link>
      </div>
    </main>
  );
}
