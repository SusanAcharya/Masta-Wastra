import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The Gemini key must never reach the browser (7.3). Scans what Next ships to clients,
// .next/static, for key shaped strings and for the env name itself. Needs a build first:
// without .next/static the test is skipped and says so.
const ROOT = join(__dirname, "..", "..");
const STATIC = join(ROOT, ".next", "static");

const PATTERNS: [string, RegExp][] = [
  ["classic AI Studio key (AIza...)", /AIza[0-9A-Za-z_-]{20,}/],
  ["new AI Studio key (AQ....)", /AQ\.[0-9A-Za-z_-]{20,}/],
  ["the env name GEMINI_API_KEY", /GEMINI_API_KEY/],
];

const TEXT = /\.(js|mjs|cjs|css|html|json|map|txt|rsc|webmanifest|svg)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : TEXT.test(p) ? [p] : [];
  });
}

const hasBuild = existsSync(STATIC);
if (!hasBuild) {
  console.warn("bundle-secrets: .next/static not found, skipping. Run `next build` first to check the client bundle.");
}

describe.skipIf(!hasBuild)("client bundle has no Gemini secrets", () => {
  it("no key shaped string and no GEMINI_API_KEY in .next/static", () => {
    const offenders: string[] = [];
    for (const file of walk(STATIC)) {
      const text = readFileSync(file, "utf8");
      for (const [label, re] of PATTERNS) {
        const m = text.match(re);
        // Never print the match itself: if it is a real key, the test log must not leak it.
        if (m) offenders.push(`${relative(ROOT, file)}: ${label} at offset ${m.index}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("bundle scan patterns", () => {
  it("catch both key formats and the env name, and not ordinary code", () => {
    const hit = (s: string) => PATTERNS.some(([, re]) => re.test(s));
    expect(hit(`const k="AIza${"Sy".repeat(18)}"`)).toBe(true);
    expect(hit(`"AQ.${"Ab3_".repeat(8)}"`)).toBe(true);
    expect(hit("process.env.GEMINI_API_KEY")).toBe(true);
    expect(hit("const AIza = 1; a.AQ.b")).toBe(false);
  });
});
