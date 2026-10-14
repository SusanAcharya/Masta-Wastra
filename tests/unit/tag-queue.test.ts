import { beforeEach, describe, expect, it, vi } from "vitest";
import { addItem, editTags, getItem, getSettings, updateItem, updateSettings } from "@/db/repo";
import type { MastaDB } from "@/db/schema";
import type { Item } from "@/engine/types";
import type { Tags } from "@/lib/tag-api";
import {
  backoffDelay,
  budgetResumeAt,
  CLIENT_RPM,
  createTokenProvider,
  MAX_ATTEMPTS,
  nextPacificMidnight,
  parseRetryAfter,
  runQueue,
  tokenExpiry,
  type TagQueueDeps,
} from "@/lib/tag-queue";
import { freshDb, images, newItem } from "./helpers/db";

const T0 = Date.parse("2026-10-14T16:00:00Z"); // 09:00 Pacific
const iso = (t: number) => new Date(t).toISOString();

const TAGS: Tags = {
  isClothing: true,
  name: "Navy oxford shirt",
  category: "top",
  subtype: "shirt",
  layer: 0,
  colors: [
    { hex: "#1f2a44", name: "navy", share: 0.8 },
    { hex: "#f4f3ef", name: "white", share: 0.2 },
  ],
  pattern: "solid",
  warmth: 2,
  vibes: ["smart"],
  occasions: ["work", "date"],
  waterproof: false,
  confidence: 0.9,
};

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | "network";

let db: MastaDB;
let clock: number;
let online: boolean;
let visible: boolean;
let replies: (Reply | ((body: { itemId: string }) => Reply | Promise<Reply>))[];
let fetchImpl: ReturnType<typeof vi.fn>;
let sentBodies: { itemId: string; image: string; colors: unknown }[];
let authHeaders: string[];

const ok = (tags: Partial<Tags> = {}): Reply => ({ status: 200, body: { tags: { ...TAGS, ...tags }, model: "gemini-3.5-flash-lite" } });
const err = (status: number, code?: string, headers?: Record<string, string>): Reply => ({
  status,
  body: code ? { code } : {},
  headers,
});

function makeFetch() {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    sentBodies.push(body);
    authHeaders.push((init.headers as Record<string, string>).Authorization);
    const next = replies.shift() ?? ok();
    const r = typeof next === "function" ? await next(body) : next;
    if (r === "network") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.body ?? {}), {
      status: r.status,
      headers: { "content-type": "application/json", ...r.headers },
    });
  });
}

function deps(over: Partial<TagQueueDeps> = {}): TagQueueDeps {
  return {
    db,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => new Date(clock),
    prepareImage: vi.fn(async () => ({ image: "UklGRgAAAABXRUJQ", colors: [{ hex: "#1f2a44", share: 1 }] })),
    getToken: vi.fn(async (o?: { refresh?: boolean }) => (o?.refresh ? "tok-2" : "tok-1")),
    isOnline: () => online,
    isVisible: () => visible,
    sleep: async (ms) => {
      clock += ms;
    },
    random: () => 0.5,
    ...over,
  };
}

// Items waiting for AI are created with tagSource "ai" and tagStatus "queued".
async function seed(n = 1, over: Partial<Item> = {}): Promise<Item[]> {
  const out: Item[] = [];
  for (let i = 0; i < n; i++) {
    const { item } = await addItem(db, {
      item: newItem({ name: `Piece ${i}`, tagSource: "ai", tagStatus: "queued", ...over }),
      images: images(i + 1),
      enqueueTag: true,
    });
    out.push(item);
  }
  // addItem stamps jobs with the real clock; line them up with the fake one.
  await db.tagJobs.toCollection().modify({ nextAt: iso(clock) });
  await updateSettings(db, { aiConsent: true });
  return out;
}

const jobOf = async (itemId: string) => (await db.tagJobs.where("itemId").equals(itemId).first())!;

