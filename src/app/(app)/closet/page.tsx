import type { Metadata } from "next";
import { EmptyState } from "@/components/lounge/mobile-list-empty/empty-state";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.closet.title };

export default function ClosetPage() {
  return (
    <EmptyState
      label={copy.closet.title}
      title={copy.closet.emptyTitle}
      body={copy.closet.emptyBody}
      action={{ href: "/scan", text: copy.closet.emptyAction }}
    />
  );
}
