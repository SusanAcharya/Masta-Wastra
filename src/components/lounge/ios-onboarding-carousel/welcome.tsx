"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Garment } from "@/components/art/garment";
import { ExampleDeck } from "@/components/lounge/card-stacked-deck/example-deck";
import { updateSettings } from "@/db/repo";
import { getDb } from "@/db/schema";
import { copy } from "@/lib/copy";
import s from "./welcome.module.css";

const SLIDES = copy.welcome.slides;

function Art({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className={s.frame}>
        <span className={s.corner} />
        <span className={s.corner} />
        <span className={s.corner} />
        <span className={s.corner} />
        <Garment kind="top" fill="var(--secondary)" size={150} />
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className={s.split}>
        <span className={s.room} />
        <span className={s.beam} />
        <Garment kind="outer" fill="var(--tertiary)" className={s.lifted} size={190} />
      </div>
    );
  }
  return (
    <div className={s.deckWrap}>
      <ExampleDeck label={copy.today.exampleLabel} />
    </div>
  );
}

export function Welcome() {
  const router = useRouter();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    // Read the index once scrolling settles, so a smooth scroll started by Continue
    // does not flicker the dots back through the slide it is leaving.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setIndex(Math.round(el.scrollLeft / el.clientWidth)), 90);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function go(i: number) {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(SLIDES.length - 1, i));
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: next * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
    setIndex(next);
  }

  async function finish() {
    await updateSettings(getDb(), { introSeenAt: new Date().toISOString() }).catch(() => undefined);
    router.push("/scan");
  }

  return (
    <main id="main" className={s.screen}>
      <header className={s.header}>
        <span className={s.mark}>{copy.app.name}</span>
        <button type="button" className={s.skip} onClick={finish} hidden={last}>
          {copy.welcome.skip}
        </button>
      </header>

      <div
        ref={track}
        className={s.track}
        tabIndex={0}
        aria-roledescription="carousel"
        aria-label={copy.welcome.carousel}
      >
        {SLIDES.map((slide, i) => (
          <section
            key={slide.title}
            className={s.slide}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${SLIDES.length}`}
            aria-current={i === index ? "true" : undefined}
          >
            <div className={s.art} aria-hidden="true">
              <Art index={i} />
            </div>
            <h1 className={s.title}>{slide.title}</h1>
            <p className={s.body}>{slide.body}</p>
          </section>
        ))}
      </div>

      <footer className={s.footer}>
        <div className={s.dots} aria-hidden="true">
          {SLIDES.map((slide, i) => (
            <i key={slide.title} data-on={i === index ? "" : undefined} />
          ))}
        </div>
        <button type="button" className={`btn btn-primary ${s.cta}`} onClick={() => (last ? finish() : go(index + 1))}>
          {last ? copy.welcome.start : copy.welcome.next}
        </button>
      </footer>
    </main>
  );
}
