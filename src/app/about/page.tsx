import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons/icon";
import { Colophon } from "@/components/lounge/footer-centered-colophon/colophon";
import { GarmentStill } from "@/components/lounge/landing-fashion-atelier/garment-still";
import { copy, OPEN_METEO_URL, SOURCE_URL } from "@/lib/copy";

export const metadata: Metadata = { title: copy.about.title };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[1120px] px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <nav className="flex h-[60px] items-center" aria-label={copy.about.title}>
        <Link href="/settings" className="btn -ml-3 border-transparent px-3">
          <Icon name="arrow-left" />
          {copy.about.back}
        </Link>
      </nav>

      <section className="grid items-end gap-12 pt-6 md:grid-cols-[1fr_460px] md:pt-12">
        <div>
          <h1 className="text-[56px] md:text-[92px]">{copy.about.headline}</h1>
          <p className="mt-6 max-w-[34ch] text-ink-2">{copy.about.meaning}</p>
        </div>
        <GarmentStill caption={copy.app.shortName} />
      </section>

      <section className="mt-16 grid gap-10 border-t border-line pt-12 md:grid-cols-2 md:gap-16">
        <p className="max-w-[62ch]">{copy.about.how}</p>
        <div className="flex flex-col gap-8">
          <div>
            <h2 className="mb-3 text-[28px]">{copy.about.sourceLabel}</h2>
            <p className="max-w-[62ch] text-ink-2">{copy.about.sourceBody}</p>
            <a href={SOURCE_URL} className="btn btn-primary mt-4">
              <Icon name="external" />
              {copy.about.sourceAction}
            </a>
          </div>
          <div>
            <h2 className="mb-3 text-[28px]">{copy.about.creditsLabel}</h2>
            <ul className="flex flex-col gap-2 text-[15px] text-ink-2">
              <li>
                <a href={OPEN_METEO_URL}>{copy.about.weather}</a>. {copy.about.weatherLicence}
              </li>
              <li>{copy.about.cutout}</li>
              <li>{copy.about.parser}</li>
              <li>{copy.about.fonts}</li>
              <li>{copy.about.icons}</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="privacy" className="mt-16 scroll-mt-6 border-t border-line pt-12" aria-labelledby="privacy-title">
        <h2 id="privacy-title" className="text-[28px]">
          {copy.about.privacyTitle}
        </h2>
        <ul className="mt-5 flex max-w-[62ch] flex-col gap-3 text-[15px] text-ink-2">
          {copy.about.privacy.map((line) => (
            <li key={line} className="flex gap-3">
              <Icon name="lock" size={18} className="mt-1 shrink-0" />
              {line}
            </li>
          ))}
        </ul>
      </section>

      <Colophon />
    </div>
  );
}
