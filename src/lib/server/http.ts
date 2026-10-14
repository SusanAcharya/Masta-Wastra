import "server-only";
import type { TagErrorCode } from "@/lib/tag-api";

// Small pieces shared by /api/tag and /api/install.

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function fail(status: number, code: TagErrorCode, retryAfter?: number): Response {
  return json({ code }, status, retryAfter ? { "Retry-After": String(retryAfter) } : {});
}

/**
 * Origin check (7.3). Allowed: an exact entry of ALLOWED_ORIGINS, or the host the request
 * itself was sent to. The second rule lets Vercel preview URLs and localhost work without
 * listing every preview hostname; a browser cannot forge Origin, and anything that can is
 * not a browser and gets stopped by the token and the limits instead. No Origin header
 * (a POST from a browser always has one) is rejected.
 */
export function originAllowed(request: Request, allowed: string[]): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  if (allowed.includes(origin.replace(/\/+$/, ""))) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? safeHost(request.url);
  return !!host && host.split(",")[0].trim() === originHost;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** First hop of x-forwarded-for (Vercel sets it to the client address). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Reads at most `limit` bytes; null when the body is larger, so a huge upload is cut off early. */
export async function readCapped(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export type Log = (event: string, fields?: Record<string, string | number | boolean>) => void;

// Counts and codes only (7.3). Never pass images, tags or tokens in here.
export const defaultLog: Log = (event, fields = {}) => {
  console.info(JSON.stringify({ event, ...fields }));
};
