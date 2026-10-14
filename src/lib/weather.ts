// Open-Meteo weather (8.1). One browser request per fetch, no key, CORS enabled. Data is
// CC BY 4.0: show "Weather data by Open-Meteo.com" wherever weather appears. No caching
// here; the caller caches per (lat2dp, lon2dp, hour).
import type { WeatherSnapshot } from "@/engine/types";

export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
export const DAY_START_HOUR = 8; // daytime window for feelsMin / feelsMax, inclusive
export const DAY_END_HOUR = 20;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export const round2 = (x: number) => Math.round(x * 100) / 100;

export function forecastUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(round2(lat)),
    longitude: String(round2(lon)),
    timezone: "auto",
    forecast_days: "1",
    current: "temperature_2m,apparent_temperature,weather_code",
    hourly: "apparent_temperature,precipitation_probability",
    daily:
      "apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max",
  });
  return `${FORECAST_URL}?${params}`;
}

/* Response shape (the parts we read) */

type Num = number | null | undefined;
export interface ForecastJson {
  latitude?: number;
  longitude?: number;
  utc_offset_seconds?: number;
  current?: { time?: string; temperature_2m?: Num; apparent_temperature?: Num; weather_code?: Num };
  hourly?: { time?: string[]; apparent_temperature?: Num[]; precipitation_probability?: Num[] };
  daily?: {
    time?: string[];
    apparent_temperature_max?: Num[];
    apparent_temperature_min?: Num[];
    precipitation_sum?: Num[];
    precipitation_probability_max?: Num[];
    wind_speed_10m_max?: Num[];
    uv_index_max?: Num[];
  };
}

const isNum = (x: Num): x is number => typeof x === "number" && Number.isFinite(x);
const first = (a: Num[] | undefined): number | undefined => a?.find(isNum) ?? undefined;
const hourOf = (t: string) => Number(t.slice(11, 13));

// Local "YYYY-MM-DDTHH:MM" (timezone=auto) plus the UTC offset, to a UTC ISO string.
function localToUtcIso(local: string, offsetSeconds: number): string | undefined {
  const ms = Date.parse(`${local.length === 16 ? `${local}:00` : local}Z`);
  return Number.isNaN(ms) ? undefined : new Date(ms - offsetSeconds * 1000).toISOString();
}

// Pure. Builds a snapshot from an Open-Meteo forecast response. feelsMin and feelsMax come
// from the hourly apparent temperature between 08:00 and 20:00 on the forecast day (falling
// back to the daily values). `nowLocalHourISO` (local "YYYY-MM-DDTHH:00") picks the hourly
// value for tempNow and the fetch time when the response has no `current` block.
export function parseForecast(json: ForecastJson, nowLocalHourISO?: string): WeatherSnapshot {
  const offset = json.utc_offset_seconds ?? 0;
  const hourly = json.hourly ?? {};
  const daily = json.daily ?? {};
  const times = hourly.time ?? [];
  const day = daily.time?.[0] ?? times[0]?.slice(0, 10);

  const feels: number[] = [];
  times.forEach((t, i) => {
    const v = hourly.apparent_temperature?.[i];
    const h = hourOf(t);
    if ((!day || t.startsWith(day)) && h >= DAY_START_HOUR && h <= DAY_END_HOUR && isNum(v)) feels.push(v);
  });

  const dailyMin = first(daily.apparent_temperature_min);
  const dailyMax = first(daily.apparent_temperature_max);
  const allFeels = (hourly.apparent_temperature ?? []).filter(isNum);
  const feelsMin = feels.length ? Math.min(...feels) : (dailyMin ?? (allFeels.length ? Math.min(...allFeels) : 15));
  const feelsMax = feels.length ? Math.max(...feels) : (dailyMax ?? (allFeels.length ? Math.max(...allFeels) : 15));

  const nowIndex = nowLocalHourISO ? times.indexOf(nowLocalHourISO.slice(0, 16)) : -1;
  const hourlyNow = nowIndex >= 0 ? hourly.apparent_temperature?.[nowIndex] : undefined;
  const tempNow = [json.current?.temperature_2m, json.current?.apparent_temperature, hourlyNow].find(isNum) ?? feelsMax;

  const hourlyProb = (hourly.precipitation_probability ?? []).filter(isNum);
  const precipProb = first(daily.precipitation_probability_max) ?? (hourlyProb.length ? Math.max(...hourlyProb) : 0);

  const fetchedLocal = json.current?.time ?? nowLocalHourISO ?? times[0];
  return {
    fetchedAt: (fetchedLocal && localToUtcIso(fetchedLocal, offset)) ?? new Date(0).toISOString(),
    lat: round2(json.latitude ?? 0),
    lon: round2(json.longitude ?? 0),
    tempNow,
    feelsMin,
    feelsMax,
    precipProb,
    precipMm: first(daily.precipitation_sum) ?? 0,
    windMax: first(daily.wind_speed_10m_max) ?? 0,
    uvMax: first(daily.uv_index_max) ?? 0,
    code: isNum(json.current?.weather_code) ? json.current.weather_code : 0,
  };
}

