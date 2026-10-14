import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ServerEnv } from "@/lib/server/env";
import type { GeminiClient } from "@/lib/server/gemini";
import { createMemoryStore, type CounterStore } from "@/lib/server/ratelimit";
import { createTagHandler } from "@/lib/server/tag-handler";
import { issueToken } from "@/lib/server/token";
import { TagResponseSchema } from "@/lib/tag-api";
import { b64, FALLBACK, goodGeminiTag, jpeg, measuredColors, ORIGIN, png, PRIMARY, SECRET, testEnv, webpVp8x } from "./fixtures";

const T0 = Date.parse("2026-10-14T16:00:00Z"); // 09:00 PDT
const MIDNIGHT = Date.parse("2026-10-15T07:00:00Z");

let clock: number;
let store: CounterStore;
let env: ServerEnv;
let gemini: ReturnType<typeof vi.fn<GeminiClient["generateContent"]>>;
let logs: string[];
let apiKey: string | undefined;

function handler() {
  return createTagHandler({
    env: () => env,
    apiKey: () => apiKey,
    geminiFactory: () => ({ generateContent: gemini }),
    store: () => store,
    now: () => clock,
    log: (event, fields) => logs.push(JSON.stringify({ event, ...fields })),
  });
}

const tokenFor = (iid = crypto.randomUUID(), at = clock) => issueToken(SECRET, new Date(at), iid).token;
const goodBody = (over: Record<string, unknown> = {}) => ({
  itemId: "item-1",
  image: b64(webpVp8x(512, 400)),
  colors: measuredColors,
  ...over,
});

function request(
  opts: {
    method?: string;
    origin?: string | null;
    token?: string | null;
    contentType?: string;
    body?: unknown;
    raw?: string;
    ip?: string;
    url?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.token !== null) headers.authorization = `Bearer ${opts.token ?? tokenFor()}`;
  headers["content-type"] = opts.contentType ?? "application/json";
  headers["x-forwarded-for"] = `${opts.ip ?? "203.0.113.7"}, 10.0.0.1`;
  const method = opts.method ?? "POST";
  return new Request(opts.url ?? `${ORIGIN}/api/tag`, {
    method,
    headers,
    body: method === "GET" ? undefined : (opts.raw ?? JSON.stringify(opts.body ?? goodBody())),
  });
}

async function call(req: Request) {
  const res = await handler()(req);
  const body = await res.json();
  return { status: res.status, body, retryAfter: res.headers.get("retry-after") };
}

beforeEach(() => {
  clock = T0;
  store = createMemoryStore(() => clock);
  env = testEnv();
  gemini = vi.fn(async () => ({ text: JSON.stringify(goodGeminiTag) }));
  logs = [];
  apiKey = "AIzaFakeKeyForTestsOnly";
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/tag happy path", () => {
  it("returns tags merged with the client's hex values and the model", async () => {
    const r = await call(request());
    expect(r.status).toBe(200);
    const parsed = TagResponseSchema.parse(r.body);
    expect(parsed.model).toBe(PRIMARY);
    expect(parsed.tags.colors).toEqual([
      { hex: "#1f2a44", name: "navy", share: 0.8 },
      { hex: "#f4f3ef", name: "white", share: 0.2 },
    ]);
    expect(parsed.tags.subtype).toBe("shirt");
    expect(gemini).toHaveBeenCalledTimes(1);
    const params = gemini.mock.calls[0][0];
    expect(params.contents[0]).toEqual({ inlineData: { mimeType: "image/webp", data: goodBody().image } });
  });

  it("accepts JPEG too and passes its real mime type", async () => {
    const r = await call(request({ body: goodBody({ image: b64(jpeg(480, 640)) }) }));
    expect(r.status).toBe(200);
    expect(gemini.mock.calls[0][0].contents[0]).toMatchObject({ inlineData: { mimeType: "image/jpeg" } });
  });

  it("logs codes and counts only, never the image, tags or token", async () => {
    const token = tokenFor();
    await call(request({ token }));
    const all = logs.join("\n");
    expect(all).toContain('"code":"ok"');
    expect(all).not.toContain(goodBody().image);
    expect(all).not.toContain("oxford");
    expect(all).not.toContain(token);
  });
});

