// The /api/tag and /api/install contract (7.1, 7.3). Shared by the route handlers and the
// client queue, so it must stay free of secrets and server imports.
import { z } from "zod";

// No JIT: zod would probe `Function("")`, which our CSP blocks (no eval on pages) and Chrome
// reports as a CSP issue. The interpreter is fast enough for these small payloads.
z.config({ jitless: true });
import {
  CATEGORIES,
  COLOR_NAME_IDS,
  OCCASIONS,
  PATTERNS,
  SUBTYPE_IDS,
  VIBES,
  type ColorName,
  type Occasion,
  type Subtype,
  type Vibe,
} from "@/engine/types";

export const TAG_ENDPOINT = "/api/tag";
export const INSTALL_ENDPOINT = "/api/install";

// Route caps (7.3). The client image is about 20 to 40 KB, so 200 KB leaves room for
// base64 overhead without letting anyone post a full photo.
export const MAX_BODY_BYTES = 200 * 1024;
export const MAX_IMAGE_EDGE = 640;
export const TOKEN_TTL_DAYS = 180;
// Budgets reset at Pacific midnight; resuming 5 minutes later avoids racing the reset (7.4).
export const BUDGET_RESUME_DELAY_MS = 5 * 60_000;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const MeasuredColorSchema = z.object({
  hex,
  share: z.number().min(0).max(1),
});
export type MeasuredColor = z.infer<typeof MeasuredColorSchema>;

export const TagRequestSchema = z.object({
  itemId: z.string().min(1).max(64),
  // Plain base64, no data: prefix. Length is capped again by MAX_BODY_BYTES.
  image: z.string().min(16).max(MAX_BODY_BYTES).base64(),
  colors: z.array(MeasuredColorSchema).min(1).max(3),
});
export type TagRequest = z.infer<typeof TagRequestSchema>;

const subtypeEnum = z.enum(SUBTYPE_IDS as [Subtype, ...Subtype[]]);
const colorNameEnum = z.enum(COLOR_NAME_IDS as [ColorName, ...ColorName[]]);

// Tags in Item field shape, ready to write. Colors carry the client's hex (the truth for
// harmony math) with the name Gemini gave it, or the nearest anchor name.
export const TagsSchema = z.object({
  isClothing: z.boolean(),
  name: z.string().min(1).max(80),
  category: z.enum(CATEGORIES),
  subtype: subtypeEnum,
  layer: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  colors: z
    .array(z.object({ hex, name: colorNameEnum, share: z.number().min(0).max(1) }))
    .min(1)
    .max(3),
  pattern: z.enum(PATTERNS),
  warmth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  vibes: z.array(z.enum(VIBES)).min(1).max(3),
  occasions: z.array(z.enum(OCCASIONS)).min(1),
  waterproof: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type Tags = z.infer<typeof TagsSchema>;

export const TagResponseSchema = z.object({
  tags: TagsSchema,
  model: z.string().min(1),
});
export type TagResponse = z.infer<typeof TagResponseSchema>;

export const TAG_ERROR_CODES = [
  "rate_limited",
  "daily_budget",
  "global_budget",
  "invalid",
  "token",
  "origin",
  "upstream",
  "not_configured",
] as const;
export type TagErrorCode = (typeof TAG_ERROR_CODES)[number];

export const TagErrorSchema = z.object({ code: z.enum(TAG_ERROR_CODES) });
export type TagError = z.infer<typeof TagErrorSchema>;

export const InstallResponseSchema = z.object({
  token: z.string().min(10),
  expiresAt: z.string(),
});
export type InstallResponse = z.infer<typeof InstallResponseSchema>;

// Below 0.5, or not clothing at all, the item gets the amber "Check these" dot (7.2).
export const CHECK_CONFIDENCE = 0.5;
export function needsCheck(tags: Pick<Tags, "confidence" | "isClothing">): boolean {
  return tags.confidence < CHECK_CONFIDENCE || !tags.isClothing;
}

/* Occasions from vibes */

// Item.occasions is "derived from vibes, editable" (5). This table follows the occasion
// filter in 8.3: work takes smart and formal, workout takes sporty, home takes lounge and
// casual. Lives here, not under lib/server, so manual tagging derives the same thing.
export const VIBE_OCCASIONS: Record<Vibe, readonly Occasion[]> = {
  casual: ["casual", "travel", "home"],
  smart: ["work", "date"],
  formal: ["formal", "work"],
  sporty: ["workout", "casual"],
  lounge: ["home"],
  street: ["casual", "date"],
  traditional: ["festival", "formal"],
};

export function occasionsFromVibes(vibes: readonly Vibe[]): Occasion[] {
  const wanted = new Set(vibes.flatMap((v) => VIBE_OCCASIONS[v] ?? []));
  const out = OCCASIONS.filter((o) => wanted.has(o));
  return out.length ? out : ["casual"];
}

/* Pacific day */

// Google resets RPD at midnight Pacific (2.3), and every "per day" budget here follows the
// same clock, so the server window and the client pause always agree.
const PACIFIC = "America/Los_Angeles";
const pacificParts = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function partsOf(at: number) {
  const p: Record<string, number> = {};
  for (const { type, value } of pacificParts.formatToParts(new Date(at))) {
    if (type !== "literal") p[type] = Number(value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

// Pacific wall clock minus UTC, in ms (negative: -7 h or -8 h).
function pacificOffset(at: number): number {
  const p = partsOf(at);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(at / 1000) * 1000;
}

/** YYYY-MM-DD of the Pacific calendar day containing `now`. */
export function pacificDateKey(now: Date): string {
  const p = partsOf(now.getTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The first Pacific midnight strictly after `now`. Correct on both DST change days. */
export function nextPacificMidnight(now: Date): Date {
  const t = now.getTime();
  const p = partsOf(t);
  // Date.UTC rolls day 32 into the next month, so this is "tomorrow" on the Pacific calendar.
  const wallMidnight = Date.UTC(p.year, p.month - 1, p.day + 1);
  // US DST switches at 02:00, never at midnight, so one offset correction is exact.
  let utc = wallMidnight - pacificOffset(wallMidnight - 8 * 3600_000);
  utc = wallMidnight - pacificOffset(utc);
  return new Date(utc);
}
