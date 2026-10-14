import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { bearer, issueToken, TOKEN_TTL_MS, verifyToken } from "@/lib/server/token";
import { SECRET } from "./fixtures";

const T0 = new Date("2026-10-14T12:00:00Z");
const IID = "2f1e3c4d-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

describe("install token", () => {
  it("round trips and carries the install id", () => {
    const { token, expiresAt, payload } = issueToken(SECRET, T0, IID);
    expect(payload).toEqual({ iid: IID, iat: T0.getTime() / 1000 });
    expect(expiresAt.toISOString()).toBe("2027-04-12T12:00:00.000Z"); // 180 days
    const v = verifyToken(token, SECRET, T0);
    expect(v.ok && v.payload.iid).toBe(IID);
  });

  it("has the shape base64url(payload).base64url(hmac)", () => {
    const { token } = issueToken(SECRET, T0, IID);
    const [p, mac] = token.split(".");
    expect(JSON.parse(Buffer.from(p, "base64url").toString())).toEqual({ iid: IID, iat: T0.getTime() / 1000 });
    expect(Buffer.from(mac, "base64url")).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("rejects a changed payload", () => {
    const { token } = issueToken(SECRET, T0, IID);
    const [, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ iid: IID, iat: T0.getTime() / 1000 + 1 })).toString("base64url");
    expect(verifyToken(`${forged}.${mac}`, SECRET, T0)).toEqual({ ok: false, reason: "signature" });
  });

  it("rejects every single character change in the signature, including padding bits", () => {
    const { token } = issueToken(SECRET, T0, IID);
    const [p, mac] = token.split(".");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (let i = 0; i < mac.length; i++) {
      const swapped = alphabet[(alphabet.indexOf(mac[i]) + 1) % 64];
      const bad = `${p}.${mac.slice(0, i)}${swapped}${mac.slice(i + 1)}`;
      expect(verifyToken(bad, SECRET, T0).ok).toBe(false);
    }
    expect(verifyToken(`${p}.${mac}=`, SECRET, T0).ok).toBe(false);
  });

  it("rejects a token signed with another secret", () => {
    const { token } = issueToken("another-secret-that-is-long-enough-to-pass", T0, IID);
    expect(verifyToken(token, SECRET, T0)).toEqual({ ok: false, reason: "signature" });
  });

  it("expires after exactly 180 days and still names the install", () => {
    const { token } = issueToken(SECRET, T0, IID);
    expect(verifyToken(token, SECRET, new Date(T0.getTime() + TOKEN_TTL_MS - 1000)).ok).toBe(true);
    const late = verifyToken(token, SECRET, new Date(T0.getTime() + TOKEN_TTL_MS));
    expect(late.ok).toBe(false);
    expect(!late.ok && late.reason).toBe("expired");
    expect(!late.ok && late.reason === "expired" && late.payload.iid).toBe(IID);
  });

  it("rejects a token issued in the future beyond clock skew", () => {
    const { token } = issueToken(SECRET, new Date(T0.getTime() + 10 * 60_000), IID);
    expect(verifyToken(token, SECRET, T0)).toEqual({ ok: false, reason: "malformed" });
    const { token: slight } = issueToken(SECRET, new Date(T0.getTime() + 60_000), IID);
    expect(verifyToken(slight, SECRET, T0).ok).toBe(true);
  });

  it("rejects malformed input", () => {
    for (const t of ["", "abc", "a.b.c", ".x", "x.", "x".repeat(600)]) {
      expect(verifyToken(t, SECRET, T0).ok).toBe(false);
    }
  });

  it("rejects a correctly signed payload of the wrong shape", async () => {
    const { createHmac } = await import("node:crypto");
    const p = Buffer.from(JSON.stringify({ iid: "not-a-uuid", iat: 1 })).toString("base64url");
    const mac = createHmac("sha256", SECRET).update(p).digest("base64url");
    expect(verifyToken(`${p}.${mac}`, SECRET, T0)).toEqual({ ok: false, reason: "malformed" });
  });

  it("reads a bearer header", () => {
    expect(bearer("Bearer abc.def")).toBe("abc.def");
    expect(bearer("bearer  abc")).toBe("abc");
    expect(bearer("Basic abc")).toBeNull();
    expect(bearer(null)).toBeNull();
  });
});
