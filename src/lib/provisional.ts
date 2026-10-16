// A first guess from the cutout's shape, shown only while Gemini works (or when AI tagging is
// off and the piece waits for a tag). Never used for outfits: the engine only sees pieces
// whose tags are done or set by hand.
import { SUBTYPES, type Category, type Subtype } from "@/engine/types";
import { GARMENTS, type GarmentGroup } from "./parsing";
import { defaultVibes, defaultWarmth } from "./vocab";

export function guessFromShape(w: number, h: number): { category: Category; subtype: Subtype } {
  const ratio = w / h;
  if (ratio > 1.25) return { category: "shoes", subtype: "sneakers" };
  if (ratio < 0.7) return { category: "bottom", subtype: "trousers" };
  return { category: "top", subtype: "tshirt" };
}

export function provisionalTags(w: number, h: number, detected?: GarmentGroup) {
  // The clothes parser's reading beats the shape, when there is one.
  const { category, subtype } = detected ? GARMENTS[detected] : guessFromShape(w, h);
  return {
    category,
    subtype,
    layer: SUBTYPES[subtype].layer,
    warmth: defaultWarmth(subtype),
    pattern: "solid" as const,
    vibes: defaultVibes(subtype),
    waterproof: false,
  };
}

// Pieces the outfit engine may use: recognised by AI, or tagged or fixed by hand.
export function isDressable(item: { tagStatus: string; tagSource: string; archived: boolean; tagCheck?: boolean }) {
  if (item.archived) return false;
  // Gemini was unsure, or said it is not clothing: kept out until the user confirms the tags
  // (any one tap fix clears tagCheck). A wrong piece would spoil the result.
  if (item.tagCheck) return false;
  if (item.tagStatus === "done" || item.tagStatus === "manual") return true;
  return item.tagSource !== "ai" && item.tagStatus !== "pending"; // ai-edited while queued or failed
}
