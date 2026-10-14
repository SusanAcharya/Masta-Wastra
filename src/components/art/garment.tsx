// Flat garment drawings for examples and onboarding art. No photographs (DESIGN.md brief).
// Colours come from theme tokens only, passed as CSS colour values.

export type GarmentKind = "top" | "bottom" | "shoes" | "outer" | "dress";

const PATHS: Record<GarmentKind, string> = {
  top: "M30 12 42 7Q50 17 58 7L70 12 89 29 78 41 70 35V91H30V35L22 41 11 29Z",
  bottom: "M29 7H71L77 93H56L50 38 44 93H23Z",
  shoes: "M8 64Q9 46 22 44L38 42Q44 31 55 35L70 47Q86 51 92 60V70H8Z",
  outer: "M33 9 45 5 50 21 55 5 67 9 84 21 93 83 80 86 72 41V93H28V41L20 86 7 83 16 21Z",
  dress: "M40 6H60L62 22 82 93H18L38 22Z",
};

// A light seam or detail line drawn over the fill, so pieces read as cloth.
const DETAILS: Partial<Record<GarmentKind, string>> = {
  bottom: "M50 9V30",
  shoes: "M8 66H92M40 44 46 52M47 40 53 48",
  outer: "M50 21V93",
  top: "M42 7Q50 21 58 7",
};

export function Garment({
  kind,
  fill,
  className,
  size = 100,
}: {
  kind: GarmentKind;
  fill: string;
  className?: string;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <path d={PATHS[kind]} fill={fill} />
      {DETAILS[kind] ? (
        <path
          d={DETAILS[kind]}
          fill="none"
          stroke="color-mix(in oklab, var(--surface) 55%, transparent)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
