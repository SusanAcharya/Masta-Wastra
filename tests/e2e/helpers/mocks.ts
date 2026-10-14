import type { Page } from "@playwright/test";

// Stand-ins for the network the app talks to, so e2e runs need no Gemini key and no weather.

type Kind = { category: string; subtype: string; layer: 0 | 1 | 2; warmth: number; vibes: string[]; waterproof?: boolean };
const KINDS: Record<string, Kind> = {
  tee: { category: "top", subtype: "tshirt", layer: 0, warmth: 2, vibes: ["casual"] },
  shirt: { category: "top", subtype: "shirt", layer: 0, warmth: 2, vibes: ["smart"] },
  jeans: { category: "bottom", subtype: "jeans", layer: 0, warmth: 3, vibes: ["casual"] },
  chinos: { category: "bottom", subtype: "chinos", layer: 0, warmth: 3, vibes: ["smart", "casual"] },
  skirt: { category: "bottom", subtype: "skirt", layer: 0, warmth: 2, vibes: ["smart"] },
  sneakers: { category: "shoes", subtype: "sneakers", layer: 0, warmth: 2, vibes: ["casual"] },
  boots: { category: "shoes", subtype: "boots", layer: 0, warmth: 4, vibes: ["casual"], waterproof: true },
  coat: { category: "outer", subtype: "coat", layer: 2, warmth: 4, vibes: ["smart"] },
  raincoat: { category: "outer", subtype: "raincoat", layer: 2, warmth: 2, vibes: ["casual"], waterproof: true },
  sweater: { category: "top", subtype: "sweater", layer: 1, warmth: 3, vibes: ["casual"] },
  dress: { category: "dress", subtype: "dress", layer: 0, warmth: 2, vibes: ["smart"] },
  hoodie: { category: "top", subtype: "hoodie", layer: 1, warmth: 3, vibes: ["casual", "street"] },
  shorts: { category: "bottom", subtype: "shorts", layer: 0, warmth: 1, vibes: ["casual"] },
  scarf: { category: "accessory", subtype: "scarf", layer: 0, warmth: 3, vibes: ["casual"] },
  bag: { category: "accessory", subtype: "bag", layer: 0, warmth: 2, vibes: ["casual"] },
};
const NAMES: Record<string, string> = { tan: "camel" };

// Fixture file names are NN-<category>-<colour>-<kind>.jpg. Tag requests arrive in upload order.
export async function mockTagging(page: Page, files: string[]) {
  const queue = files.map((f) => f.split("/").pop()!.replace(/\.jpg$/, "").split("-"));
  const seen: string[] = [];
  await page.route("**/api/install", (route) => {
    // Same shape as the server's token: base64url(JSON {iid, iat}).signature
    const iat = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ iid: "e2e-install", iat })).toString("base64url");
    const expiresAt = new Date((iat + 180 * 86_400) * 1000).toISOString();
    return route.fulfill({ json: { token: `${payload}.e2e-signature`, expiresAt } });
  });
  await page.route("**/api/tag", async (route) => {
    const body = route.request().postDataJSON() as { itemId: string; colors: { hex: string; share: number }[] };
    seen.push(body.itemId);
    const parts = queue.shift() ?? ["00", "top", "grey", "tee"];
    const colour = NAMES[parts[2]] ?? parts[2];
    const kind = KINDS[parts[3]];
    const occasions = kind.vibes.includes("smart") ? ["work", "casual", "date"] : ["casual", "travel", "home"];
    await route.fulfill({
      json: {
        model: "gemini-3.5-flash-lite",
        tags: {
          isClothing: true,
          name: `${colour.charAt(0).toUpperCase()}${colour.slice(1)} ${kind.subtype}`,
          category: kind.category,
          subtype: kind.subtype,
          layer: kind.layer,
          colors: body.colors.map((c, i) => ({ hex: c.hex, name: i === 0 ? colour : "grey", share: c.share })),
          pattern: "solid",
          warmth: kind.warmth,
          vibes: kind.vibes,
          occasions,
          waterproof: kind.waterproof ?? false,
          confidence: 0.92,
        },
      },
    });
  });
  return seen;
}

// A mild, dry Kathmandu day in the documented Open-Meteo shape.
export async function mockWeather(page: Page, feels = [14, 15, 16, 17, 18, 19, 19, 18, 17, 16, 15, 14, 13]) {
  const hours = Array.from({ length: 24 }, (_, h) => `2026-10-14T${String(h).padStart(2, "0")}:00`);
  const apparent = hours.map((_, h) => (h >= 8 && h <= 20 ? feels[h - 8] : 10));
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({
      headers: { "access-control-allow-origin": "*" },
      json: {
        latitude: 27.7,
        longitude: 85.32,
        utc_offset_seconds: 20700,
        timezone: "Asia/Kathmandu",
        current: { time: "2026-10-14T07:15", temperature_2m: 13, apparent_temperature: 12, weather_code: 1 },
        hourly: { time: hours, apparent_temperature: apparent, precipitation_probability: hours.map(() => 5) },
        daily: {
          time: ["2026-10-14"],
          apparent_temperature_max: [Math.max(...feels)],
          apparent_temperature_min: [9],
          precipitation_sum: [0],
          precipitation_probability_max: [10],
          wind_speed_10m_max: [11],
          uv_index_max: [5],
        },
      },
    }),
  );
  await page.route("https://geocoding-api.open-meteo.com/**", (route) =>
    route.fulfill({
      headers: { "access-control-allow-origin": "*" },
      json: {
        results: [{ name: "Kathmandu", latitude: 27.70169, longitude: 85.3206, country: "Nepal", country_code: "NP", admin1: "Bagmati" }],
      },
    }),
  );
}
