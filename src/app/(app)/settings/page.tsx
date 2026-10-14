import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings-screen";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.settings.title };

export default function SettingsPage() {
  return <SettingsScreen />;
}
