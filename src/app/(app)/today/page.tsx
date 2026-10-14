import type { Metadata } from "next";
import { PickScreen } from "@/components/pick-screen";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.tabs.today };

export default function TodayPage() {
  return <PickScreen />;
}
