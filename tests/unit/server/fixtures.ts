// Header-only image bytes and a good Gemini answer, shared by the server tests.
import type { ServerEnv } from "@/lib/server/env";

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];

function riff(chunk: number[]): Uint8Array {
  return new Uint8Array([...ascii("RIFF"), ...le32(chunk.length + 4), ...ascii("WEBP"), ...chunk]);
}

export function webpVp8x(w: number, h: number): Uint8Array {
  return riff([...ascii("VP8X"), ...le32(10), 0x10, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);
}

export function webpVp8(w: number, h: number): Uint8Array {
  return riff([...ascii("VP8 "), ...le32(10), 0x50, 0x01, 0x00, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h)]);
}

export function webpVp8l(w: number, h: number): Uint8Array {
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  return riff([...ascii("VP8L"), ...le32(5), 0x2f, ...le32(bits)]);
}

export function jpeg(w: number, h: number, frame = 0xc0): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    // APP0 JFIF, 16 bytes
    0xff, 0xe0, ...be16(16), ...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    // a DHT marker (C4) first, to prove it is not read as a frame
    0xff, 0xc4, ...be16(4), 0, 0,
    0xff, frame, ...be16(17), 8, ...be16(h), ...be16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xd9,
  ]);
}

export const png = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii("IHDR"), 0, 0, 2, 0, 0, 0, 2, 0]);

export const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

export const SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
export const ORIGIN = "https://masta-wastra.vercel.app";
export const PRIMARY = "gemini-3.5-flash-lite";
export const FALLBACK = "gemini-3.1-flash-lite";

export function testEnv(over: Partial<ServerEnv> = {}): ServerEnv {
  return {
    geminiModel: PRIMARY,
    geminiFallbackModel: FALLBACK,
    geminiRpm: 10,
    geminiRpd: 45,
    installSecret: SECRET,
    allowedOrigins: [ORIGIN],
    redis: null,
    ...over,
  };
}

export const goodGeminiTag = {
  isClothing: true,
  name: "navy oxford shirt",
  category: "top",
  subtype: "shirt",
  layer: 0,
  colorNames: ["white", "navy"], // reversed on purpose: names are matched by colour, not order
  pattern: "solid",
  warmth: 2,
  vibes: ["smart", "casual"],
  waterproof: false,
  confidence: 0.92,
};

export const measuredColors = [
  { hex: "#1F2A44", share: 0.8 },
  { hex: "#f4f3ef", share: 0.2 },
];
