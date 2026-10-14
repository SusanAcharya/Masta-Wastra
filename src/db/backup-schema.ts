import { z } from "zod";
import { CATEGORIES, FEATURE_KEYS, OCCASIONS, PATTERNS, SUBTYPE_IDS, VIBES } from "@/engine/types";

// Validation for .wastra.zip imports (13). Strict on shapes the app relies on,
// tolerant of extra fields (a newer export may add some).

const iso = z.string().min(10);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().min(1).max(64);
// Zod 4: a record keyed by an enum requires every key.
const featureVector = z.record(z.enum(FEATURE_KEYS), z.number());

export const itemSchema = z.looseObject({
  id,
  createdAt: iso,
  updatedAt: iso,
  name: z.string().max(120),
  category: z.enum(CATEGORIES),
  subtype: z.enum(SUBTYPE_IDS as [string, ...string[]]),
  layer: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  colors: z.array(z.object({ hex, name: z.string().max(40), share: z.number().min(0).max(1) })).min(1).max(3),
  primaryHex: hex,
  isNeutral: z.boolean(),
  neutralOverride: z.boolean().optional(),
  pattern: z.enum(PATTERNS),
  warmth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  vibes: z.array(z.enum(VIBES)).max(3),
  occasions: z.array(z.enum(OCCASIONS)),
  waterproof: z.boolean(),
  tagSource: z.enum(["ai", "manual", "ai-edited"]),
  tagStatus: z.enum(["pending", "queued", "done", "failed", "manual"]),
  tagCheck: z.boolean().optional(),
  aiRaw: z.unknown().optional(),
  imageId: id,
  cutoutId: id,
  thumbId: id,
  cutoutQuality: z.enum(["auto", "manual"]).optional(), // absent in schema v1 exports
  archived: z.boolean(),
  price: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});

export const imageMetaSchema = z.object({
  id,
  kind: z.enum(["original", "cutout", "thumb"]),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  mime: z.enum(["image/webp", "image/jpeg", "image/png"]),
  file: z.string().regex(/^images\/[\w-]+\.(webp|jpg|png)$/),
});

export const outfitSchema = z.looseObject({
  id,
  itemIds: z.array(id).min(1).max(8),
  signature: z.string(),
  createdAt: iso,
  source: z.enum(["deal", "manual"]),
  score: z.number().optional(),
  breakdown: z.record(z.string(), z.number()).optional(),
  reason: z.string().optional(),
});

const weatherSchema = z.looseObject({
  fetchedAt: iso,
  lat: z.number(),
  lon: z.number(),
  tempNow: z.number(),
  feelsMin: z.number(),
  feelsMax: z.number(),
  precipProb: z.number(),
  precipMm: z.number(),
  windMax: z.number(),
  uvMax: z.number(),
  code: z.number(),
  manual: z.boolean().optional(),
});

export const dealDaySchema = z.looseObject({
  localDate,
  occasion: z.enum(OCCASIONS),
  weather: weatherSchema,
  outfitIds: z.array(id).max(3),
  shownOutfitIds: z.array(id).optional(), // absent in schema v1 exports
  seed: z.number(),
  pickedOutfitId: id.optional(),
  reshuffles: z.number().int().min(0),
});

export const wearSchema = z.object({ id, localDate, outfitId: id, itemIds: z.array(id), at: iso });

export const feedbackSchema = z.looseObject({
  id,
  outfitId: id,
  at: iso,
  signal: z.enum(["up", "down", "skip", "wear", "more"]),
  features: featureVector,
  dealMean: featureVector.optional(),
});

export const weightsSchema = z.looseObject({
  id: z.literal("current"),
  version: z.number(),
  w: featureVector,
  itemAffinity: z.record(z.string(), z.number()),
  pairAffinity: z.record(z.string(), z.number()),
  signals: z.number().optional(),
  decayedAt: iso.optional(),
  updatedAt: iso,
});

export const settingsSchema = z.looseObject({
  id: z.literal("me"),
  themeMode: z.enum(["system", "light", "dark"]).optional(),
  units: z.enum(["c", "f"]).optional(),
  location: z
    .object({ name: z.string(), lat: z.number(), lon: z.number(), source: z.enum(["geo", "search"]) })
    .optional(),
  morningHour: z.number().int().min(0).max(23).optional(),
  defaultOccasionByWeekday: z.array(z.enum(OCCASIONS)).length(7).optional(),
  aiConsent: z.boolean().nullable().optional(),
  keepOriginals: z.boolean().optional(),
  badges: z.array(z.string()).optional(),
});

export const tagJobSchema = z.object({
  id,
  itemId: id,
  attempts: z.number().int().min(0),
  nextAt: iso,
  lastError: z.string().optional(),
  state: z.enum(["waiting", "running", "done", "dead"]),
});

export const manifestSchema = z.object({
  app: z.literal("masta-wastra"),
  schemaVersion: z.number().int().min(1),
  exportedAt: iso,
  withPhotos: z.boolean(),
  counts: z.record(z.string(), z.number().int().min(0)),
});

export const dataSchema = z.object({
  items: z.array(itemSchema),
  images: z.array(imageMetaSchema),
  outfits: z.array(outfitSchema),
  dealDays: z.array(dealDaySchema),
  wears: z.array(wearSchema),
  feedback: z.array(feedbackSchema),
  weights: z.array(weightsSchema).max(1),
  settings: z.array(settingsSchema).max(1),
  tagJobs: z.array(tagJobSchema),
});

export type BackupManifest = z.infer<typeof manifestSchema>;
export type BackupData = z.infer<typeof dataSchema>;
