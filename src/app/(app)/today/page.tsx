import type { Metadata } from "next";
import { EmptyState } from "@/components/lounge/mobile-list-empty/empty-state";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.today.title };

export default function TodayPage() {
  return (
    <EmptyState
      label={copy.today.title}
      title={copy.today.emptyTitle}
      body={copy.today.emptyBody}
      action={{ href: "/scan", text: copy.today.emptyAction }}
    />
  );
}
