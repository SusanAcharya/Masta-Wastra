// One short line per outfit (8.8). Pure. Built from the two most telling reasons, in plain
// words, with colour names and the user's temperature units. No long dashes.
//
// A good colour match (S_color ≥ 0.75) always leads, because colour is what the owner cares
// about most; the second sentence is the most salient of the rest. Salience is a feature's
// contribution above a typical outfit, w · (f - baseline), so rare wins (never worn, rain
// ready) can surface over features every outfit has.
import { harmonyKind, isEcho, type ColorPoint } from "./color";
import { coreOf, type Parts, type Prep, type ScoreDetail } from "./score";
import type { WeatherFlags } from "./warmth";
import { VIBES, type FeatureVector, type Occasion, type Units, type WeatherSnapshot } from "./types";

export interface ExplainInput {
  parts: Parts;
  detail: ScoreDetail;
  w: FeatureVector; // effective weights used for the score
  flags: WeatherFlags;
  weather: WeatherSnapshot;
  occasion: Occasion;
  units?: Units;
}

const NOUN: Record<string, string> = {
  tshirt: "tee",
  tank: "tank top",
  sweatshirt: "sweatshirt",
  puffer: "puffer jacket",
};
const PLURAL = new Set([
  "jeans",
  "chinos",
  "trousers",
  "joggers",
  "leggings",
  "shorts",
  "sneakers",
  "boots",
  "loafers",
  "heels",
  "flats",
  "sandals",
  "gloves",
]);

export const nounOf = (p: Prep) => NOUN[p.item.subtype] ?? p.item.subtype;
const plural = (p: Prep) => PLURAL.has(p.item.subtype);
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const colorName = (c: ColorPoint) => c.name.toLowerCase();
const mainColor = (p: Prep) => colorName(p.palette[0]);

export function formatTemp(celsius: number, units: Units = "c"): string {
  return units === "f" ? `${Math.round((celsius * 9) / 5 + 32)}°F` : `${Math.round(celsius)}°C`;
}

export function formatRange(lo: number, hi: number, units: Units = "c"): string {
  const [a, b] = [formatTemp(lo, units), formatTemp(hi, units)];
  return `${a.slice(0, -2)} to ${b}`;
}

/* Colour */

const PATTERN_WORD: Record<string, (c: string) => string> = {
  stripe: (c) => `the ${c} stripe`,
  check: (c) => `the ${c} check`,
  floral: (c) => `the ${c} in the florals`,
  graphic: (c) => `the ${c} in the graphic`,
  print: (c) => `the ${c} in the print`,
};

// What makes the colours work, or null when there is nothing honest to praise.
export function colorPhrase(parts: Parts, detail: ScoreDetail): string | null {
  const core = coreOf(parts);
  const c = detail.color;
  if (c.score < 0.75) return null;

  // One pattern, another piece picks up one of its colours ("White sneakers pick up the white stripe").
  if (c.patternEcho) {
    const bold = core.find((p) => p.bold)!;
    const order = [parts.shoes, ...core.filter((p) => p !== parts.shoes)];
    for (const q of order) {
      if (q === bold) continue;
      for (const bc of bold.palette)
        for (const qc of q.palette)
          if (isEcho(bc, qc) && (bc !== bold.palette[0] || bold.palette.length === 1)) {
            const verb = plural(q) ? "pick" : "picks";
            const words = PATTERN_WORD[bold.item.pattern] ?? ((x: string) => `the ${x} in the pattern`);
            return `${cap(colorName(qc))} ${nounOf(q)} ${verb} up ${words(colorName(bc))}.`;
          }
    }
  }

  // Two neutrals and one accent, the ideal.
  if (c.oneAccent) {
    const accent = core.find((p) => !p.neutral)!;
    // Name the two most visible neutrals: bottom first, then the layers, the top, the shoes.
    const order = [parts.bottom, parts.outer, parts.mid, parts.base, parts.shoes].filter((p): p is Prep => !!p && p.neutral);
    const names = [...new Set(order.map(mainColor))].filter((n) => n !== mainColor(accent)).slice(0, 2);
    const rest = names.join(" and ");
    if (rest) return `${cap(mainColor(accent))} ${nounOf(accent)} with ${rest}, one clear accent.`;
  }

  // Otherwise the main pair: top and bottom, or a dress and what goes over or under it.
  const x = parts.bottom ? parts.base : (parts.outer ?? parts.mid ?? parts.base);
  const y = parts.bottom ?? (x === parts.base ? parts.shoes : parts.base);
  const [a, b] = [x.palette[0], y.palette[0]];
  const [na, nb] = [colorName(a), colorName(b)];
  switch (harmonyKind(a, b)) {
    case "echo":
      return `All ${na}, matched and sharp.`;
    case "neutralPair":
    case "neutralContrast":
      return na === nb ? `All ${na}, matched and sharp.` : `${cap(na)} and ${nb}, a classic pair.`;
    case "neutralAccent": {
      const [colour, base] = a.neutral ? [nb, na] : [na, nb];
      return `${cap(colour)} on ${base}, an easy match.`;
    }
    case "analogous":
      return `${cap(na)} and ${nb}, easy neighbours.`;
    case "complementary":
      return `${cap(na)} and ${nb}, a bold classic contrast.`;
    case "split":
      return `${cap(na)} and ${nb}, a lively mix.`;
    case "tonal":
      return `Tonal ${na}, light with dark.`;
    default:
      return null; // near miss or awkward: say nothing about colour
  }
}

