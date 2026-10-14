// Client tag queue (7.1, 7.4). Pure logic over Dexie with every side effect injected, so
// it runs in Node tests. The app wires the triggers (app open, `online`, new item,
// visibility visible) and calls runQueue; nothing here sets a timer while the page is
// hidden, and nothing depends on Background Sync (iOS lacks it).
import { dueTagJobs, getItem, getSettings, updateItem, updateSettings, updateTagJob } from "@/db/repo";
import type { MastaDB, TagJob } from "@/db/schema";
import type { Item } from "@/engine/types";
import {
  BUDGET_RESUME_DELAY_MS,
  INSTALL_ENDPOINT,
  InstallResponseSchema,
  TAG_ENDPOINT,
  TOKEN_TTL_DAYS,
  TagErrorSchema,
  TagResponseSchema,
  needsCheck,
  nextPacificMidnight,
  type MeasuredColor,
  type TagErrorCode,
  type TagResponse,
} from "@/lib/tag-api";

export { nextPacificMidnight };

export const CLIENT_RPM = 6;
export const MAX_ATTEMPTS = 6;
export const BACKOFF_BASE_MS = 5000;
export const BACKOFF_MAX_MS = 15 * 60_000;
export const JITTER = 0.2;
// A claimed job carries a lease in nextAt, so a tab that dies mid request frees it again.
const LEASE_MS = 2 * 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_RETRY_MS = 1000;
const MAX_RETRY_AFTER_MS = 24 * 3600_000;

export interface PreparedImage {
  image: string; // base64 WebP, cutout on mid grey, 512 px long edge (7.1)
  colors: MeasuredColor[];
}

export interface TagQueueDeps {
  db: MastaDB;
  fetchImpl: typeof fetch;
  now: () => Date;
  prepareImage: (itemId: string) => Promise<PreparedImage>;
  /**
   * The install token. With `refresh`, the old one was refused (401): get a new one. The
   * queue also clears Settings.installToken first, so a provider that ignores the
   * argument and reads Settings still re-issues. `rejected` lets it keep the install id.
   */
  getToken: (opts?: { refresh?: boolean; rejected?: string }) => Promise<string>;
  isOnline?: () => boolean;
  isVisible?: () => boolean;
  // Only used to wait for a free clientRpm slot, and only while visible.
  sleep?: (ms: number) => Promise<void>;
  random?: () => number; // jitter source, 0..1
  endpoint?: string;
  /** The queue just paused until `until` (budget spent, or the server is not set up). Show the snackbar. */
  onBudgetPaused?: (until: Date, code: TagErrorCode) => void;
  onEvent?: (event: TagQueueEvent) => void;
}

export type TagQueueEvent =
  | { type: "tagged"; itemId: string; check: boolean }
  | { type: "kept"; itemId: string } // the user tagged first, AI result not applied
  | { type: "retry"; itemId: string; at: string; reason: string }
  | { type: "dead"; itemId: string; reason: string };

export type StopReason =
  | "idle" // no due jobs left
  | "no_consent"
  | "offline"
  | "paused" // budget pause, see pausedUntil
  | "rate_limited" // server asked us to wait, see nextDueAt
  | "hidden" // a clientRpm wait would need a timer while hidden
  | "token_unavailable"
  | "network_error"
  | "busy"; // another tab holds the queue lock

export interface RunSummary {
  sent: number; // requests that left the device
  tagged: number;
  kept: number;
  retried: number;
  dead: number;
  stopped: StopReason;
  nextDueAt?: string; // earliest waiting job, for a visible-only timer if the app wants one
  pausedUntil?: string;
}

/* Timing */

/** min(2^attempts x 5 s, 15 min) with +-20% jitter. `attempts` counts failures so far, this one included. */
export function backoffDelay(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(2 ** attempts * BACKOFF_BASE_MS, BACKOFF_MAX_MS);
  return Math.round(base * (1 + (random() * 2 - 1) * JITTER));
}

/** Retry-After in ms: delta seconds or an HTTP date. Null when absent or unreadable. */
export function parseRetryAfter(header: string | null, now: Date): number | null {
  if (!header) return null;
  const v = header.trim();
  const ms = /^\d+$/.test(v) ? Number(v) * 1000 : Date.parse(v) - now.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS);
}

/** When the queue wakes after a budget pause: next Pacific midnight + 5 min. */
export function budgetResumeAt(now: Date): Date {
  return new Date(nextPacificMidnight(now).getTime() + BUDGET_RESUME_DELAY_MS);
}

