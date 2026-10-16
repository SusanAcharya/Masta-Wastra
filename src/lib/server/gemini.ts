import "server-only";
import { GoogleGenAI, MediaResolution, ThinkingLevel } from "@google/genai";
import { geminiJsonSchema, GeminiTagSchema, type GeminiTag } from "./tag-schema";

// The one place GEMINI_API_KEY is read (7.3). The bundle test fails if the name or a key
// ever shows up in .next/static.

export function geminiApiKey(): string | undefined {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? key : undefined;
}

// 7.2, verbatim.
export const SYSTEM_INSTRUCTION =
  'You tag one clothing item photographed alone on a grey background. Return only JSON matching the schema. Use the closed vocabularies exactly. Warmth is 1 (very light, like a linen tee) to 5 (heavy winter coat). If the image is not a clothing item or accessory, set "isClothing": false. Name is 2 to 4 plain words, color first, no brand names.';

// 7.2 gives only the system text. The user turn just points at the image; the schema
// carries the vocabularies.
export const PROMPT_TEXT = "Tag this item.";

// Gemini refuses a deadline under 10 s ("Minimum allowed deadline is 10s", seen 2026-10-15;
// 8 s made every call fail). Two attempts (primary, then fallback) fit in maxDuration 30.
export const CALL_TIMEOUT_MS = 10_000;

/** The slice of @google/genai we use, so tests can inject a fake instead of the network. */
export interface GeminiClient {
  generateContent(params: {
    model: string;
    contents: unknown[];
    config: Record<string, unknown>;
  }): Promise<{ text?: string | undefined }>;
}
export type GeminiClientFactory = (apiKey: string) => GeminiClient;

export const defaultGeminiFactory: GeminiClientFactory = (apiKey) => {
  const ai = new GoogleGenAI({ apiKey });
  return {
    generateContent: (params) => ai.models.generateContent(params as Parameters<typeof ai.models.generateContent>[0]),
  };
};

export type GeminiOutcome =
  | { ok: true; tag: GeminiTag }
  | { ok: false; kind: "quota_day" | "quota_minute" | "upstream" | "invalid_output" };

export async function tagWithGemini(
  client: GeminiClient,
  model: string,
  image: { base64: string; mime: string },
): Promise<GeminiOutcome> {
  let text: string | undefined;
  try {
    const res = await client.generateContent({
      model,
      contents: [{ inlineData: { mimeType: image.mime, data: image.base64 } }, { text: PROMPT_TEXT }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema: geminiJsonSchema(),
        temperature: 0.2,
        maxOutputTokens: 300,
        // Gemini 3 Flash-Lite cannot turn thinking fully off; MINIMAL is the floor (VERIFICATIONS 7d).
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        // About 280 tokens per image instead of 1120 (VERIFICATIONS 7e).
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
        httpOptions: { timeout: CALL_TIMEOUT_MS },
      },
    });
    text = res.text;
  } catch (err) {
    return { ok: false, kind: classifyError(err) };
  }
  if (!text) return { ok: false, kind: "invalid_output" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, kind: "invalid_output" };
  }
  const parsed = GeminiTagSchema.safeParse(json);
  return parsed.success ? { ok: true, tag: parsed.data } : { ok: false, kind: "invalid_output" };
}

// Google answers 429 RESOURCE_EXHAUSTED for both its per minute and per day quotas. The
// error body names the quota ("...PerDayPerProjectPerModel..."), which is the only way to
// tell a busy minute from a spent day.
export function classifyError(err: unknown): "quota_day" | "quota_minute" | "upstream" {
  const status = typeof err === "object" && err && "status" in err ? Number((err as { status: unknown }).status) : NaN;
  // Google's own overload ("This model is currently experiencing high demand", 503) and other
  // server side blips pass in a minute: treat them like a busy minute, so the fallback model is
  // tried and the client retries soon, instead of failing the piece as upstream.
  if (status === 500 || status === 502 || status === 503 || status === 504) return "quota_minute";
  if (status !== 429) return "upstream";
  const message = err instanceof Error ? err.message : String((err as { message?: unknown }).message ?? "");
  return /per ?day|PerDay|daily/i.test(message) ? "quota_day" : "quota_minute";
}
