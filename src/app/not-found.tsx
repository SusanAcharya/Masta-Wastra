import Link from "next/link";
import { copy } from "@/lib/copy";

export default function NotFound() {
  return (
    <main id="main" className="page flex min-h-dvh flex-col justify-center">
      <p className="label">{copy.app.name}</p>
      <h1 className="mt-4 text-[32px]">{copy.errors.missing}</h1>
      <p className="mt-3 max-w-[36ch] text-[15px] text-ink-2">{copy.errors.missingBody}</p>
      <Link href="/today" className="btn btn-primary mt-6 self-start">
        {copy.errors.home}
      </Link>
    </main>
  );
}
