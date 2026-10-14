"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StarterSlots } from "@/components/starter-slots";
import { countActiveItems } from "@/db/repo";
import { getDb } from "@/db/schema";
import { useLive } from "@/db/use-live";
import { copy } from "@/lib/copy";

export default function ClosetPage() {
  const count = useLive(() => countActiveItems(getDb()));
  return (
    <>
      <title>{`${copy.closet.title} · ${copy.app.name}`}</title>
      <PageHeader eyebrow={count === undefined ? "" : copy.closet.count(count)} title={copy.closet.title} />
      <p className="max-w-[44ch] text-[15px] text-ink-2">{copy.closet.emptyBody}</p>
      <div className="mt-6">
        <StarterSlots />
      </div>
      <Link href="/scan" className="btn btn-primary mt-8 w-full">
        {copy.closet.emptyAction}
      </Link>
    </>
  );
}
