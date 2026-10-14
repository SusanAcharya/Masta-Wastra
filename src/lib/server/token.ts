import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { TOKEN_TTL_DAYS } from "@/lib/tag-api";

// Install tokens (7.3): base64url(JSON {iid, iat}) + "." + base64url(HMAC_SHA256).
// No account and no personal data, just a random install id the limits can count.
// The HMAC covers the encoded payload string, so verification never depends on how
// JSON was serialised.

export interface InstallTokenPayload {
  iid: string; // random uuid per install
  iat: number; // issued at, unix seconds
}

export const TOKEN_TTL_MS = TOKEN_TTL_DAYS * 24 * 3600_000;
// A token "issued" in the future means a forged clock or a bug; allow a little skew only.
const MAX_SKEW_MS = 5 * 60_000;
const MAX_TOKEN_LENGTH = 512;

export type VerifyResult =
  | { ok: true; payload: InstallTokenPayload; expiresAt: Date }
  | { ok: false; reason: "expired"; payload: InstallTokenPayload }
  | { ok: false; reason: "malformed" | "signature" };

function sign(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

export function issueToken(
  secret: string,
  now: Date,
  iid: string = randomUUID(),
): { token: string; expiresAt: Date; payload: InstallTokenPayload } {
  const payload: InstallTokenPayload = { iid, iat: Math.floor(now.getTime() / 1000) };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${sign(encoded, secret).toString("base64url")}`;
  return { token, payload, expiresAt: new Date(payload.iat * 1000 + TOKEN_TTL_MS) };
}

export function verifyToken(token: string, secret: string, now: Date): VerifyResult {
  if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [encoded, mac] = parts;

  // Compare the base64url text, not decoded bytes: Node's decoder ignores stray characters
  // and padding bits, so two different strings could decode to the same MAC.
  const expected = Buffer.from(sign(encoded, secret).toString("base64url"));
  const given = Buffer.from(mac);
  // timingSafeEqual throws on unequal lengths; the length of a SHA-256 MAC is public anyway.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "signature" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!isPayload(payload)) return { ok: false, reason: "malformed" };

  const issued = payload.iat * 1000;
  const expiresAt = new Date(issued + TOKEN_TTL_MS);
  if (issued - MAX_SKEW_MS > now.getTime()) return { ok: false, reason: "malformed" };
  // The payload still comes back, so a re-issue can keep the same install id.
  if (now.getTime() >= expiresAt.getTime()) return { ok: false, reason: "expired", payload };
  return { ok: true, payload, expiresAt };
}

function isPayload(v: unknown): v is InstallTokenPayload {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.iid === "string" &&
    /^[0-9a-f-]{36}$/i.test(p.iid) &&
    typeof p.iat === "number" &&
    Number.isInteger(p.iat) &&
    p.iat > 0
  );
}

/** The bearer token from an Authorization header, or null. */
export function bearer(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}
