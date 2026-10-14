import type { Metadata } from "next";
import Link from "next/link";
import { ExampleDeck } from "@/components/lounge/card-stacked-deck/example-deck";
import { PageHeader } from "@/components/page-header";
import { StarterSlots } from "@/components/starter-slots";
import { TodayDate } from "@/components/today-date";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.today.title };

// Until the engine lands (M5, M6) the closet cannot deal, so Today shows what is coming:
// an example of the deck and the three pieces that unlock it.
export default function TodayPage() {
  return (
    <>
      <PageHeader eyebrow={<TodayDate />} title={copy.today.title} />
      <ExampleDeck label={copy.today.exampleLabel} reason={copy.today.exampleReason} />
      <section className="mt-8" aria-labelledby="today-empty">
        <h2 id="today-empty" className="plain text-[20px]">
          {copy.today.emptyTitle}
        </h2>
        <p className="mt-2 max-w-[44ch] text-[15px] text-ink-2">{copy.today.emptyBody}</p>
        <Link href="/scan" className="btn btn-primary mt-5 w-full">
          {copy.today.emptyAction}
        </Link>
        <p className="label mt-8 mb-3">{copy.today.need}</p>
        <StarterSlots compact />
      </section>
    </>
  );
}
