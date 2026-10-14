import { describe, expect, it } from "vitest";
import { flags } from "@/lib/flags";

describe("future flags", () => {
  it("are all off in the MVP", () => {
    expect(Object.values(flags).every((v) => v === false)).toBe(true);
  });
});