// Fetches today's forecast for a place. Coordinates are rounded to 2 decimals (about 1 km)
// before they leave the device; the snapshot carries the same rounded values.
export async function fetchForecast(lat: number, lon: number, fetchImpl: Fetch = fetch): Promise<WeatherSnapshot> {
  const res = await fetchImpl(forecastUrl(lat, lon));
  if (!res.ok) throw new Error(`Open-Meteo forecast failed: ${res.status}`);
  const snap = parseForecast((await res.json()) as ForecastJson);
  return { ...snap, lat: round2(lat), lon: round2(lon), fetchedAt: new Date().toISOString() };
}

/* City search */

export interface CityResult {
  name: string;
  label: string; // "Kathmandu, Bagmati, Nepal"
  lat: number;
  lon: number;
  country?: string;
  admin1?: string;
}

interface GeocodingJson {
  results?: { name?: string; latitude?: number; longitude?: number; country?: string; admin1?: string }[];
}

export async function searchCity(name: string, fetchImpl: Fetch = fetch, count = 5): Promise<CityResult[]> {
  const q = name.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ name: q, count: String(count), language: "en", format: "json" });
  const res = await fetchImpl(`${GEOCODING_URL}?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo geocoding failed: ${res.status}`);
  const json = (await res.json()) as GeocodingJson;
  return (json.results ?? [])
    .filter((r) => r.name && typeof r.latitude === "number" && typeof r.longitude === "number")
    .map((r) => ({
      name: r.name!,
      label: [r.name, r.admin1, r.country].filter((x, i, a) => x && a.indexOf(x) === i).join(", "),
      lat: round2(r.latitude!),
      lon: round2(r.longitude!),
      country: r.country,
      admin1: r.admin1,
    }));
}

/* Manual quick pick (offline, 8.1) */

export type ManualPick = "cold" | "cool" | "mild" | "warm" | "hot";

// Representative feels like values inside each band (8.1 table), narrow enough that no
// "layers you can shed" rule fires.
export const MANUAL_WEATHER: Record<ManualPick, { min: number; max: number; uv: number }> = {
  cold: { min: 0, max: 5, uv: 1 },
  cool: { min: 6, max: 12, uv: 2 },
  mild: { min: 12, max: 18, uv: 3 },
  warm: { min: 17, max: 24, uv: 5 },
  hot: { min: 25, max: 31, uv: 7 },
};

export function manualWeather(pick: ManualPick, rain: boolean, at: string = new Date().toISOString()): WeatherSnapshot {
  const m = MANUAL_WEATHER[pick];
  return {
    fetchedAt: at,
    lat: 0,
    lon: 0,
    tempNow: Math.round((m.min + m.max) / 2),
    feelsMin: m.min,
    feelsMax: m.max,
    precipProb: rain ? 80 : 0,
    precipMm: rain ? 5 : 0,
    windMax: 10,
    uvMax: m.uv,
    code: rain ? 61 : pick === "hot" ? 0 : 2, // WMO: 61 slight rain, 0 clear, 2 partly cloudy
    manual: true,
  };
}