/* Warmth and layers */

export function warmthPhrase(parts: Parts, flags: WeatherFlags, weather: WeatherSnapshot, units: Units = "c"): string {
  const t = formatTemp(weather.feelsMax, units);
  const shed = parts.outer ?? parts.mid;
  if (flags.wide && shed) return `${formatRange(weather.feelsMin, weather.feelsMax, units)} today, a ${nounOf(shed)} you can take off.`;
  if (parts.outer) return `${t}, so a ${nounOf(parts.outer)} on top.`;
  if (parts.mid) return `${t}, so a ${nounOf(parts.mid)} for warmth.`;
  if (parts.base.item.category === "top" && parts.base.item.layer === 1) return `${t}, so a warm ${nounOf(parts.base)}.`;
  if (flags.band === "hot") return `${t}, so keep it light.`;
  return `${t}, no layers needed.`;
}

const OCCASION_LINE: Record<Occasion, string> = {
  work: "Sharp enough for work.",
  casual: "Relaxed and easy.",
  date: "Smart for a date.",
  formal: "Dressed up for the occasion.",
  workout: "Ready to move.",
  travel: "Comfortable for travel.",
  home: "Easy for a day at home.",
  festival: "Festive and traditional.",
};

// Typical feature values; salience is the contribution above these.
const BASELINE: FeatureVector = {
  color: 0.75,
  warmthFit: 0.5,
  layerFit: 0.5,
  occasionFit: 0.5,
  freshness: 0.8,
  rainFit: 0,
  neverWornBoost: 0,
  patternBalance: 0.9,
  vibeCohesion: 0.4,
};

interface Story {
  salience: number;
  text: string;
}

export function explain(x: ExplainInput): string {
  const { parts, detail, w, flags, weather, occasion, units = "c" } = x;
  const f = detail.features;
  const sal = (k: keyof FeatureVector) => w[k] * (f[k] - BASELINE[k]);
  const stories: Story[] = [];

  const color = colorPhrase(parts, detail);
  if (color) stories.push({ salience: 10 + f.color, text: color });

  stories.push({
    salience: sal("warmthFit") + sal("layerFit"),
    text: warmthPhrase(parts, flags, weather, units),
  });

  if (flags.rain && f.rainFit >= 0.5) {
    const outer = parts.outer?.item.waterproof ? parts.outer : undefined;
    stories.push({
      salience: sal("rainFit"),
      text: outer ? `Rain on the way. Your waterproof ${nounOf(outer)} comes along.` : "Rain on the way, so closed shoes.",
    });
  }

  const fresh = [...coreOf(parts), ...(parts.accessory ? [parts.accessory] : [])].find((p) => p.neverWornOld);
  if (fresh && f.neverWornBoost === 1) {
    const name = fresh.item.name.trim().toLowerCase() || `${mainColor(fresh)} ${nounOf(fresh)}`;
    stories.push({ salience: 1 + w.neverWornBoost, text: `You have not worn the ${name} yet.` });
  }

  if (parts.accessory && (detail.breakdown.weather ?? 0) > 0) {
    const acc = parts.accessory;
    const text = flags.hotUv ? `Strong sun, so the ${nounOf(acc)} comes too.` : `Cold out, so add the ${nounOf(acc)}.`;
    stories.push({ salience: 0.8, text });
  }

  stories.push({ salience: sal("occasionFit"), text: OCCASION_LINE[occasion] });
  stories.push({ salience: sal("freshness"), text: "Nothing here was worn this week." });

  const core = coreOf(parts);
  const common = core.reduce((m, p) => m & p.vibeMask, ~0);
  const vibe = VIBES.find((_, i) => common & (1 << i));
  if (vibe) stories.push({ salience: sal("vibeCohesion"), text: `One ${vibe} mood throughout.` });

  if (detail.color.boldCount === 1 && !detail.color.patternEcho)
    stories.push({ salience: 0.2, text: "One pattern, the rest kept calm." });

  stories.sort((a, b) => b.salience - a.salience);
  const picked = stories.filter((s) => s.salience > 0).slice(0, 2);
  if (!picked.length) picked.push({ salience: 0, text: warmthPhrase(parts, flags, weather, units) });
  return picked.map((s) => s.text).join(" ");
}
