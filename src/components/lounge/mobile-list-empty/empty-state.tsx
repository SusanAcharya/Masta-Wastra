import Link from "next/link";

// Adapted from Design Lounge mobile-list-empty (Nº 338): a small label naming where you are,
// the answer as the h1, one sentence, one primary action sitting with the sentence.
// Designed using Design Lounge (https://www.designlounge.live)
type Props = {
  label: string;
  title: string;
  body: string;
  action?: { href: string; text: string };
};

export function EmptyState({ label, title, body, action }: Props) {
  return (
    <section className="flex min-h-[calc(100dvh-var(--tabbar-clear)-48px)] flex-col">
      <p className="label">{label}</p>
      <div className="flex flex-1 flex-col items-start justify-center gap-4">
        <h1 className="text-[28px]">{title}</h1>
        <p className="max-w-[300px] text-[15px] text-ink-2">{body}</p>
        {action ? (
          <Link href={action.href} className="btn btn-primary mt-2">
            {action.text}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
