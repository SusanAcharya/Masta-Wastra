import { describe, expect, it } from "vitest";
import { bandFor } from "@/engine/warmth";
import { fetchForecast, forecastUrl, manualWeather, parseForecast, searchCity, type ForecastJson } from "@/lib/weather";

// A forecast response in the documented Open-Meteo shape (timezone=auto, forecast_days=1),
// Kathmandu on a cool October day. Cold at 5 am, warm by 2 pm.
const HOURS = Array.from({ length: 24 }, (_, h) => `2026-10-14T${String(h).padStart(2, "0")}:00`);
// prettier-ignore
const FEELS = [9.1, 8.6, 8.0, 7.4, 6.9, 6.5, 7.0, 8.8, 11.2, 13.5, 15.9, 17.8, 19.4, 20.6, 21.3, 21.0, 20.1, 18.4, 16.2, 14.6, 13.3, 12.4, 11.6, 10.9];
// prettier-ignore
const PROB = [5, 5, 5, 0, 0, 0, 0, 5, 10, 10, 15, 20, 30, 45, 60, 65, 55, 40, 20, 10, 5, 5, 0, 0];

const RAW = {
  latitude: 27.700001,
  longitude: 85.3125,
  generationtime_ms: 0.08,
  utc_offset_seconds: 20700,
  timezone: "Asia/Kathmandu",
  timezone_abbreviation: "GMT+5:45",
  elevation: 1337,
  current_units: { time: "iso8601", interval: "seconds", temperature_2m: "°C", apparent_temperature: "°C", weather_code: "wmo code" },
  current: { time: "2026-10-14T07:15", interval: 900, temperature_2m: 10.4, apparent_temperature: 8.9, weather_code: 2 },
  hourly_units: { time: "iso8601", apparent_temperature: "°C", precipitation_probability: "%" },
  hourly: { time: HOURS, apparent_temperature: FEELS, precipitation_probability: PROB },
  daily_units: {},
  daily: {
    time: ["2026-10-14"],
    apparent_temperature_max: [21.3],
    apparent_temperature_min: [6.5],
    precipitation_sum: [2.4],
    precipitation_probability_max: [65],
    wind_speed_10m_max: [14.8],
    uv_index_max: [7.35],
  },
};
const SAMPLE: ForecastJson = RAW; // extra documented fields (units, interval) are ignored

describe("parseForecast", () => {
  it("uses the 08:00 to 20:00 window for feels like min and max", () => {
    const w = parseForecast(SAMPLE);
    expect(w.feelsMin).toBe(11.2); // 08:00, not the 6.5 at 5 am
    expect(w.feelsMax).toBe(21.3);
    expect(bandFor(w.feelsMax)).toBe("warm");
  });

  it("reads the daily and current values", () => {
    const w = parseForecast(SAMPLE);
    expect(w).toMatchObject({ tempNow: 10.4, precipProb: 65, precipMm: 2.4, windMax: 14.8, uvMax: 7.35, code: 2, lat: 27.7, lon: 85.31 });
    expect(w.manual).toBeUndefined();
  });

  it("turns the local observation time into UTC", () => {
    expect(parseForecast(SAMPLE).fetchedAt).toBe("2026-10-14T01:30:00.000Z"); // 07:15 at UTC+5:45
  });

  it("copes with gaps: nulls skipped, daily fallback, hourly tempNow", () => {
    const sparse: ForecastJson = {
      ...SAMPLE,
      current: undefined,
      hourly: { time: HOURS, apparent_temperature: FEELS.map((v, h) => (h >= 8 && h <= 20 && h !== 14 ? v : null)) },
    };
    const w = parseForecast(sparse, "2026-10-14T09:00");
    expect(w.feelsMax).toBe(21.0); // 14:00 missing
    expect(w.tempNow).toBe(13.5);
    expect(w.code).toBe(0);
    const noHourly = parseForecast({ ...SAMPLE, hourly: undefined });
    expect([noHourly.feelsMin, noHourly.feelsMax]).toEqual([6.5, 21.3]);
    const empty = parseForecast({});
    expect(empty.feelsMax).toBe(15);
    expect(empty.precipProb).toBe(0);
  });
});

describe("requests", () => {
  const ok = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

  it("builds the forecast URL with rounded coordinates and the documented parameters", () => {
    const url = new URL(forecastUrl(27.712345, 85.318765));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    const p = url.searchParams;
    expect(p.get("latitude")).toBe("27.71");
    expect(p.get("longitude")).toBe("85.32");
    expect(p.get("timezone")).toBe("auto");
    expect(p.get("forecast_days")).toBe("1");
    expect(p.get("current")).toBe("temperature_2m,apparent_temperature,weather_code");
    expect(p.get("hourly")).toBe("apparent_temperature,precipitation_probability");
    expect(p.get("daily")).toBe(
      "apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max",
    );
  });

  it("fetches and parses a forecast", async () => {
    const calls: string[] = [];
    const w = await fetchForecast(27.712345, 85.318765, (u) => {
      calls.push(u);
      return ok(SAMPLE);
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("latitude=27.71");
    expect(w.lat).toBe(27.71);
    expect(w.lon).toBe(85.32);
    expect(w.feelsMax).toBe(21.3);
    await expect(fetchForecast(1, 2, () => Promise.resolve(new Response("", { status: 503 })))).rejects.toThrow(/503/);
  });

  it("searches cities with the geocoding API", async () => {
    let seen = "";
    const results = await searchCity(" Pokhara ", (u) => {
      seen = u;
      return ok({
        results: [
          { id: 1, name: "Pokhara", latitude: 28.26689, longitude: 83.96851, country: "Nepal", admin1: "Gandaki Province" },
          { id: 2, name: "Pokhara", latitude: 27.1, longitude: 86.9, country: "Nepal", admin1: "Pokhara" },
        ],
      });
    });
    const url = new URL(seen);
    expect(url.origin + url.pathname).toBe("https://geocoding-api.open-meteo.com/v1/search");
    expect(url.searchParams.get("name")).toBe("Pokhara");
    expect(results[0]).toEqual({ name: "Pokhara", label: "Pokhara, Gandaki Province, Nepal", lat: 28.27, lon: 83.97, country: "Nepal", admin1: "Gandaki Province" });
    expect(results[1].label).toBe("Pokhara, Nepal");
    expect(await searchCity("x", () => ok({}))).toEqual([]);
    expect(await searchCity("Nowhere", () => ok({}))).toEqual([]);
  });
});

describe("manualWeather", () => {
  it("lands each quick pick in its band, with rain when asked", () => {
    const bands = (["cold", "cool", "mild", "warm", "hot"] as const).map((p) => bandFor(manualWeather(p, false, "t").feelsMax));
    expect(bands).toEqual(["cold", "cool", "mild", "warm", "hot"]);
    const rainy = manualWeather("cool", true, "2026-10-14T00:00:00.000Z");
    expect(rainy).toMatchObject({ manual: true, precipProb: 80, fetchedAt: "2026-10-14T00:00:00.000Z" });
    expect(manualWeather("mild", false).precipProb).toBe(0);
    for (const p of ["cold", "cool", "mild", "warm", "hot"] as const) {
      const w = manualWeather(p, false);
      expect(w.feelsMax - w.feelsMin).toBeLessThan(10);
    }
  });
});
