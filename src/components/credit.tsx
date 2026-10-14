import { copy, LOUNGE_URL } from "@/lib/copy";

export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12px] text-ink-2 ${className}`}>
      {copy.credit.prefix} <a href={LOUNGE_URL}>{copy.credit.name}</a>
    </p>
  );
}
