import type { Metadata } from "next";
import { ClosetScreen } from "@/components/closet/closet-screen";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.closet.title };

export default function ClosetPage() {
  return <ClosetScreen />;
}
