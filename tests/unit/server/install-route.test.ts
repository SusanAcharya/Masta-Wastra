import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ServerEnv } from "@/lib/server/env";
import { createInstallHandler } from "@/lib/server/install-handler";
import { createMemoryStore, type CounterStore } from "@/lib/server/ratelimit";
import { issueToken, verifyToken } from "@/lib/server/token";
import { InstallResponseSchema } from "@/lib/tag-api";
import { ORIGIN, SECRET, testEnv } from "./fixtures";

const T0 = Date.parse("2026-10-14T16:00:00Z");
const MIDNIGHT = Date.parse("2026-10-15T07:00:00Z");

let clock: number;
let store: CounterStore;
let env: ServerEnv;

const handler = () =>
  createInstallHandler({ env: () => env, store: () => store, now: () => clock, log: () => {} });

function request(opts: { origin?: string | null; ip?: string; bearer?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": opts.ip ?? "203.0.113.7" };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  return new Request(`${ORIGIN}/api/install`, { method: "POST", headers });
}

async function call(req: Request) {
  const res = await handler()(req);
  return { status: res.status, body: await res.json(), retryAfter: res.headers.get("retry-after") };
}

beforeEach(() => {
  clock = T0;
  store = createMemoryStore(() => clock);
  env = testEnv();
});

describe("POST /api/install", () => {
  it("issues a verifiable token that lives 180 days", async () => {
    const r = await call(request());
    expect(r.status).toBe(200);
    const body = InstallResponseSchema.parse(r.body);
    expect(body.expiresAt).toBe("2027-04-12T16:00:00.000Z");
    expect(verifyToken(body.token, SECRET, new Date(clock)).ok).toBe(true);
  });

  it("403 origin for a foreign or missing Origin", async () => {
    expect(await call(request({ origin: "https://evil.example" }))).toMatchObject({ status: 403, body: { code: "origin" } });
    expect(await call(request({ origin: null }))).toMatchObject({ status: 403, body: { code: "origin" } });
  });

  it("503 not_configured without INSTALL_SECRET", async () => {
    env = testEnv({ installSecret: null });
    expect(await call(request())).toMatchObject({ status: 503, body: { code: "not_configured" } });
  });

  it("allows 3 per IP per Pacific day, then 429 with Retry-After to midnight", async () => {
    for (let i = 0; i < 3; i++) expect((await call(request())).status).toBe(200);
    const r = await call(request());
    expect(r).toMatchObject({ status: 429, body: { code: "rate_limited" } });
    expect(Number(r.retryAfter)).toBe((MIDNIGHT - clock) / 1000);
    expect((await call(request({ ip: "198.51.100.1" }))).status).toBe(200);
    clock = MIDNIGHT;
    expect((await call(request())).status).toBe(200);
  });

  it("keeps the install id when re-issuing from a valid or expired token, not a forged one", async () => {
    const iid = crypto.randomUUID();
    const old = issueToken(SECRET, new Date(clock - 200 * 24 * 3600_000), iid).token;
    const r = await call(request({ bearer: old }));
    const v = verifyToken(r.body.token, SECRET, new Date(clock));
    expect(v.ok && v.payload.iid).toBe(iid);

    const forged = issueToken("y".repeat(40), new Date(clock), iid).token;
    const r2 = await call(request({ bearer: forged }));
    const v2 = verifyToken(r2.body.token, SECRET, new Date(clock));
    expect(v2.ok && v2.payload.iid).not.toBe(iid);
  });

  it("route module exports only POST and maxDuration", async () => {
    const mod = await import("@/app/api/install/route");
    expect(Object.keys(mod).sort()).toEqual(["POST", "maxDuration"]);
  });
});
