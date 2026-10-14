import "server-only";
import { MAX_BODY_BYTES, MAX_IMAGE_EDGE, TagRequestSchema, type TagResponse } from "@/lib/tag-api";
import { modelOrder, readServerEnv, type ServerEnv } from "./env";
import { defaultGeminiFactory, geminiApiKey, tagWithGemini, type GeminiClientFactory } from "./gemini";
import { clientIp, defaultLog, fail, json, originAllowed, readCapped, type Log } from "./http";
import { sniffImage } from "./image-sniff";
import {
  budgetRetryAfter,
  checkInstallAndIp,
  defaultStore,
  markModelSpent,
  reserveModel,
  type CounterStore,
} from "./ratelimit";
import { toItemTags } from "./tag-schema";
import { bearer, verifyToken } from "./token";

// POST /api/tag (7.3). Checks run cheapest first and stop at the first failure:
//   1. method, Origin, configuration, Content-Type
//   2. install token
//   1b. body size and shape (after the token, so anonymous callers cost no parsing)
//   3. per install, 4. per IP, 5. global per model budget
//   6. image bytes are WebP or JPEG, at most 640 px on the long edge
// then one Gemini call, falling back to the second model if Google says the first is spent.

export interface TagHandlerDeps {
  env?: () => ServerEnv;
  apiKey?: () => string | undefined;
  geminiFactory?: GeminiClientFactory;
  store?: (env: ServerEnv, onError: () => void) => CounterStore;
  now?: () => number;
  log?: Log;
}

export function createTagHandler(deps: TagHandlerDeps = {}) {
  const getEnv = deps.env ?? (() => readServerEnv());
  const getKey = deps.apiKey ?? geminiApiKey;
  const factory = deps.geminiFactory ?? defaultGeminiFactory;
  const getStore = deps.store ?? defaultStore;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? defaultLog;

  return async function POST(request: Request): Promise<Response> {
    const started = now();
    const done = (res: Response, code: string, extra: Record<string, string | number> = {}) => {
      log("tag", { code, status: res.status, ms: now() - started, ...extra });
      return res;
    };

    if (request.method !== "POST") return done(fail(405, "invalid"), "method");
    const env = getEnv();
    if (!originAllowed(request, env.allowedOrigins)) return done(fail(403, "origin"), "origin");
    const apiKey = getKey();
    if (!apiKey || !env.installSecret) return done(fail(503, "not_configured"), "not_configured");
    if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) {
      return done(fail(415, "invalid"), "content_type");
    }

    const token = bearer(request.headers.get("authorization"));
    const verified = token ? verifyToken(token, env.installSecret, new Date(now())) : null;
    if (!verified?.ok) return done(fail(401, "token"), verified ? `token_${verified.reason}` : "token_missing");
    const iid = verified.payload.iid;

    const raw = await readCapped(request, MAX_BODY_BYTES);
    if (raw === null) return done(fail(413, "invalid"), "too_large");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return done(fail(400, "invalid"), "bad_json");
    }
    const parsed = TagRequestSchema.safeParse(body);
    if (!parsed.success) return done(fail(400, "invalid"), "bad_body");
    const req = parsed.data;

    const store = getStore(env, () => log("ratelimit_store_error"));
    const limit = await checkInstallAndIp(store, { iid, ip: clientIp(request) }, now());
    if (!limit.ok) return done(fail(429, limit.code, limit.retryAfter), limit.code);

    const models = modelOrder(env);
    let reserved = await reserveModel(store, env, models, now());
    if (!reserved.ok) return done(fail(429, reserved.code, reserved.retryAfter), reserved.code);

    const bytes = Buffer.from(req.image, "base64");
    const image = sniffImage(bytes);
    if (!image) return done(fail(400, "invalid"), "not_image");
    if (Math.max(image.width, image.height) > MAX_IMAGE_EDGE) return done(fail(400, "invalid"), "too_big_image");

    const client = factory(apiKey);
    let minuteBusy = false;
    for (;;) {
      const model = reserved.model;
      const outcome = await tagWithGemini(client, model, { base64: req.image, mime: image.mime });
      if (outcome.ok) {
        const res: TagResponse = { tags: toItemTags(outcome.tag, req.colors), model };
        return done(json(res), "ok", { model });
      }
      if (outcome.kind === "upstream" || outcome.kind === "invalid_output") {
        return done(fail(502, "upstream"), outcome.kind, { model });
      }
      // Google's own quota is the backstop: a spent day there means a spent day here too.
      if (outcome.kind === "quota_day") await markModelSpent(store, env, model, now());
      else minuteBusy = true;
      log("tag_model_quota", { model, kind: outcome.kind });

      const rest = models.slice(models.indexOf(model) + 1);
      const next = rest.length ? await reserveModel(store, env, rest, now()) : null;
      if (next?.ok) {
        reserved = next;
        continue;
      }
      if (next && !next.ok && next.code === "rate_limited") {
        return done(fail(429, "rate_limited", next.retryAfter), "upstream_minute");
      }
      if (minuteBusy) return done(fail(429, "rate_limited", 60), "upstream_minute");
      return done(fail(429, "global_budget", budgetRetryAfter(now())), "upstream_day");
    }
  };
}