beforeEach(() => {
  db = freshDb();
  clock = T0;
  online = true;
  visible = true;
  replies = [];
  sentBodies = [];
  authHeaders = [];
  fetchImpl = makeFetch();
});

describe("success", () => {
  it("writes the tags with tagSource ai and closes the job", async () => {
    const [item] = await seed();
    const d = deps();
    const summary = await runQueue(d);
    expect(summary).toMatchObject({ sent: 1, tagged: 1, stopped: "idle" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/tag");
    expect(sentBodies[0]).toEqual({ itemId: item.id, image: "UklGRgAAAABXRUJQ", colors: [{ hex: "#1f2a44", share: 1 }] });
    expect(authHeaders[0]).toBe("Bearer tok-1");

    const saved = (await getItem(db, item.id))!;
    expect(saved).toMatchObject({
      name: "Navy oxford shirt",
      subtype: "shirt",
      colors: TAGS.colors,
      primaryHex: "#1f2a44",
      occasions: ["work", "date"],
      tagSource: "ai",
      tagStatus: "done",
      tagCheck: false,
    });
    expect(saved).not.toHaveProperty("confidence");
    expect(saved).not.toHaveProperty("isClothing");
    expect(saved.aiRaw).toEqual({ tags: TAGS, model: "gemini-3.5-flash-lite" });
    expect(await jobOf(item.id)).toMatchObject({ state: "done", attempts: 1 });
  });

  it("marks Check these for low confidence or not clothing", async () => {
    await seed(2);
    replies = [ok({ confidence: 0.49 }), ok({ isClothing: false, confidence: 0.95 })];
    await runQueue(deps());
    const [a, b] = sentBodies.map((x) => ({ id: x.itemId }));
    expect((await getItem(db, a.id))!.tagCheck).toBe(true);
    expect((await getItem(db, b.id))!.tagCheck).toBe(true);
  });
});

describe("consent and connectivity", () => {
  it("consent off or not asked: no request ever leaves the device", async () => {
    await seed(3);
    for (const aiConsent of [false, null]) {
      await updateSettings(db, { aiConsent });
      const d = deps();
      expect((await runQueue(d)).stopped).toBe("no_consent");
      expect(d.prepareImage).not.toHaveBeenCalled();
      expect(d.getToken).not.toHaveBeenCalled();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await db.tagJobs.toArray()).every((j) => j.state === "waiting")).toBe(true);
  });

  it("offline: stays queued, nothing sent; back online it goes", async () => {
    const [item] = await seed();
    online = false;
    expect((await runQueue(deps())).stopped).toBe("offline");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await jobOf(item.id)).toMatchObject({ state: "waiting", attempts: 0 });
    online = true;
    expect((await runQueue(deps())).tagged).toBe(1);
  });

  it("dropping offline mid request leaves the job waiting without spending an attempt", async () => {
    const [item] = await seed();
    replies = [
      () => {
        online = false;
        return "network";
      },
    ];
    expect((await runQueue(deps())).stopped).toBe("offline");
    expect(await jobOf(item.id)).toMatchObject({ state: "waiting", attempts: 0 });
  });
});

