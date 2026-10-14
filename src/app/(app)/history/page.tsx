import type { Metadata } from "next";
import { EmptyState } from "@/components/lounge/mobile-list-empty/empty-state";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.history.title };

export default function HistoryPage() {
  return (
    <EmptyState
      label={copy.history.title}
      title={copy.history.emptyTitle}
      body={copy.history.emptyBody}
      action={{ href: "/today", text: copy.history.emptyAction }}
    />
  );
}