/* Per tab state */

// Send times for clientRpm, and a hold after a 429 or 503 so the next job does not hit
// the same wall. Kept per database so tests with fresh databases never share them.
const sentLog = new WeakMap<MastaDB, number[]>();
const holdUntil = new WeakMap<MastaDB, number>();
const inflight = new WeakMap<MastaDB, Promise<RunSummary>>();

/**
 * Processes due jobs one request at a time until none are due, the queue pauses, or the
 * device goes offline. Calling it while a run is in progress joins that run.
 */
export function runQueue(deps: TagQueueDeps): Promise<RunSummary> {
  const running = inflight.get(deps.db);
  if (running) return running;
  const run = withTabLock(() => drain(deps))
    .then((r) => r ?? { ...emptySummary(), stopped: "busy" as const })
    .finally(() => inflight.delete(deps.db));
  inflight.set(deps.db, run);
  return run;
}

// Two open tabs must not tag the same item twice. The job claim below already prevents
// that; the Web Lock just keeps a second tab from starting a parallel run at all.
async function withTabLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (!locks?.request) return fn();
  return locks.request("mw-tag-queue", { ifAvailable: true }, (lock) => (lock ? fn() : null));
}

const emptySummary = (): RunSummary => ({ sent: 0, tagged: 0, kept: 0, retried: 0, dead: 0, stopped: "idle" });

type Step = "next" | StopReason;

async function drain(deps: TagQueueDeps): Promise<RunSummary> {
  const { db } = deps;
  const online = deps.isOnline ?? (() => globalThis.navigator?.onLine ?? true);
  const summary = emptySummary();
  const finish = async (stopped: StopReason, pausedUntil?: string): Promise<RunSummary> => {
    summary.stopped = stopped;
    if (pausedUntil) summary.pausedUntil = pausedUntil;
    const next = await db.tagJobs.where("state").equals("waiting").sortBy("nextAt");
    if (next[0]) summary.nextDueAt = next[0].nextAt;
    return summary;
  };

  await recoverStaleClaims(db, deps.now());
  for (;;) {
    // Re-read every round: consent can be withdrawn and the device can drop off mid run.
    const settings = await getSettings(db);
    if (settings.aiConsent !== true) return finish("no_consent");
    const now = deps.now();
    if (settings.tagPausedUntil) {
      if (now.toISOString() < settings.tagPausedUntil) return finish("paused", settings.tagPausedUntil);
      await updateSettings(db, { tagPausedUntil: undefined });
    }
    if (!online()) return finish("offline");
    if ((holdUntil.get(db) ?? 0) > now.getTime()) return finish("rate_limited");

    const [job] = await dueTagJobs(db, now.toISOString());
    if (!job) return finish("idle");
    if (!(await claim(db, job, now))) continue;

    const step = await processJob(deps, job, summary);
    if (step !== "next") {
      const s = await getSettings(db);
      return finish(step, step === "paused" ? s.tagPausedUntil : undefined);
    }
  }
}

async function recoverStaleClaims(db: MastaDB, now: Date) {
  const at = now.toISOString();
  await db.tagJobs
    .where("state")
    .equals("running")
    .filter((j) => j.nextAt <= at)
    .modify({ state: "waiting", nextAt: at });
}

// Atomic across tabs: IndexedDB serialises readwrite transactions on the same store.
function claim(db: MastaDB, job: TagJob, now: Date): Promise<boolean> {
  return db.transaction("rw", db.tagJobs, async () => {
    const cur = await db.tagJobs.get(job.id);
    if (!cur || cur.state !== "waiting" || cur.nextAt > now.toISOString()) return false;
    await db.tagJobs.update(job.id, { state: "running", nextAt: new Date(now.getTime() + LEASE_MS).toISOString() });
    return true;
  });
}

