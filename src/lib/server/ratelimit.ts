import "server-only";
import { BUDGET_RESUME_DELAY_MS, nextPacificMidnight, pacificDateKey } from "@/lib/tag-api";
import type { ServerEnv } from "./env";

// Fixed-window counters for 7.3. Upstash Redis over its REST API when configured (plain
// fetch, no SDK), otherwise an in-memory map that only sees one function instance, so it
// is best effort. Google's own project quota is the final backstop either way.
//
// A request increments every window it is checked against in one round trip, so a
// rejected request still counts. That keeps Redis use to one or two HTTP calls per tag.

export const LIMITS = {
  installPer10Min: 20,
  installPerDay: 30, // DECISIONS: lowered from 120 so one person cannot drain the shared budget
  ipPerDay: 40,
  tokensPerIpPerDay: 3,
} as const;

const TEN_MIN = 10 * 60_000;
const MINUTE = 60_000;
const DAY_SLACK = 3600_000; // keep day keys an hour past midnight, then let Redis drop them
export const PREFIX = "mw:";

export interface Window {
  key: string;
  ttlMs: number;
}

export interface CounterStore {
  /** Increments each key, giving it the TTL only when the key is new. Returns the new counts. */
  hit(windows: Window[]): Promise<number[]>;
  decr(key: string): Promise<void>;
  put(key: string, value: number, ttlMs: number): Promise<void>;
}

/* Stores */

export function createMemoryStore(now: () => number = Date.now): CounterStore {
  const map = new Map<string, { n: number; exp: number }>();
  const live = (key: string) => {
    const e = map.get(key);
    if (e && e.exp <= now()) {
      map.delete(key);
      return undefined;
    }
    return e;
  };
  const prune = () => {
    if (map.size < 5000) return;
    const t = now();
    for (const [k, e] of map) if (e.exp <= t) map.delete(k);
  };
  return {
    async hit(windows) {
      prune();
      return windows.map(({ key, ttlMs }) => {
        const e = live(key) ?? { n: 0, exp: now() + ttlMs };
        e.n += 1;
        map.set(key, e);
        return e.n;
      });
    },
    async decr(key) {
      const e = live(key);
      if (e) e.n -= 1;
    },
    async put(key, value, ttlMs) {
      map.set(key, { n: value, exp: now() + ttlMs });
    },
  };
}

type Fetch = typeof fetch;

