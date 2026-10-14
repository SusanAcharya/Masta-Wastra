"use client";

import { useEffect, useState } from "react";
import { getSettings } from "./repo";
import { defaultSettings, getDb, type Settings } from "./schema";
import { useLive } from "./use-live";

// Live settings. The row is created once outside the live query (live queries are read only,
// so a first-run write inside one would fail silently).
export function useSettings(): Settings | undefined {
  const db = getDb();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    getSettings(db).finally(() => setReady(true));
  }, [db]);
  const live = useLive(async () => (await db.settings.get("me")) ?? undefined, [ready]);
  return ready ? (live ?? undefined) : undefined;
}

export { defaultSettings };
