import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, daysBetween, toLocalDate } from "@/lib/dates";
import { formatBytes, requestPersist, shouldAskPersist, storageUse } from "@/lib/storage";

afterEach(() => vi.unstubAllGlobals());

describe("persistent storage", () => {
  it("asks once, after the third item", () => {
    expect(shouldAskPersist(2, false)).toBe(false);
    expect(shouldAskPersist(3, false)).toBe(true);
    expect(shouldAskPersist(3, true)).toBe(false);
  });

  it("asks the browser only when not already persisted", async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal("navigator", { storage: { persisted: async () => false, persist } });
    expect(await requestPersist()).toBe("granted");
    expect(persist).toHaveBeenCalledOnce();

    const persist2 = vi.fn(async () => true);
    vi.stubGlobal("navigator", { storage: { persisted: async () => true, persist: persist2 } });
    expect(await requestPersist()).toBe("granted");
    expect(persist2).not.toHaveBeenCalled();

    vi.stubGlobal("navigator", { storage: { persisted: async () => false, persist: async () => false } });
    expect(await requestPersist()).toBe("denied");

    vi.stubGlobal("navigator", {});
    expect(await requestPersist()).toBe("unsupported");
  });

  it("reports usage for Settings", async () => {
    vi.stubGlobal("navigator", {
      storage: { estimate: async () => ({ usage: 52_428_800, quota: 1_073_741_824 }), persisted: async () => true },
    });
    expect(await storageUse()).toEqual({ usedBytes: 52_428_800, quotaBytes: 1_073_741_824, persisted: true });
    expect(formatBytes(52_428_800)).toBe("50.0 MB");
    expect(formatBytes(300)).toBe("1 KB");
  });
});

describe("local dates", () => {
  it("formats in the device zone and counts calendar days across DST", () => {
    expect(toLocalDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2); // US DST starts 2026-03-08
    expect(daysBetween("2026-10-14", "2026-10-07")).toBe(-7);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
