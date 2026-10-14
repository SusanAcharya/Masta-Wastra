"use client";

// Wires the tag queue (lib/tag-queue.ts) to the browser: the image Gemini sees, the install
// token, online and visibility. Triggers live in components/tag-runner.tsx (7.4: app open,
// online, after each new item, visible again; no timers while hidden).
import { getDb } from "@/db/schema";
import { runQueue, createTokenProvider, type RunSummary } from "./tag-queue";
import type { TagErrorCode } from "./tag-api";
import { taggingImage } from "./image";

export const ITEM_ADDED = "mw-item-added";
export const TAG_PAUSED = "mw-tag-paused";

export interface TagPausedDetail {
  until: string;
  code: TagErrorCode;
}

let tokenProvider: ReturnType<typeof createTokenProvider> | undefined;

export function kickTagQueue(): Promise<RunSummary> {
  const db = getDb();
  const now = () => new Date();
  tokenProvider ??= createTokenProvider({ db, fetchImpl: (...a) => fetch(...a), now });
  return runQueue({
    db,
    now,
    fetchImpl: (...a) => fetch(...a),
    getToken: tokenProvider,
    isOnline: () => navigator.onLine,
    isVisible: () => document.visibilityState === "visible",
    prepareImage: async (itemId) => {
      const item = await db.items.get(itemId);
      const cut = item && (await db.images.get(item.cutoutId));
      if (!item || !cut) throw new Error("item image missing");
      return { image: await taggingImage(cut.blob), colors: item.colors.map(({ hex, share }) => ({ hex, share })) };
    },
    onBudgetPaused: (until, code) =>
      window.dispatchEvent(new CustomEvent<TagPausedDetail>(TAG_PAUSED, { detail: { until: until.toISOString(), code } })),
  });
}

export function announceItemAdded() {
  window.dispatchEvent(new Event(ITEM_ADDED));
}
