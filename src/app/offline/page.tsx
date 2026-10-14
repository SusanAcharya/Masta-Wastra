import type { Metadata } from "next";
import { EmptyState } from "@/components/lounge/mobile-list-empty/empty-state";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.offline.title };

export default function OfflinePage() {
  return (
    <main id="main" className="page">
      <EmptyState
        label={copy.app.name}
        title={copy.offline.title}
        body={copy.offline.body}
        action={{ href: "/today", text: copy.offline.action }}
      />
    </main>
  );
}
