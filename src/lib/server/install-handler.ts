import "server-only";
import type { InstallResponse } from "@/lib/tag-api";
import { readServerEnv, type ServerEnv } from "./env";
import { clientIp, defaultLog, fail, json, originAllowed, type Log } from "./http";
import { checkTokenIssue, defaultStore, type CounterStore } from "./ratelimit";
import { bearer, issueToken, verifyToken } from "./token";

// POST /api/install (7.3): hands out a signed install token, 3 per IP per Pacific day.
// No body. A previous token with a good signature, even an expired one, may be sent as
// the bearer; its install id is kept so a silent re-issue does not reset the per install
// limits.

export interface InstallHandlerDeps {
  env?: () => ServerEnv;
  store?: (env: ServerEnv, onError: () => void) => CounterStore;
  now?: () => number;
  log?: Log;
}

export function createInstallHandler(deps: InstallHandlerDeps = {}) {
  const getEnv = deps.env ?? (() => readServerEnv());
  const getStore = deps.store ?? defaultStore;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? defaultLog;

  return async function POST(request: Request): Promise<Response> {
    const done = (res: Response, code: string) => {
      log("install", { code, status: res.status });
      return res;
    };
    if (request.method !== "POST") return done(fail(405, "invalid"), "method");
    const env = getEnv();
    if (!originAllowed(request, env.allowedOrigins)) return done(fail(403, "origin"), "origin");
    if (!env.installSecret) return done(fail(503, "not_configured"), "not_configured");

    const store = getStore(env, () => log("ratelimit_store_error"));
    const limit = await checkTokenIssue(store, clientIp(request), now());
    if (!limit.ok) return done(fail(429, limit.code, limit.retryAfter), limit.code);

    const at = new Date(now());
    const previous = bearer(request.headers.get("authorization"));
    const old = previous ? verifyToken(previous, env.installSecret, at) : null;
    const keepIid = old && (old.ok || old.reason === "expired") ? old.payload.iid : undefined;

    const issued = issueToken(env.installSecret, at, keepIid);
    const body: InstallResponse = { token: issued.token, expiresAt: issued.expiresAt.toISOString() };
    return done(json(body), keepIid ? "reissued" : "issued");
  };
}
