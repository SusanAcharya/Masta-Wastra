import Link from "next/link";
import { copy, LOUNGE_URL, SOURCE_URL } from "@/lib/copy";

// Adapted from Design Lounge footer-centered-colophon (Nº 099): centred italic wordmark,
// three text links, the place line. Designed using Design Lounge (https://www.designlounge.live)
export function Colophon() {
  return (
    <footer className="mt-16 flex flex-col items-center gap-4 border-t border-line pt-14 pb-10 text-center">
      <span className="block h-px w-12 bg-line-strong" aria-hidden="true" />
      <p className="display text-[36px]">{copy.app.name}</p>
      <ul className="flex flex-col items-center gap-3 text-[14px] sm:flex-row sm:gap-8">
        <li>
          <Link href="/today" className="text-ink-2 no-underline hover:text-ink hover:underline">
            {copy.tabs.today}
          </Link>
        </li>
        <li>
          <a href={SOURCE_URL} className="text-ink-2 no-underline hover:text-ink hover:underline">
            {copy.about.sourceLabel}
          </a>
        </li>
        <li>
          <Link href="/settings" className="text-ink-2 no-underline hover:text-ink hover:underline">
            {copy.tabs.settings}
          </Link>
        </li>
      </ul>
      <p className="text-[12px] text-ink-2">
        {copy.credit.prefix} <a href={LOUNGE_URL}>{copy.credit.name}</a>
      </p>
    </footer>
  );
}
