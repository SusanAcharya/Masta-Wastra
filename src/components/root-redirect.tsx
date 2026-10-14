"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { countActiveItems } from "@/db/repo";
import { getDb } from "@/db/schema";

// Prompt 4: an empty closet starts the scan, otherwise Today.
export function RootRedirect() {
  const router = useRouter();
  useEffect(() => {
    countActiveItems(getDb())
      .then((n) => router.replace(n > 0 ? "/today" : "/scan"))
      .catch(() => router.replace("/today"));
  }, [router]);
  return null;
}