async function processJob(deps: TagQueueDeps, job: TagJob, summary: RunSummary): Promise<Step> {
  const { db } = deps;
  const random = deps.random ?? Math.random;
  const online = deps.isOnline ?? (() => globalThis.navigator?.onLine ?? true);
  const release = (nextAt = deps.now().toISOString()) => updateTagJob(db, job.id, { state: "waiting", nextAt });

  const item = await getItem(db, job.itemId);
  if (!item) {
    await updateTagJob(db, job.id, { state: "dead", lastError: "missing_item" });
    return "next";
  }
  // Gemini is called once per item, ever (18). An item the user already tagged, or one
  // already tagged by AI, closes its job without a request.
  if (item.tagSource !== "ai" || item.tagStatus === "done") {
    await keepUserTags(db, item, job);
    summary.kept += 1;
    deps.onEvent?.({ type: "kept", itemId: item.id });
    return "next";
  }

  const retry = async (reason: string, delayMs?: number | null, opts: { hold?: boolean } = {}) => {
    const attempts = job.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) return kill(reason, attempts);
    const now = deps.now().getTime();
    const delay = Math.max(delayMs ?? backoffDelay(attempts, random), MIN_RETRY_MS);
    const at = new Date(now + delay).toISOString();
    if (opts.hold) holdUntil.set(db, now + delay);
    await updateTagJob(db, job.id, { state: "waiting", attempts, nextAt: at, lastError: reason });
    summary.retried += 1;
    deps.onEvent?.({ type: "retry", itemId: item.id, at, reason });
  };
  const kill = async (reason: string, attempts = job.attempts + 1) => {
    await db.transaction("rw", db.items, db.tagJobs, async () => {
      await updateTagJob(db, job.id, { state: "dead", attempts, lastError: reason });
      const cur = await getItem(db, item.id);
      // Manual tags are always the fallback (7.4); "failed" prompts them in the UI.
      if (cur && cur.tagSource === "ai" && cur.tagStatus !== "done") await updateItem(db, item.id, { tagStatus: "failed" });
    });
    summary.dead += 1;
    deps.onEvent?.({ type: "dead", itemId: item.id, reason });
  };
  const pause = async (code: TagErrorCode) => {
    const until = budgetResumeAt(deps.now()).toISOString();
    const before = (await getSettings(db)).tagPausedUntil;
    await updateSettings(db, { tagPausedUntil: until });
    // Not the item's fault, so no attempt is spent; it simply waits with the queue.
    await release(until);
    if (!before || before < until) deps.onBudgetPaused?.(new Date(until), code);
    return "paused" as const;
  };

  let prepared: PreparedImage;
  try {
    prepared = await deps.prepareImage(item.id);
  } catch {
    await retry("prepare");
    return "next";
  }

  let token: string;
  try {
    token = await deps.getToken();
  } catch {
    await release();
    return "token_unavailable";
  }

  const body = JSON.stringify({ itemId: item.id, image: prepared.image, colors: prepared.colors });
  let res: Response;
  let refreshed = false;
  for (;;) {
    if (!(await waitForSlot(deps))) {
      await release();
      return "hidden";
    }
    if (!online()) {
      await release();
      return "offline";
    }
    try {
      recordSend(deps);
      summary.sent += 1;
      res = await deps.fetchImpl(deps.endpoint ?? TAG_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      if (!online()) {
        await release();
        return "offline";
      }
      await retry("network");
      return "network_error";
    }
    if (res.status !== 401 || refreshed) break;
    // Expired or rotated secret: one silent re-issue, then the same request again.
    refreshed = true;
    try {
      await updateSettings(db, { installToken: undefined });
      token = await deps.getToken({ refresh: true, rejected: token });
    } catch {
      await release();
      return "token_unavailable";
    }
  }

  if (res.ok) {
    const parsed = TagResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) {
      await retry("bad_response");
      return "next";
    }
    await applyTags(deps, item, job, parsed.data, summary);
    return "next";
  }

  const code = TagErrorSchema.safeParse(await res.json().catch(() => null)).data?.code;
  const retryAfter = parseRetryAfter(res.headers.get("retry-after"), deps.now());
  if (code === "daily_budget" || code === "global_budget") return pause(code);
  // A server without its key, or one refusing our origin, will not fix itself in a minute.
  // Rest like a spent budget instead of burning the item's attempts.
  if (code === "not_configured" || res.status === 403) return pause(code ?? "origin");
  if (res.status === 429 || res.status === 503) {
    await retry(code ?? `http_${res.status}`, retryAfter, { hold: true });
    return "rate_limited";
  }
  if (res.status === 401) {
    await retry("token");
    return "token_unavailable";
  }
  if (res.status >= 400 && res.status < 500) {
    await kill(code ?? `http_${res.status}`);
    return "next";
  }
  await retry(code ?? `http_${res.status}`, retryAfter);
  return "next";
}

