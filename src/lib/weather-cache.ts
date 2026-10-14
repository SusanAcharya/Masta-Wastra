"use client";

// Weather for the Pick screen (8.1). One request per place per hour, cached on the device;
// offline, the last snapshot under 24 h old is used and labelled "from earlier".
import type { WeatherSnapshot } from "@/engine/types";
import { fetchForecast, round2 } from "./weather";

const KEY = "mw-weather";
const DAY = 24 * 3_600_000;

interface Cached {
  key: string;
  snapshot: WeatherSnapshot;
  savedAt: number;
}

const placeKey = (lat: number, lon: number, at = new Date()) =>
  `${round2(lat)},${round2(lon)},${at.toISOString().slice(0, 13)}`;

function read(): Cached | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Cached) : undefined;
  } catch {
    return undefined;
  }
}

function write(c: Cached) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // storage full or blocked: the next tap fetches again
  }
}

export interface WeatherResult {
  snapshot: WeatherSnapshot;
  stale: boolean; // from an earlier fetch because the network failed
}

export async function weatherFor(lat: number, lon: number): Promise<WeatherResult | undefined> {
  const key = placeKey(lat, lon);
  const cached = read();
  if (cached?.key === key) return { snapshot: cached.snapshot, stale: false };
  try {
    const snapshot = await fetchForecast(lat, lon);
    write({ key, snapshot, savedAt: Date.now() });
    return { snapshot, stale: false };
  } catch {
    if (cached && Date.now() - cached.savedAt < DAY) return { snapshot: cached.snapshot, stale: true };
    return undefined;
  }
}

// The last forecast seen on this device, for screens that only need a plausible day
// (item detail's "Outfits with this"). Never fetches.
export function lastWeather(): WeatherSnapshot | undefined {
  const c = read();
  return c && Date.now() - c.savedAt < DAY ? c.snapshot : undefined;
}
