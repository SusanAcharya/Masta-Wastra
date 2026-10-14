// Closet scan badges (9.6). Pure: computed from the closet, so they can never drift.
import type { Item } from "@/engine/types";
import { hexToOklch } from "./oklab";

export const BADGES = [
  { id: "first-thread", label: "First thread", hint: "Add your first piece" },
  { id: "full-outfit", label: "Full outfit", hint: "A top, a bottom and shoes" },
  { id: "layer-up", label: "Layer up", hint: "Add a jacket or coat" },
  { id: "ten-strong", label: "Ten strong", hint: "Ten pieces in the closet" },
  { id: "rainbow-rack", label: "Rainbow rack", hint: "Five colour families" },
  { id: "closet-curator", label: "Closet curator", hint: "Fifteen pieces" },
  { id: "monsoon-ready", label: "Monsoon ready", hint: "A waterproof outer layer" },
] as const;
export type BadgeId = (typeof BADGES)[number]["id"];

// Colour family: neutrals by lightness, the rest by named OKLCH hue ranges (equal 60 degree
// slices put yellow and green together, which nobody would call one family).
const HUE_FAMILIES: [number, string][] = [
  [40, "red"],
  [75, "orange"],
  [115, "yellow"],
  [185, "green"],
  [230, "teal"],
  [275, "blue"],
  [320, "purple"],
  [345, "pink"],
  [360, "red"],
];

export function colorFamily(hex: string): string {
  const { C, h, L } = hexToOklch(hex);
  if (C < 0.04) return L < 0.3 ? "dark" : L > 0.85 ? "light" : "grey";
  return HUE_FAMILIES.find(([max]) => h < max)?.[1] ?? "red";
}

export function earnedBadges(items: Item[]): BadgeId[] {
  const live = items.filter((i) => !i.archived);
  const has = (c: Item["category"]) => live.some((i) => i.category === c);
  const families = new Set(live.flatMap((i) => i.colors.map((c) => colorFamily(c.hex))));
  const earned: BadgeId[] = [];
  if (live.length >= 1) earned.push("first-thread");
  if (has("shoes") && (has("dress") || (has("top") && has("bottom")))) earned.push("full-outfit");
  if (has("outer")) earned.push("layer-up");
  if (live.length >= 10) earned.push("ten-strong");
  if (families.size >= 5) earned.push("rainbow-rack");
  if (live.length >= 15) earned.push("closet-curator");
  if (live.some((i) => i.category === "outer" && i.waterproof)) earned.push("monsoon-ready");
  return earned;
}

// The next badge to show at the end of the progress bar.
export function nextBadge(earned: string[]) {
  return BADGES.find((b) => !earned.includes(b.id));
}