async function applyTags(deps: TagQueueDeps, item: Item, job: TagJob, response: TagResponse, summary: RunSummary) {
  const { db } = deps;
  const { isClothing: _c, confidence: _f, ...fields } = response.tags;
  const check = needsCheck(response.tags);
  let applied = false;
  await db.transaction("rw", db.items, db.tagJobs, async () => {
    const cur = await getItem(db, item.id);
    // The user may have edited while the request was out. Their tags win, always.
    if (cur && cur.tagSource === "ai" && cur.tagStatus !== "done") {
      await updateItem(db, item.id, {
        ...fields,
        tagSource: "ai",
        tagStatus: "done",
        tagCheck: check,
        aiRaw: response,
      });
      applied = true;
    } else if (cur) {
      await settleStatus(db, cur);
    }
    await updateTagJob(db, job.id, { state: "done", attempts: job.attempts + 1, lastError: undefined });
  });
  if (applied) {
    summary.tagged += 1;
    deps.onEvent?.({ type: "tagged", itemId: item.id, check });
  } else {
    summary.kept += 1;
    deps.onEvent?.({ type: "kept", itemId: item.id });
  }
}

async function keepUserTags(db: MastaDB, item: Item, job: TagJob) {
  await db.transaction("rw", db.items, db.tagJobs, async () => {
    await settleStatus(db, item);
    await updateTagJob(db, job.id, { state: "done" });
  });
}

// Only the status moves, so the shimmer stops; no tag field is touched.
async function settleStatus(db: MastaDB, item: Item) {
  if (item.tagStatus !== "queued" && item.tagStatus !== "pending") return;
  await updateItem(db, item.id, { tagStatus: item.tagSource === "manual" ? "manual" : "done" });
}

/* clientRpm */

function recordSend(deps: TagQueueDeps) {
  const log = sentLog.get(deps.db) ?? [];
  log.push(deps.now().getTime());
  sentLog.set(deps.db, log);
}

// True once a slot within CLIENT_RPM per minute is free. Waits only while the page is
// visible; a hidden page stops instead, and the next trigger picks the queue up.
async function waitForSlot(deps: TagQueueDeps): Promise<boolean> {
  const visible = deps.isVisible ?? (() => typeof document === "undefined" || document.visibilityState === "visible");
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (;;) {
    const now = deps.now().getTime();
    const log = (sentLog.get(deps.db) ?? []).filter((t) => t > now - 60_000);
    sentLog.set(deps.db, log);
    if (log.length < CLIENT_RPM) return true;
    if (!visible()) return false;
    await sleep(log[0] + 60_000 - now);
  }
}

/* Install token */

// Re-issue a week before expiry, so a phone that opens the app rarely never sends a dead token.
const RENEW_BEFORE_MS = 7 * 24 * 3600_000;

/** iat + 180 days from the token payload, or null if it cannot be read. */
export function tokenExpiry(token: string): Date | null {
  try {
    const b64 = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const p = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))) as { iat?: unknown };
    return typeof p.iat === "number" ? new Date(p.iat * 1000 + TOKEN_TTL_DAYS * 24 * 3600_000) : null;
  } catch {
    return null;
  }
}

export class TokenError extends Error {
  constructor(
    readonly status: number,
    readonly code?: TagErrorCode,
  ) {
    super(`install token ${status}${code ? ` ${code}` : ""}`);
  }
}

/**
 * A ready getToken for TagQueueDeps: the stored token while it is fresh, otherwise a new
 * one from /api/install, saved to Settings. The old token goes along as the bearer so the
 * server keeps the same install id.
 */
export function createTokenProvider(opts: {
  db: MastaDB;
  fetchImpl: typeof fetch;
  now: () => Date;
  endpoint?: string;
}): TagQueueDeps["getToken"] {
  return async (o = {}) => {
    const current = (await getSettings(opts.db)).installToken;
    if (current && !o.refresh) {
      const exp = tokenExpiry(current);
      if (exp && exp.getTime() - RENEW_BEFORE_MS > opts.now().getTime()) return current;
    }
    const previous = o.rejected ?? current;
    const res = await opts.fetchImpl(opts.endpoint ?? INSTALL_ENDPOINT, {
      method: "POST",
      headers: previous ? { Authorization: `Bearer ${previous}` } : {},
    });
    if (!res.ok) {
      throw new TokenError(res.status, TagErrorSchema.safeParse(await res.json().catch(() => null)).data?.code);
    }
    const body = InstallResponseSchema.parse(await res.json());
    await updateSettings(opts.db, { installToken: body.token });
    return body.token;
  };
}
