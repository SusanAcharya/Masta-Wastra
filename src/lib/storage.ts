// Persistent storage (5): asked once, after the 3rd item is saved, behind a short sheet that
// explains why. Without it the browser may evict the closet under storage pressure.

export const PERSIST_AFTER_ITEMS = 3;

export function shouldAskPersist(activeCount: number, alreadyAsked: boolean | undefined): boolean {
  return !alreadyAsked && activeCount >= PERSIST_AFTER_ITEMS;
}

export async function requestPersist(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return "unsupported";
  try {
    if (await navigator.storage.persisted()) return "granted";
    return (await navigator.storage.persist()) ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export interface StorageUse {
  usedBytes: number;
  quotaBytes: number;
  persisted: boolean;
}

export async function storageUse(): Promise<StorageUse | undefined> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return undefined;
  const [est, persisted] = await Promise.all([
    navigator.storage.estimate(),
    navigator.storage.persisted?.() ?? Promise.resolve(false),
  ]);
  return { usedBytes: est.usage ?? 0, quotaBytes: est.quota ?? 0, persisted };
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