describe("step 1: method, origin, configuration, content type, body", () => {
  it("405 for anything but POST", async () => {
    expect((await call(request({ method: "GET" }))).status).toBe(405);
  });

  it("403 origin for a missing or foreign Origin", async () => {
    expect(await call(request({ origin: null }))).toMatchObject({ status: 403, body: { code: "origin" } });
    expect(await call(request({ origin: "https://evil.example" }))).toMatchObject({
      status: 403,
      body: { code: "origin" },
    });
    expect(gemini).not.toHaveBeenCalled();
  });

  it("allows the request's own host, so preview deployments work", async () => {
    const preview = "https://masta-wastra-git-feat-susan.vercel.app";
    expect((await call(request({ origin: preview, url: `${preview}/api/tag` }))).status).toBe(200);
    expect(
      (await call(request({ origin: "http://localhost:3000", headers: { "x-forwarded-host": "localhost:3000" } }))).status,
    ).toBe(200);
  });

  it("503 not_configured without the key or the install secret", async () => {
    apiKey = undefined;
    expect(await call(request())).toMatchObject({ status: 503, body: { code: "not_configured" } });
    apiKey = "AIzaX";
    env = testEnv({ installSecret: null });
    expect(await call(request())).toMatchObject({ status: 503, body: { code: "not_configured" } });
  });

  it("415 invalid for a non JSON content type", async () => {
    expect(await call(request({ contentType: "text/plain" }))).toMatchObject({ status: 415, body: { code: "invalid" } });
  });

  it("413 invalid for a body over 200 KB, declared or streamed", async () => {
    const big = JSON.stringify(goodBody({ image: "A".repeat(210 * 1024) }));
    expect(await call(request({ raw: big }))).toMatchObject({ status: 413, body: { code: "invalid" } });
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const req = new Request(`${ORIGIN}/api/tag`, {
      method: "POST",
      headers: { origin: ORIGIN, authorization: `Bearer ${tokenFor()}`, "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(await call(req)).toMatchObject({ status: 413, body: { code: "invalid" } });
  });

  it("400 invalid for broken JSON or a bad shape", async () => {
    expect(await call(request({ raw: "{nope" }))).toMatchObject({ status: 400, body: { code: "invalid" } });
    for (const bad of [
      { colors: [] },
      { colors: [{ hex: "navy", share: 1 }] },
      { image: "data:image/webp;base64,AAAA" },
      { image: "!!!!not base64!!!!" },
      { itemId: "" },
    ]) {
      expect(await call(request({ body: goodBody(bad) }))).toMatchObject({ status: 400, body: { code: "invalid" } });
    }
    expect(gemini).not.toHaveBeenCalled();
  });
});

describe("step 2: install token", () => {
  it("401 token when missing, tampered, signed elsewhere or expired", async () => {
    const good = tokenFor();
    const [p, mac] = good.split(".");
    const tampered = `${p}.${mac.slice(0, -2)}${mac.at(-2) === "A" ? "B" : "A"}${mac.at(-1)}`;
    const other = issueToken("x".repeat(40), new Date(clock)).token;
    const expired = tokenFor(crypto.randomUUID(), clock - 181 * 24 * 3600_000);
    for (const token of [null, "garbage", tampered, other, expired]) {
      expect(await call(request({ token }))).toMatchObject({ status: 401, body: { code: "token" } });
    }
    expect(gemini).not.toHaveBeenCalled();
  });
});

describe("steps 3 and 4: per install and per IP", () => {
  it("429 rate_limited after 20 in 10 minutes for one install", async () => {
    const token = tokenFor();
    env = testEnv({ geminiRpm: 1000, geminiRpd: 1000 });
    for (let i = 0; i < 20; i++) expect((await call(request({ token, ip: `198.51.100.${i}` }))).status).toBe(200);
    const r = await call(request({ token, ip: "198.51.100.99" }));
    expect(r).toMatchObject({ status: 429, body: { code: "rate_limited" }, retryAfter: "600" });
    expect(gemini).toHaveBeenCalledTimes(20);
  });

  it("429 daily_budget after 30 a day for one install, Retry-After to Pacific midnight", async () => {
    const token = tokenFor();
    env = testEnv({ geminiRpm: 1000, geminiRpd: 1000 });
    for (let i = 0; i < 30; i++) {
      if (i === 15) clock += 600_000;
      expect((await call(request({ token, ip: `198.51.100.${i}` }))).status).toBe(200);
    }
    clock += 600_000;
    const r = await call(request({ token, ip: "198.51.100.200" }));
    expect(r).toMatchObject({ status: 429, body: { code: "daily_budget" } });
    expect(Number(r.retryAfter)).toBe((MIDNIGHT - clock) / 1000);
  });

  it("429 daily_budget after 40 a day from one IP (first x-forwarded-for hop)", async () => {
    env = testEnv({ geminiRpm: 1000, geminiRpd: 1000 });
    for (let i = 0; i < 40; i++) expect((await call(request({ ip: "192.0.2.1" }))).status).toBe(200);
    expect(await call(request({ ip: "192.0.2.1" }))).toMatchObject({ status: 429, body: { code: "daily_budget" } });
    expect((await call(request({ ip: "192.0.2.2" }))).status).toBe(200);
  });
});

describe("step 5: global budget per model", () => {
  it("moves to the fallback after the primary's RPM, then 429 rate_limited", async () => {
    env = testEnv({ geminiRpm: 2 });
    const models: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await call(request({ ip: `192.0.2.${i}` }));
      models.push(r.body.model);
    }
    expect(models).toEqual([PRIMARY, PRIMARY, FALLBACK, FALLBACK]);
    const r = await call(request({ ip: "192.0.2.9" }));
    expect(r).toMatchObject({ status: 429, body: { code: "rate_limited" }, retryAfter: "60" });
  });

  it("moves to the fallback after the primary's Pacific day, then 429 global_budget", async () => {
    env = testEnv({ geminiRpd: 2 });
    const models: string[] = [];
    for (let i = 0; i < 4; i++) {
      clock += 60_000;
      models.push((await call(request({ ip: `192.0.2.${i}` }))).body.model);
    }
    expect(models).toEqual([PRIMARY, PRIMARY, FALLBACK, FALLBACK]);
    clock += 60_000;
    const r = await call(request({ ip: "192.0.2.9" }));
    expect(r).toMatchObject({ status: 429, body: { code: "global_budget" } });
    expect(Number(r.retryAfter)).toBe((MIDNIGHT + 300_000 - clock) / 1000);
    expect(gemini).toHaveBeenCalledTimes(4);
  });
});

describe("step 6: image sniff", () => {
  it("400 invalid for PNG bytes and for an image over 640 px", async () => {
    expect(await call(request({ body: goodBody({ image: b64(png()) }) }))).toMatchObject({
      status: 400,
      body: { code: "invalid" },
    });
    expect(await call(request({ body: goodBody({ image: b64(webpVp8x(641, 300)) }) }))).toMatchObject({
      status: 400,
      body: { code: "invalid" },
    });
    expect((await call(request({ body: goodBody({ image: b64(webpVp8x(640, 640)) }) }))).status).toBe(200);
    expect(gemini).toHaveBeenCalledTimes(1);
  });
});

describe("Gemini failures", () => {
  const quota = (kind: "Day" | "Minute") =>
    Object.assign(new Error(`{"quotaId":"GenerateRequestsPer${kind}PerProjectPerModel-FreeTier"}`), { status: 429 });

  it("502 upstream when Gemini errors or answers with invalid JSON", async () => {
    gemini.mockRejectedValueOnce(Object.assign(new Error("overloaded"), { status: 503 }));
    expect(await call(request())).toMatchObject({ status: 502, body: { code: "upstream" } });
    gemini.mockResolvedValueOnce({ text: "{oops" });
    expect(await call(request())).toMatchObject({ status: 502, body: { code: "upstream" } });
    gemini.mockResolvedValueOnce({ text: JSON.stringify({ ...goodGeminiTag, category: "spaceship" }) });
    expect(await call(request())).toMatchObject({ status: 502, body: { code: "upstream" } });
  });

  it("Google's per day 429 on the primary falls back and closes the primary for the day", async () => {
    gemini.mockImplementation(async (p) => {
      if (p.model === PRIMARY) throw quota("Day");
      return { text: JSON.stringify(goodGeminiTag) };
    });
    const r = await call(request());
    expect(r).toMatchObject({ status: 200, body: { model: FALLBACK } });
    gemini.mockClear();
    await call(request());
    expect(gemini.mock.calls.map((c) => c[0].model)).toEqual([FALLBACK]);
  });

  it("per day 429 on both models is our global_budget", async () => {
    gemini.mockRejectedValue(quota("Day"));
    const r = await call(request());
    expect(r).toMatchObject({ status: 429, body: { code: "global_budget" } });
    expect(Number(r.retryAfter)).toBe((MIDNIGHT + 300_000 - clock) / 1000);
    gemini.mockClear();
    expect(await call(request())).toMatchObject({ status: 429, body: { code: "global_budget" } });
    expect(gemini).not.toHaveBeenCalled();
  });

  it("per minute 429 on both models is rate_limited", async () => {
    gemini.mockRejectedValue(quota("Minute"));
    expect(await call(request())).toMatchObject({ status: 429, body: { code: "rate_limited" }, retryAfter: "60" });
    expect(gemini).toHaveBeenCalledTimes(2);
  });
});

describe("route module", () => {
  it("exports only POST and maxDuration (runtime is rejected with cacheComponents)", async () => {
    const mod = await import("@/app/api/tag/route");
    expect(Object.keys(mod).sort()).toEqual(["POST", "maxDuration"]);
    expect(mod.maxDuration).toBe(30);
  });

  it("answers 503 not_configured from the real env when nothing is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("INSTALL_SECRET", "");
    vi.stubEnv("ALLOWED_ORIGINS", ORIGIN);
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { POST } = await import("@/app/api/tag/route");
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: "not_configured" });
    vi.unstubAllEnvs();
  });
});

describe("Gemini call deadline", () => {
  it("is at least Google's 10 s minimum (8 s made every real call fail with 400 INVALID_ARGUMENT)", async () => {
    const { CALL_TIMEOUT_MS } = await import("@/lib/server/gemini");
    expect(CALL_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
  });
});
