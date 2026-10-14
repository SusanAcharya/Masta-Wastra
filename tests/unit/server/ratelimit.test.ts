import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { modelOrder, readServerEnv } from "@/lib/server/env";
import {
  budgetRetryAfter,
  checkInstallAndIp,
  checkTokenIssue,
  createMemoryStore,
  createUpstashStore,
  LIMITS,
  markModelSpent,
  reserveModel,
  withFallback,
} from "@/lib/server/ratelimit";
import { FALLBACK, PRIMARY } from "./fixtures";

// 09:00 Pacific (PDT) on 2026-10-14, so a day window has 15 hours left.
const T0 = Date.parse("2026-10-14T16:00:00Z");
const MIDNIGHT = Date.parse("2026-10-15T07:00:00Z");

function clock(start = T0) {
  const c = { t: start };
  return { c, store: createMemoryStore(() => c.t) };
}

describe("per install and per IP limits", () => {
  it("allows 20 per 10 minutes, then rate_limited with Retry-After to the window end", async () => {
    const { c, store } = clock();
    for (let i = 0; i < LIMITS.installPer10Min; i++) {
      expect(await checkInstallAndIp(store, { iid: "a", ip: `10.0.0.${i}` }, c.t)).toEqual({ ok: true });
    }
    const r = await checkInstallAndIp(store, { iid: "a", ip: "10.0.1.1" }, c.t);
    expect(r).toMatchObject({ ok: false, code: "rate_limited" });
    // T0 is on a 10 minute boundary, so the whole window is left.
    expect(!r.ok && r.retryAfter).toBe(600);
    c.t += 600_000;
    expect((await checkInstallAndIp(store, { iid: "a", ip: "10.0.2.1" }, c.t)).ok).toBe(true);
  });

  it("allows 30 per Pacific day per install, then daily_budget until midnight", async () => {
    const { c, store } = clock();
    for (let i = 0; i < LIMITS.installPerDay; i++) {
      if (i > 0 && i % 15 === 0) c.t += 600_000; // stay under 20 per 10 min
      expect((await checkInstallAndIp(store, { iid: "a", ip: `10.0.0.${i}` }, c.t)).ok).toBe(true);
    }
    c.t += 600_000;
    const r = await checkInstallAndIp(store, { iid: "a", ip: "10.9.9.9" }, c.t);
    expect(r).toMatchObject({ ok: false, code: "daily_budget" });
    expect(!r.ok && r.retryAfter).toBe(Math.ceil((MIDNIGHT - c.t) / 1000));
    c.t = MIDNIGHT;
    expect((await checkInstallAndIp(store, { iid: "a", ip: "10.9.9.9" }, c.t)).ok).toBe(true);
  });

  it("allows 40 per IP per day across installs", async () => {
    const { c, store } = clock();
    for (let i = 0; i < LIMITS.ipPerDay; i++) {
      expect((await checkInstallAndIp(store, { iid: `i${i}`, ip: "1.1.1.1" }, c.t)).ok).toBe(true);
    }
    expect(await checkInstallAndIp(store, { iid: "fresh", ip: "1.1.1.1" }, c.t)).toMatchObject({
      ok: false,
      code: "daily_budget",
    });
    expect((await checkInstallAndIp(store, { iid: "fresh", ip: "2.2.2.2" }, c.t)).ok).toBe(true);
  });

  it("allows 3 install tokens per IP per day", async () => {
    const { c, store } = clock();
    for (let i = 0; i < 3; i++) expect((await checkTokenIssue(store, "1.1.1.1", c.t)).ok).toBe(true);
    expect(await checkTokenIssue(store, "1.1.1.1", c.t)).toMatchObject({ ok: false, code: "rate_limited" });
    expect((await checkTokenIssue(store, "2.2.2.2", c.t)).ok).toBe(true);
    c.t = MIDNIGHT + 1;
    expect((await checkTokenIssue(store, "1.1.1.1", c.t)).ok).toBe(true);
  });
});

