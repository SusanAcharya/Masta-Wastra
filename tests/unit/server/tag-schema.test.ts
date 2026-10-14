import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MediaResolution, ThinkingLevel } from "@google/genai";
import { classifyError, PROMPT_TEXT, SYSTEM_INSTRUCTION, tagWithGemini, type GeminiClient } from "@/lib/server/gemini";
import { sniffImage } from "@/lib/server/image-sniff";
import { geminiJsonSchema, GeminiTagSchema, mergeColors, toItemTags } from "@/lib/server/tag-schema";
import { occasionsFromVibes, TagsSchema, VIBE_OCCASIONS } from "@/lib/tag-api";
import { VIBES } from "@/engine/types";
import { goodGeminiTag, jpeg, measuredColors, png, webpVp8, webpVp8l, webpVp8x } from "./fixtures";

describe("image sniff", () => {
  it("reads WebP VP8, VP8L and VP8X dimensions", () => {
    expect(sniffImage(webpVp8(512, 384))).toEqual({ mime: "image/webp", width: 512, height: 384 });
    expect(sniffImage(webpVp8l(300, 512))).toEqual({ mime: "image/webp", width: 300, height: 512 });
    expect(sniffImage(webpVp8x(640, 1))).toEqual({ mime: "image/webp", width: 640, height: 1 });
    expect(sniffImage(webpVp8x(4000, 3000))).toEqual({ mime: "image/webp", width: 4000, height: 3000 });
  });

  it("reads JPEG baseline and progressive frames, skipping DHT", () => {
    expect(sniffImage(jpeg(512, 400))).toEqual({ mime: "image/jpeg", width: 512, height: 400 });
    expect(sniffImage(jpeg(200, 640, 0xc2))).toEqual({ mime: "image/jpeg", width: 200, height: 640 });
  });

  it("rejects other formats and truncated headers", () => {
    expect(sniffImage(png())).toBeNull();
    expect(sniffImage(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull();
    expect(sniffImage(webpVp8x(10, 10).slice(0, 20))).toBeNull();
    expect(sniffImage(jpeg(10, 10).slice(0, 12))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("RIFF....WEBPABCD"))).toBeNull();
  });
});

describe("Gemini schema and mapping", () => {
  it("parses a good answer and rejects words outside the vocabularies", () => {
    expect(GeminiTagSchema.safeParse(goodGeminiTag).success).toBe(true);
    for (const bad of [
      { subtype: "toga" },
      { colorNames: ["chartreuse"] },
      { colorNames: [] },
      { warmth: 6 },
      { layer: 1.5 },
      { vibes: ["goth"] },
      { confidence: 2 },
    ]) {
      expect(GeminiTagSchema.safeParse({ ...goodGeminiTag, ...bad }).success).toBe(false);
    }
  });

  it("sends a plain JSON schema with the closed lists", () => {
    const s = geminiJsonSchema() as { $schema?: string; properties: Record<string, { enum?: string[]; items?: { enum?: string[] } }> };
    expect(s.$schema).toBeUndefined();
    expect(s.properties.subtype.enum).toContain("kurta");
    expect(s.properties.colorNames.items?.enum).toHaveLength(24);
    expect(s.properties.layer).toEqual({ type: "integer", minimum: 0, maximum: 2 });
  });

  it("keeps the client hex, matches names by colour, not by order", () => {
    const colors = mergeColors(measuredColors, ["white", "navy"]);
    expect(colors).toEqual([
      { hex: "#1f2a44", name: "navy", share: 0.8 },
      { hex: "#f4f3ef", name: "white", share: 0.2 },
    ]);
  });

  it("falls back to the nearest anchor name when Gemini's name is another colour", () => {
    const colors = mergeColors([{ hex: "#b8312f", share: 1 }], ["green"]);
    expect(colors).toEqual([{ hex: "#b8312f", name: "red", share: 1 }]);
  });

  it("accepts a neighbouring name Gemini chose", () => {
    // A measured mid blue that Gemini calls denim stays denim.
    expect(mergeColors([{ hex: "#466a94", share: 1 }], ["denim"])[0].name).toBe("denim");
  });

  it("maps to Item fields and derives occasions from vibes", () => {
    const tags = toItemTags(GeminiTagSchema.parse(goodGeminiTag), measuredColors);
    expect(TagsSchema.parse(tags)).toEqual(tags);
    expect(tags.name).toBe("Navy oxford shirt");
    expect(tags.occasions).toEqual(["work", "casual", "date", "travel", "home"]);
  });

  it("trusts the subtype's category over a contradicting one", () => {
    const tags = toItemTags(
      GeminiTagSchema.parse({ ...goodGeminiTag, category: "top", subtype: "jacket", layer: 0 }),
      measuredColors,
    );
    expect(tags.category).toBe("outer");
    expect(tags.layer).toBe(2);
  });

  it("has an occasion row for every vibe", () => {
    for (const v of VIBES) expect(VIBE_OCCASIONS[v].length).toBeGreaterThan(0);
    expect(occasionsFromVibes(["sporty"])).toEqual(["casual", "workout"]);
    expect(occasionsFromVibes(["lounge"])).toEqual(["home"]);
    expect(occasionsFromVibes(["traditional"])).toEqual(["formal", "festival"]);
  });
});

describe("Gemini call", () => {
  it("uses the verified 2.29.1 call shape", async () => {
    const generateContent = vi.fn(async () => ({ text: JSON.stringify(goodGeminiTag) }));
    const out = await tagWithGemini({ generateContent } as GeminiClient, "gemini-3.5-flash-lite", {
      base64: "QUJD",
      mime: "image/webp",
    });
    expect(out.ok).toBe(true);
    const [params] = generateContent.mock.calls[0] as unknown as [
      { model: string; contents: unknown[]; config: Record<string, unknown> },
    ];
    expect(params.model).toBe("gemini-3.5-flash-lite");
    expect(params.contents).toEqual([{ inlineData: { mimeType: "image/webp", data: "QUJD" } }, { text: PROMPT_TEXT }]);
    expect(params.config).toMatchObject({
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 300,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
    });
    expect(params.config.responseJsonSchema).toEqual(geminiJsonSchema());
    expect(params.config).not.toHaveProperty("responseSchema");
    expect(params.config).not.toHaveProperty("responseFormat");
    expect(params.config.thinkingConfig).not.toHaveProperty("thinkingBudget");
  });

  it("reports invalid output and errors without throwing", async () => {
    const call = (impl: () => Promise<{ text?: string }>) =>
      tagWithGemini({ generateContent: impl } as GeminiClient, "m", { base64: "QUJD", mime: "image/webp" });
    expect(await call(async () => ({ text: "not json" }))).toEqual({ ok: false, kind: "invalid_output" });
    expect(await call(async () => ({ text: undefined }))).toEqual({ ok: false, kind: "invalid_output" });
    expect(await call(async () => ({ text: JSON.stringify({ ...goodGeminiTag, subtype: "toga" }) }))).toEqual({
      ok: false,
      kind: "invalid_output",
    });
    expect(await call(async () => Promise.reject(Object.assign(new Error("boom"), { status: 500 })))).toEqual({
      ok: false,
      kind: "upstream",
    });
  });

  it("tells a spent day from a busy minute", () => {
    const day = Object.assign(
      new Error('{"error":{"code":429,"details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}'),
      { status: 429 },
    );
    const minute = Object.assign(new Error('{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}'), {
      status: 429,
    });
    expect(classifyError(day)).toBe("quota_day");
    expect(classifyError(minute)).toBe("quota_minute");
    expect(classifyError(new Error("network"))).toBe("upstream");
  });
});
