import "server-only";
import { z } from "zod";
import {
  CATEGORIES,
  COLOR_NAMES,
  COLOR_NAME_IDS,
  PATTERNS,
  SUBTYPES,
  SUBTYPE_IDS,
  VIBES,
  type ColorName,
  type Layer,
  type Subtype,
  type Warmth,
} from "@/engine/types";
import { deltaE, hexToOklab, nearestColorName } from "@/lib/oklab";
import { occasionsFromVibes, type MeasuredColor, type Tags } from "@/lib/tag-api";

// What Gemini must return (7.2). The same zod object is the JSON schema we send
// (responseJsonSchema) and the parser we trust afterwards, so the two cannot drift.
// Integers rather than literal unions: Gemini's JSON schema subset handles min and max
// on integers, and an anyOf of consts is less reliably honoured.
export const GeminiTagSchema = z.object({
  isClothing: z.boolean(),
  name: z.string().min(1).max(60),
  category: z.enum(CATEGORIES),
  subtype: z.enum(SUBTYPE_IDS as [Subtype, ...Subtype[]]),
  layer: z.int().min(0).max(2),
  colorNames: z
    .array(z.enum(COLOR_NAME_IDS as [ColorName, ...ColorName[]]))
    .min(1)
    .max(3),
  pattern: z.enum(PATTERNS),
  warmth: z.int().min(1).max(5),
  vibes: z.array(z.enum(VIBES)).min(1).max(3),
  waterproof: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type GeminiTag = z.infer<typeof GeminiTagSchema>;

/** JSON Schema for `responseJsonSchema`, without the `$schema` key Gemini does not need. */
export function geminiJsonSchema(): Record<string, unknown> {
  const { $schema: _drop, ...schema } = z.toJSONSchema(GeminiTagSchema) as Record<string, unknown>;
  return schema;
}

// OKLab distance under which a Gemini name counts as describing a measured colour. The 24
// anchors sit roughly 0.08 to 0.2 apart, so this accepts a neighbouring name ("denim" for a
// measured blue) but not a different colour family.
export const NAME_MATCH_DELTA = 0.16;

/**
 * Client hex values are the truth (7.2); Gemini only names them. Each measured colour, in
 * share order, takes the closest unused Gemini name if it is plausibly that colour, else the
 * nearest anchor name. Gemini's list order is not trusted to match the client's.
 */
export function mergeColors(measured: MeasuredColor[], names: readonly ColorName[]): Tags["colors"] {
  const total = measured.reduce((s, c) => s + c.share, 0) || 1;
  const unused = [...new Set(names)];
  return [...measured]
    .sort((a, b) => b.share - a.share)
    .map((c) => {
      const lab = hexToOklab(c.hex);
      let best: { name: ColorName; d: number } | undefined;
      for (const name of unused) {
        const d = deltaE(lab, hexToOklab(COLOR_NAMES[name]));
        if (!best || d < best.d) best = { name, d };
      }
      let name: ColorName;
      if (best && best.d <= NAME_MATCH_DELTA) {
        name = best.name;
        unused.splice(unused.indexOf(best.name), 1);
      } else {
        name = nearestColorName(c.hex);
      }
      return { hex: c.hex.toLowerCase(), name, share: round(c.share / total) };
    });
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Gemini output to Item fields. The subtype is the most specific answer, so its category
 * wins over a contradicting category (a "jacket" filed under "top" becomes "outer"), and
 * the layer falls back to the subtype's default when the category had to be corrected.
 */
export function toItemTags(raw: GeminiTag, measured: MeasuredColor[]): Tags {
  const known = SUBTYPES[raw.subtype];
  const consistent = known.category === raw.category;
  const name = raw.name.trim().replace(/\s+/g, " ");
  return {
    isClothing: raw.isClothing,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    category: known.category,
    subtype: raw.subtype,
    layer: (consistent ? raw.layer : known.layer) as Layer,
    colors: mergeColors(measured, raw.colorNames),
    pattern: raw.pattern,
    warmth: raw.warmth as Warmth,
    vibes: [...new Set(raw.vibes)],
    occasions: occasionsFromVibes(raw.vibes),
    waterproof: raw.waterproof,
    confidence: raw.confidence,
  };
}
