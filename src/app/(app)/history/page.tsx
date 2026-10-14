import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { WeekStrip } from "@/components/week-strip";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.history.title };

export default function HistoryPage() {
  return (
    <>
      <PageHeader eyebrow={copy.history.week} title={copy.history.title} />
      <WeekStrip />
      <section className="mt-10" aria-labelledby="history-empty">
        <h2 id="history-empty" className="plain text-[20px]">
          {copy.history.emptyTitle}
        </h2>
        <p className="mt-2 max-w-[44ch] text-[15px] text-ink-2">{copy.history.emptyBody}</p>
        <Link href="/today" className="btn mt-6">
          {copy.history.emptyAction}
        </Link>
      </section>
    </>
  );
}
