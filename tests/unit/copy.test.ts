import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// No em dash (U+2014) or en dash (U+2013) anywhere a user could read it.
// We scan every source file under src/ and public/ text assets: stricter than
// UI strings only, and simpler to keep honest.
const ROOT = join(__dirname, "..", "..");
const DIRS = ["src", "public"];
const EXT = /\.(ts|tsx|js|mjs|css|json|webmanifest|svg|html|md)$/;
const BANNED = /[–—]/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : EXT.test(p) ? [p] : [];
  });
}

describe("no long dashes", () => {
  it("source and public text files contain no U+2013 or U+2014", () => {
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (BANNED.test(line)) offenders.push(`${relative(ROOT, file)}:${i + 1}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
