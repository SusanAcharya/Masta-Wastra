"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { countActiveItems, getSettings } from "@/db/repo";
import { getDb } from "@/db/schema";

// First visit: the welcome carousel explains the app. After that: today's outfits.
export function RootRedirect() {
  const router = useRouter();
  useEffect(() => {
    const db = getDb();
    Promise.all([countActiveItems(db), getSettings(db)])
      .then(([n, s]) => router.replace(n > 0 || s.introSeenAt ? "/today" : "/welcome"))
      .catch(() => router.replace("/welcome"));
  }, [router]);
  return null;
}
