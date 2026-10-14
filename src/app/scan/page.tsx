import type { Metadata } from "next";
import { ScanFlow } from "@/components/scan/scan-flow";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.scan.title };

// Full screen flow, outside the tab shell (prompt 4).
export default function ScanPage() {
  return <ScanFlow />;
}