describe("backoff", () => {
  it("min(2^attempts x 5 s, 15 min) with +-20% jitter", () => {
    expect([1, 2, 3, 4, 5].map((n) => backoffDelay(n, () => 0.5))).toEqual([10_000, 20_000, 40_000, 80_000, 160_000]);
    expect(backoffDelay(1, () => 0)).toBe(8_000);
    expect(backoffDelay(1, () => 1)).toBe(12_000);
    expect(backoffDelay(12, () => 0.5)).toBe(15 * 60_000);
    expect(backoffDelay(12, () => 1)).toBe(18 * 60_000);
  });

  it("retries 502 on the backoff schedule, then dead after 6 attempts", async () => {
    const [item] = await seed();
    replies = Array.from({ length: MAX_ATTEMPTS }, () => err(502, "upstream"));
    const waits: number[] = [];
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await runQueue(deps());
      const job = await jobOf(item.id);
      expect(job).toMatchObject({ state: "waiting", attempts: i, lastError: "upstream" });
      waits.push(Date.parse(job.nextAt) - clock);
      // Not due yet: a trigger now sends nothing.
      await runQueue(deps());
      expect(fetchImpl).toHaveBeenCalledTimes(i);
      clock = Date.parse(job.nextAt);
    }
    expect(waits).toEqual([10_000, 20_000, 40_000, 80_000, 160_000]);
    await runQueue(deps());
    expect(await jobOf(item.id)).toMatchObject({ state: "dead", attempts: 6 });
    expect((await getItem(db, item.id))!.tagStatus).toBe("failed");
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("respects Retry-After on 429 and holds the whole queue", async () => {
    await seed(2);
    replies = [err(429, "rate_limited", { "Retry-After": "30" })];
    const s = await runQueue(deps());
    expect(s.stopped).toBe("rate_limited");
    expect(s.sent).toBe(1);
    const job = await jobOf(sentBodies[0].itemId);
    expect(job).toMatchObject({ attempts: 1, nextAt: iso(T0 + 30_000) });
    clock += 29_000;
    expect((await runQueue(deps())).sent).toBe(0);
    clock += 1_000;
    expect((await runQueue(deps())).tagged).toBe(2);
  });

  it("503 without Retry-After uses the exponential backoff", async () => {
    const [a] = await seed();
    replies = [err(503)];
    await runQueue(deps({ random: () => 0 }));
    expect((await jobOf(a.id)).nextAt).toBe(iso(T0 + 8_000));
  });

  it("parses Retry-After as seconds or an HTTP date", () => {
    const now = new Date(T0);
    expect(parseRetryAfter("120", now)).toBe(120_000);
    expect(parseRetryAfter(new Date(T0 + 90_000).toUTCString(), now)).toBe(90_000);
    expect(parseRetryAfter("soon", now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
  });
});

describe("budget pause", () => {
  it("pauses the whole queue until next Pacific midnight + 5 min and says so once", async () => {
    await seed(3);
    replies = [err(429, "global_budget", { "Retry-After": "50000" })];
    const onBudgetPaused = vi.fn();
    const s = await runQueue(deps({ onBudgetPaused }));
    const until = "2026-10-15T07:05:00.000Z"; // 00:05 PDT
    expect(s).toMatchObject({ stopped: "paused", pausedUntil: until, sent: 1 });
    expect((await getSettings(db)).tagPausedUntil).toBe(until);
    expect(onBudgetPaused).toHaveBeenCalledTimes(1);
    expect(onBudgetPaused.mock.calls[0][0].toISOString()).toBe(until);
    expect(await jobOf(sentBodies[0].itemId)).toMatchObject({ state: "waiting", attempts: 0, nextAt: until });

    clock = Date.parse(until) - 1;
    expect(await runQueue(deps({ onBudgetPaused }))).toMatchObject({ stopped: "paused", sent: 0 });
    expect(onBudgetPaused).toHaveBeenCalledTimes(1);

    clock = Date.parse(until);
    expect(await runQueue(deps({ onBudgetPaused }))).toMatchObject({ stopped: "idle", tagged: 3 });
    expect((await getSettings(db)).tagPausedUntil).toBeUndefined();
  });

  it("daily_budget pauses the same way", async () => {
    await seed();
    replies = [err(429, "daily_budget")];
    expect((await runQueue(deps())).pausedUntil).toBe("2026-10-15T07:05:00.000Z");
  });

  it("not_configured rests until tomorrow instead of burning attempts", async () => {
    const [a] = await seed();
    replies = [err(503, "not_configured")];
    expect((await runQueue(deps())).stopped).toBe("paused");
    expect((await jobOf(a.id)).attempts).toBe(0);
  });

  it("finds the next Pacific midnight across both 2026 DST changes", () => {
    const cases: [string, string][] = [
      // Spring forward, Sunday 8 March 2026 at 02:00 PST.
      ["2026-03-07T20:00:00-08:00", "2026-03-08T08:00:00.000Z"], // that midnight is still PST
      ["2026-03-08T01:59:00-08:00", "2026-03-09T07:00:00.000Z"], // next one is PDT
      ["2026-03-08T12:00:00-07:00", "2026-03-09T07:00:00.000Z"],
      // Fall back, Sunday 1 November 2026 at 02:00 PDT.
      ["2026-10-31T20:00:00-07:00", "2026-11-01T07:00:00.000Z"], // still PDT
      ["2026-11-01T01:30:00-07:00", "2026-11-02T08:00:00.000Z"], // first 01:30, PDT
      ["2026-11-01T01:30:00-08:00", "2026-11-02T08:00:00.000Z"], // second 01:30, PST
      ["2026-11-01T23:59:59-08:00", "2026-11-02T08:00:00.000Z"],
      // Exactly at midnight means the next one.
      ["2026-10-15T00:00:00-07:00", "2026-10-16T07:00:00.000Z"],
      ["2026-12-31T23:00:00-08:00", "2027-01-01T08:00:00.000Z"],
    ];
    for (const [now, want] of cases) expect([now, nextPacificMidnight(new Date(now)).toISOString()]).toEqual([now, want]);
  });

  it("pauses to midnight + 5 min on the DST days", async () => {
    expect(budgetResumeAt(new Date("2026-03-07T22:00:00-08:00")).toISOString()).toBe("2026-03-08T08:05:00.000Z");
    expect(budgetResumeAt(new Date("2026-03-08T22:00:00-07:00")).toISOString()).toBe("2026-03-09T07:05:00.000Z");
    expect(budgetResumeAt(new Date("2026-10-31T22:00:00-07:00")).toISOString()).toBe("2026-11-01T07:05:00.000Z");
    expect(budgetResumeAt(new Date("2026-11-01T22:00:00-08:00")).toISOString()).toBe("2026-11-02T08:05:00.000Z");

    // And through runQueue, on the fall back day: 25 hours from midnight to midnight.
    clock = Date.parse("2026-11-01T00:30:00-07:00");
    await seed();
    replies = [err(429, "global_budget")];
    expect((await runQueue(deps())).pausedUntil).toBe("2026-11-02T08:05:00.000Z");
  });
});

describe("validation errors and tokens", () => {
  it("4xx invalid: job dead, item failed, the queue moves on", async () => {
    await seed(2);
    replies = [err(400, "invalid"), ok()];
    const s = await runQueue(deps());
    expect(s).toMatchObject({ dead: 1, tagged: 1, stopped: "idle" });
    const [a, b] = sentBodies.map((x) => ({ id: x.itemId }));
    expect(await jobOf(a.id)).toMatchObject({ state: "dead", lastError: "invalid" });
    expect((await getItem(db, a.id))!.tagStatus).toBe("failed");
    expect((await getItem(db, b.id))!.tagStatus).toBe("done");
  });

  it("401: re-issues the token once, silently, then retries", async () => {
    const [a] = await seed();
    await updateSettings(db, { installToken: "tok-1" });
    replies = [err(401, "token"), ok()];
    const d = deps();
    expect((await runQueue(d)).tagged).toBe(1);
    expect(authHeaders).toEqual(["Bearer tok-1", "Bearer tok-2"]);
    expect(d.getToken).toHaveBeenLastCalledWith({ refresh: true, rejected: "tok-1" });
    expect((await getSettings(db)).installToken).toBeUndefined(); // the fake provider did not store one
    expect(await jobOf(a.id)).toMatchObject({ state: "done" });
  });

  it("401 twice: no third request, the job backs off", async () => {
    const [a] = await seed();
    replies = [err(401, "token"), err(401, "token")];
    const s = await runQueue(deps());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(s.stopped).toBe("token_unavailable");
    expect(await jobOf(a.id)).toMatchObject({ state: "waiting", attempts: 1 });
  });

  it("no token available: stops without a request or a spent attempt", async () => {
    const [a] = await seed();
    const s = await runQueue(deps({ getToken: async () => Promise.reject(new Error("429")) }));
    expect(s.stopped).toBe("token_unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await jobOf(a.id)).toMatchObject({ state: "waiting", attempts: 0 });
  });
});

describe("manual edits are never overwritten", () => {
  it("an item the user tagged first is never sent", async () => {
    const [a] = await seed();
    await editTags(db, a.id, { name: "My blue shirt", warmth: 3 });
    expect((await getItem(db, a.id))!.tagSource).toBe("ai-edited");
    const s = await runQueue(deps());
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(s.kept).toBe(1);
    expect((await getItem(db, a.id))!).toMatchObject({ name: "My blue shirt", warmth: 3, tagSource: "ai-edited", tagStatus: "done" });
    expect(await jobOf(a.id)).toMatchObject({ state: "done" });
  });

  it("a manual item with a stray job is never sent", async () => {
    const [a] = await seed(1, { tagSource: "manual", tagStatus: "queued" });
    await runQueue(deps());
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await getItem(db, a.id))!).toMatchObject({ name: "Piece 0", tagSource: "manual", tagStatus: "manual" });
  });

  it("an edit made while the request is out wins over the AI answer", async () => {
    const [a] = await seed();
    replies = [
      async () => {
        await editTags(db, a.id, { name: "Grandma's shirt", vibes: ["traditional"] });
        return ok();
      },
    ];
    const s = await runQueue(deps());
    expect(s).toMatchObject({ sent: 1, tagged: 0, kept: 1 });
    const saved = (await getItem(db, a.id))!;
    expect(saved).toMatchObject({ name: "Grandma's shirt", vibes: ["traditional"], tagSource: "ai-edited" });
    expect(saved.aiRaw).toBeUndefined();
    expect(await jobOf(a.id)).toMatchObject({ state: "done" });
  });

  it("an item already tagged by AI is not sent again", async () => {
    const [a] = await seed();
    await updateItem(db, a.id, { tagStatus: "done" });
    await runQueue(deps());
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("pace", () => {
  it("one request at a time: concurrent triggers join the same run", async () => {
    await seed(3);
    let inFlight = 0;
    let maxInFlight = 0;
    replies = Array.from({ length: 3 }, () => async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return ok();
    });
    const d = deps();
    const [x, y, z] = await Promise.all([runQueue(d), runQueue(d), runQueue(d)]);
    expect(x).toBe(y);
    expect(y).toBe(z);
    expect(maxInFlight).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("at most 6 per minute: waits while visible", async () => {
    await seed(8);
    const times: number[] = [];
    replies = Array.from({ length: 8 }, () => () => {
      times.push(clock);
      return ok();
    });
    expect((await runQueue(deps())).tagged).toBe(8);
    expect(times.slice(0, CLIENT_RPM).every((t) => t === T0)).toBe(true);
    expect(times[6]).toBe(T0 + 60_000);
  });

  it("at most 6 per minute: stops instead of waiting while hidden", async () => {
    await seed(8);
    visible = false;
    const sleep = vi.fn(async () => {});
    const s = await runQueue(deps({ sleep }));
    expect(s).toMatchObject({ sent: 6, stopped: "hidden" });
    expect(sleep).not.toHaveBeenCalled();
    expect(await db.tagJobs.where("state").equals("waiting").count()).toBe(2);
  });

  it("frees a job a crashed tab left running once its lease is over", async () => {
    const [a] = await seed();
    await db.tagJobs.toCollection().modify({ state: "running", nextAt: iso(T0 + 60_000) });
    expect((await runQueue(deps())).sent).toBe(0);
    clock = T0 + 60_000;
    expect((await runQueue(deps())).tagged).toBe(1);
    expect(await jobOf(a.id)).toMatchObject({ state: "done" });
  });
});

describe("definition of done (18)", () => {
  it("over 30 days of daily triggers with no new items, each item is sent exactly once", async () => {
    const items = await seed(5);
    // Day 1 has a flaky start: one upstream error and one rate limit before things settle.
    replies = [err(502, "upstream"), err(429, "rate_limited", { "Retry-After": "60" })];
    for (let day = 0; day < 30; day++) {
      // Several triggers a day: app open, back online, visibility.
      for (const hour of [7, 12, 19]) {
        clock = T0 + day * 24 * 3600_000 + (hour - 9) * 3600_000;
        await runQueue(deps());
      }
    }
    const perItem = new Map<string, number>();
    for (const b of sentBodies) perItem.set(b.itemId, (perItem.get(b.itemId) ?? 0) + 1);
    const okCalls = fetchImpl.mock.calls.length - 2; // minus the two failures
    expect(okCalls).toBe(items.length);
    expect(sentBodies.filter((b, i) => i >= 2).map((b) => b.itemId).sort()).toEqual(items.map((i) => i.id).sort());
    for (const i of items) expect((await getItem(db, i.id))!.tagStatus).toBe("done");
  });

  it("with no failures at all, fetch is called exactly once per item", async () => {
    const items = await seed(4);
    for (let day = 0; day < 30; day++) {
      clock = T0 + day * 24 * 3600_000;
      await runQueue(deps());
      await runQueue(deps());
    }
    expect(fetchImpl).toHaveBeenCalledTimes(items.length);
    expect(new Set(sentBodies.map((b) => b.itemId)).size).toBe(items.length);
  });
});

describe("token provider", () => {
  function installFetch(tokens: string[]) {
    return vi.fn(async (_url: string, init: RequestInit) => {
      void init;
      return Response.json({ token: tokens.shift(), expiresAt: "2027-04-12T16:00:00.000Z" });
    });
  }
  const tokenAt = (t: number) =>
    `${Buffer.from(JSON.stringify({ iid: crypto.randomUUID(), iat: Math.floor(t / 1000) })).toString("base64url")}.sig`;

  it("reuses a fresh stored token and fetches one when missing", async () => {
    const stored = tokenAt(T0);
    const f = installFetch([tokenAt(T0 + 1)]);
    const getToken = createTokenProvider({ db, fetchImpl: f as unknown as typeof fetch, now: () => new Date(clock) });
    const fresh = await getToken();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe("/api/install");
    expect((await getSettings(db)).installToken).toBe(fresh);
    await updateSettings(db, { installToken: stored });
    expect(await getToken()).toBe(stored);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("renews near expiry and on refresh, sending the old token to keep the install id", async () => {
    const old = tokenAt(T0 - 175 * 24 * 3600_000);
    expect(tokenExpiry(old)!.getTime()).toBe(Math.floor((T0 - 175 * 24 * 3600_000) / 1000) * 1000 + 180 * 24 * 3600_000);
    await updateSettings(db, { installToken: old });
    const f = installFetch([tokenAt(T0), tokenAt(T0 + 5)]);
    const getToken = createTokenProvider({ db, fetchImpl: f as unknown as typeof fetch, now: () => new Date(clock) });
    await getToken();
    expect((f.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe(`Bearer ${old}`);
    await getToken({ refresh: true, rejected: "bad-one" });
    expect((f.mock.calls[1][1].headers as Record<string, string>).Authorization).toBe("Bearer bad-one");
  });

  it("throws when the server will not issue", async () => {
    const f = vi.fn(async () => Response.json({ code: "rate_limited" }, { status: 429 }));
    const getToken = createTokenProvider({ db, fetchImpl: f as unknown as typeof fetch, now: () => new Date(clock) });
    await expect(getToken()).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });
});
