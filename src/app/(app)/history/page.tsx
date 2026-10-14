import type { Metadata } from "next";
import { HistoryScreen } from "@/components/history-screen";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.history.title };

export default function HistoryPage() {
  return <HistoryScreen />;
}
