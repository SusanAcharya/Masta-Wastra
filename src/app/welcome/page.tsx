import type { Metadata } from "next";
import { Welcome } from "@/components/lounge/ios-onboarding-carousel/welcome";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.app.name };

export default function WelcomePage() {
  return <Welcome />;
}
