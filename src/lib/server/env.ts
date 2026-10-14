import "server-only";

// Typed view of the server env (17). GEMINI_API_KEY is deliberately not here: only
// lib/server/gemini.ts reads it, so the key has exactly one way into the process.

export interface ServerEnv {
  geminiModel: string;
  geminiFallbackModel: string | null; // null: no fallback, the primary's budget is all there is
  geminiRpm: number; // per model per minute
  geminiRpd: number; // per model per Pacific day
  installSecret: string | null; // null: /api/install and /api/tag answer 503 not_configured
  allowedOrigins: string[];
  redis: { url: string; token: string } | null; // null: in-memory counters (best effort)
}

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_FALLBACK_MODEL = "gemini-3.1-flash-lite";
// Under the AI Studio free tier (15 RPM, 50 RPD per model, VERIFICATIONS 7c) with a margin.
export const DEFAULT_RPM = 10;
export const DEFAULT_RPD = 45;
// 32 random bytes in base64url is 43 characters. Anything much shorter is a typo or a
// placeholder, and a guessable secret would let anyone mint tokens.
export const MIN_SECRET_LENGTH = 32;

type Source = Record<string, string | undefined>;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function text(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  return t ? t : undefined;
}

export function readServerEnv(source: Source = process.env): ServerEnv {
  const fallbackRaw = text(source.GEMINI_FALLBACK_MODEL);
  const secret = text(source.INSTALL_SECRET);
  // The Vercel Upstash integration names them KV_*; a manual setup uses UPSTASH_*.
  const url = text(source.KV_REST_API_URL) ?? text(source.UPSTASH_REDIS_REST_URL);
  const token = text(source.KV_REST_API_TOKEN) ?? text(source.UPSTASH_REDIS_REST_TOKEN);
  return {
    geminiModel: text(source.GEMINI_MODEL) ?? DEFAULT_MODEL,
    geminiFallbackModel:
      fallbackRaw === "none" ? null : (fallbackRaw ?? DEFAULT_FALLBACK_MODEL),
    geminiRpm: positiveInt(source.GEMINI_RPM, DEFAULT_RPM),
    geminiRpd: positiveInt(source.GEMINI_RPD, DEFAULT_RPD),
    installSecret: secret && secret.length >= MIN_SECRET_LENGTH ? secret : null,
    allowedOrigins: (source.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean),
    redis: url && token ? { url: url.replace(/\/+$/, ""), token } : null,
  };
}

/** Models in the order they are tried. The fallback is skipped when it equals the primary. */
export function modelOrder(env: ServerEnv): string[] {
  const out = [env.geminiModel];
  if (env.geminiFallbackModel && env.geminiFallbackModel !== env.geminiModel) out.push(env.geminiFallbackModel);
  return out;
}