describe("global budget per model", () => {
  const env = { geminiRpm: 2, geminiRpd: 3 };

  it("uses the primary, then the fallback when the primary's minute is full", async () => {
    const { c, store } = clock();
    const models = [PRIMARY, FALLBACK];
    expect(await reserveModel(store, env, models, c.t)).toEqual({ ok: true, model: PRIMARY });
    expect(await reserveModel(store, env, models, c.t)).toEqual({ ok: true, model: PRIMARY });
    expect(await reserveModel(store, env, models, c.t)).toEqual({ ok: true, model: FALLBACK });
    expect(await reserveModel(store, env, models, c.t)).toEqual({ ok: true, model: FALLBACK });
    const r = await reserveModel(store, env, models, c.t);
    expect(r).toMatchObject({ ok: false, code: "rate_limited", retryAfter: 60 });
    // A busy minute refunds the day count: the primary has used 2 of 3, not 3.
    c.t += 60_000;
    expect(await reserveModel(store, env, models, c.t)).toEqual({ ok: true, model: PRIMARY });
    c.t += 60_000;
    expect(await reserveModel(store, env, models, c.t)).toEqual({ ok: true, model: FALLBACK });
  });

  it("switches to the fallback when the primary's day is spent, then global_budget", async () => {
    const { c, store } = clock();
    const models = [PRIMARY, FALLBACK];
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      c.t += 60_000;
      const r = await reserveModel(store, env, models, c.t);
      seen.push(r.ok ? r.model : r.code);
    }
    expect(seen).toEqual([PRIMARY, PRIMARY, PRIMARY, FALLBACK, FALLBACK, FALLBACK]);
    c.t += 60_000;
    const r = await reserveModel(store, env, models, c.t);
    expect(r).toMatchObject({ ok: false, code: "global_budget" });
    expect(!r.ok && r.retryAfter).toBe(Math.ceil((MIDNIGHT + 300_000 - c.t) / 1000));
    c.t = MIDNIGHT;
    expect(await reserveModel(store, env, models, c.t)).toEqual({ ok: true, model: PRIMARY });
  });

  it("markModelSpent closes the model for the rest of the Pacific day", async () => {
    const { c, store } = clock();
    await markModelSpent(store, env, PRIMARY, c.t);
    expect(await reserveModel(store, env, [PRIMARY, FALLBACK], c.t)).toEqual({ ok: true, model: FALLBACK });
    c.t = MIDNIGHT;
    expect(await reserveModel(store, env, [PRIMARY, FALLBACK], c.t)).toEqual({ ok: true, model: PRIMARY });
  });

  it("budgetRetryAfter points at Pacific midnight plus 5 minutes", () => {
    expect(budgetRetryAfter(T0)).toBe((MIDNIGHT + 300_000 - T0) / 1000);
  });
});

describe("Upstash REST store", () => {
  it("sends one pipeline of SET NX PX + INCR per window", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Response.json([{ result: "OK" }, { result: 1 }, { result: null }, { result: 7 }]);
    }) as unknown as typeof fetch;
    const store = createUpstashStore({ url: "https://kv.example", token: "tkn", fetchImpl });
    const counts = await store.hit([
      { key: "mw:a", ttlMs: 1000 },
      { key: "mw:b", ttlMs: 2000 },
    ]);
    expect(counts).toEqual([1, 7]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://kv.example/pipeline");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tkn");
    expect(JSON.parse(calls[0].init.body as string)).toEqual([
      ["SET", "mw:a", "0", "PX", "1000", "NX"],
      ["INCR", "mw:a"],
      ["SET", "mw:b", "0", "PX", "2000", "NX"],
      ["INCR", "mw:b"],
    ]);
  });

  it("falls back to the memory store when Redis fails", async () => {
    const failing = createUpstashStore({
      url: "https://kv.example",
      token: "t",
      fetchImpl: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch,
    });
    const onError = vi.fn();
    const store = withFallback(failing, createMemoryStore(() => T0), onError);
    expect(await store.hit([{ key: "mw:x", ttlMs: 1000 }])).toEqual([1]);
    expect(await store.hit([{ key: "mw:x", ttlMs: 1000 }])).toEqual([2]);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("memory windows expire", async () => {
    const { c, store } = clock();
    await store.hit([{ key: "k", ttlMs: 1000 }]);
    expect(await store.hit([{ key: "k", ttlMs: 1000 }])).toEqual([2]);
    c.t += 1000;
    expect(await store.hit([{ key: "k", ttlMs: 1000 }])).toEqual([1]);
  });
});

describe("server env", () => {
  it("has the documented defaults", () => {
    const env = readServerEnv({});
    expect(env).toEqual({
      geminiModel: "gemini-3.5-flash-lite",
      geminiFallbackModel: "gemini-3.1-flash-lite",
      geminiRpm: 10,
      geminiRpd: 45,
      installSecret: null,
      allowedOrigins: [],
      redis: null,
    });
    expect(modelOrder(env)).toEqual([PRIMARY, FALLBACK]);
  });

  it("reads KV_* first and UPSTASH_* as the fallback names", () => {
    expect(readServerEnv({ UPSTASH_REDIS_REST_URL: "https://u/", UPSTASH_REDIS_REST_TOKEN: "ut" }).redis).toEqual({
      url: "https://u",
      token: "ut",
    });
    expect(
      readServerEnv({
        KV_REST_API_URL: "https://kv",
        KV_REST_API_TOKEN: "kt",
        UPSTASH_REDIS_REST_URL: "https://u",
        UPSTASH_REDIS_REST_TOKEN: "ut",
      }).redis,
    ).toEqual({ url: "https://kv", token: "kt" });
    expect(readServerEnv({ KV_REST_API_URL: "https://kv" }).redis).toBeNull();
  });

  it("parses origins, numbers, a short secret and a disabled fallback", () => {
    const env = readServerEnv({
      ALLOWED_ORIGINS: " https://a.app/, https://b.app ,",
      GEMINI_RPM: "5",
      GEMINI_RPD: "nope",
      INSTALL_SECRET: "short",
      GEMINI_FALLBACK_MODEL: "none",
    });
    expect(env.allowedOrigins).toEqual(["https://a.app", "https://b.app"]);
    expect(env.geminiRpm).toBe(5);
    expect(env.geminiRpd).toBe(45);
    expect(env.installSecret).toBeNull();
    expect(modelOrder(env)).toEqual([PRIMARY]);
  });
});