export function createUpstashStore(opts: { url: string; token: string; fetchImpl?: Fetch; timeoutMs?: number }): CounterStore {
  const doFetch = opts.fetchImpl ?? fetch;
  async function pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const res = await doFetch(`${opts.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 2500),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const rows = (await res.json()) as { result?: unknown; error?: string }[];
    if (!Array.isArray(rows) || rows.length !== commands.length) throw new Error("upstash shape");
    return rows.map((r) => {
      if (r.error) throw new Error("upstash command");
      return r.result;
    });
  }
  return {
    async hit(windows) {
      // SET NX PX then INCR: the TTL is set once, when the window opens, and INCR keeps it.
      // Works on every Redis version, unlike EXPIRE ... NX.
      const cmds = windows.flatMap(({ key, ttlMs }) => [
        ["SET", key, 0, "PX", ttlMs, "NX"],
        ["INCR", key],
      ]);
      const out = await pipeline(cmds);
      return windows.map((_, i) => Number(out[i * 2 + 1]));
    },
    async decr(key) {
      await pipeline([["DECR", key]]);
    },
    async put(key, value, ttlMs) {
      await pipeline([["SET", key, value, "PX", ttlMs]]);
    },
  };
}

// Redis being down must not take tagging down with it (VERIFICATIONS 12: fail open to the
// weaker per-instance counters, Google's quota still holds).
export function withFallback(primary: CounterStore, fallback: CounterStore, onError: () => void): CounterStore {
  const guard =
    <A extends unknown[], R>(f: (s: CounterStore) => (...a: A) => Promise<R>) =>
    async (...a: A): Promise<R> => {
      try {
        return await f(primary)(...a);
      } catch {
        onError();
        return f(fallback)(...a);
      }
    };
  return {
    hit: guard((s) => s.hit.bind(s)),
    decr: guard((s) => s.decr.bind(s)),
    put: guard((s) => s.put.bind(s)),
  };
}

let memory: CounterStore | undefined;

export function defaultStore(env: ServerEnv, onError: () => void = () => {}): CounterStore {
  memory ??= createMemoryStore();
  if (!env.redis) return memory;
  return withFallback(createUpstashStore(env.redis), memory, onError);
}

/* Windows */

function dayWindow(scope: string, nowMs: number): Window & { resetMs: number } {
  const now = new Date(nowMs);
  const reset = nextPacificMidnight(now).getTime();
  return { key: `${PREFIX}${scope}:d:${pacificDateKey(now)}`, ttlMs: reset - nowMs + DAY_SLACK, resetMs: reset };
}

function fixedWindow(scope: string, sizeMs: number, nowMs: number): Window & { resetMs: number } {
  const index = Math.floor(nowMs / sizeMs);
  return { key: `${PREFIX}${scope}:${sizeMs}:${index}`, ttlMs: sizeMs, resetMs: (index + 1) * sizeMs };
}

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

export type LimitResult =
  | { ok: true }
  | { ok: false; code: "rate_limited" | "daily_budget" | "global_budget"; retryAfter: number };

/** Steps 3 and 4 of 7.3: per install (20 / 10 min, 30 / day), then per IP (40 / day). */
export async function checkInstallAndIp(
  store: CounterStore,
  who: { iid: string; ip: string },
  nowMs: number,
): Promise<LimitResult> {
  const short = fixedWindow(`i:${who.iid}`, TEN_MIN, nowMs);
  const day = dayWindow(`i:${who.iid}`, nowMs);
  const ip = dayWindow(`ip:${who.ip}`, nowMs);
  const [nShort, nDay, nIp] = await store.hit([short, day, ip]);
  if (nShort > LIMITS.installPer10Min) {
    return { ok: false, code: "rate_limited", retryAfter: seconds(short.resetMs - nowMs) };
  }
  // Both day limits send the client to sleep until Pacific midnight (7.4), like Google does.
  if (nDay > LIMITS.installPerDay) return { ok: false, code: "daily_budget", retryAfter: seconds(day.resetMs - nowMs) };
  if (nIp > LIMITS.ipPerDay) return { ok: false, code: "daily_budget", retryAfter: seconds(ip.resetMs - nowMs) };
  return { ok: true };
}

/** /api/install: 3 tokens per IP per Pacific day. */
export async function checkTokenIssue(store: CounterStore, ip: string, nowMs: number): Promise<LimitResult> {
  const w = dayWindow(`tok:${ip}`, nowMs);
  const [n] = await store.hit([w]);
  if (n > LIMITS.tokensPerIpPerDay) return { ok: false, code: "rate_limited", retryAfter: seconds(w.resetMs - nowMs) };
  return { ok: true };
}

export type ReserveResult =
  | { ok: true; model: string }
  | { ok: false; code: "rate_limited" | "global_budget"; retryAfter: number };

/**
 * Step 5 of 7.3: claims one request from the first model with room this minute and this
 * Pacific day. Budgets are per model because Google's are (DECISIONS: the fallback has
 * its own 50 RPD). A model that is only busy this minute gets its day count back.
 */
export async function reserveModel(
  store: CounterStore,
  env: Pick<ServerEnv, "geminiRpm" | "geminiRpd">,
  models: string[],
  nowMs: number,
): Promise<ReserveResult> {
  let minuteReset: number | null = null;
  for (const model of models) {
    const minute = fixedWindow(`g:${model}`, MINUTE, nowMs);
    const day = dayWindow(`g:${model}`, nowMs);
    const [nMinute, nDay] = await store.hit([minute, day]);
    if (nDay > env.geminiRpd) continue;
    if (nMinute > env.geminiRpm) {
      await store.decr(day.key);
      minuteReset = Math.min(minuteReset ?? Infinity, minute.resetMs);
      continue;
    }
    return { ok: true, model };
  }
  if (minuteReset !== null) return { ok: false, code: "rate_limited", retryAfter: seconds(minuteReset - nowMs) };
  return { ok: false, code: "global_budget", retryAfter: budgetRetryAfter(nowMs) };
}

/** Seconds until the next Pacific midnight + 5 min, the same moment the client resumes (7.4). */
export function budgetRetryAfter(nowMs: number): number {
  return seconds(nextPacificMidnight(new Date(nowMs)).getTime() + BUDGET_RESUME_DELAY_MS - nowMs);
}

/** Google said the model's day is spent (429 per day quota): stop sending to it until midnight. */
export async function markModelSpent(
  store: CounterStore,
  env: Pick<ServerEnv, "geminiRpd">,
  model: string,
  nowMs: number,
): Promise<void> {
  const day = dayWindow(`g:${model}`, nowMs);
  await store.put(day.key, env.geminiRpd, day.ttlMs);
}
