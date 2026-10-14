import type { Metadata } from "next";
import { Credit } from "@/components/credit";
import { LinkRow, SettingsSection } from "@/components/lounge/m3-settings-list/settings-list";
import { ThemeRow } from "@/components/lounge/m3-settings-list/theme-row";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.settings.title };

export default function SettingsPage() {
  return (
    <>
      <h1 className="pt-4 pb-6 text-[34px]">{copy.settings.title}</h1>
      <SettingsSection title={copy.settings.appearance}>
        <ThemeRow />
      </SettingsSection>
      <SettingsSection title={copy.settings.aboutSection}>
        <LinkRow href="/about" icon="info" title={copy.settings.about} support={copy.settings.aboutSupport} />
      </SettingsSection>
      <Credit className="mt-10 text-center" />
    </>
  );
}
