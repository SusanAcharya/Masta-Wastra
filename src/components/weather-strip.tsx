"use client";

import { Icon } from "@/components/icons/icon";
import type { WeatherSnapshot } from "@/engine/types";
import { copy, OPEN_METEO_URL } from "@/lib/copy";
import { formatRange } from "@/engine";

// Today's weather in one line (10.1), with the CC BY 4.0 attribution beside it (2.4).
export function WeatherStrip({
  place,
  weather,
  stale,
  units,
  onChange,
}: {
  place: string;
  weather: WeatherSnapshot;
  stale?: boolean;
  units: "c" | "f";
  onChange: () => void;
}) {
  const rainy = weather.precipProb >= 50 || weather.precipMm >= 2;
  return (
    <section aria-label={copy.weather.label} className="rounded-ui border border-line bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onChange} className="flex min-h-[44px] items-center gap-2 text-left">
          <Icon name="map-pin" size={18} className="text-ink-2" />
          <span className="text-[15px]">{place}</span>
          <Icon name="chevron-down" size={16} className="text-ink-2" />
        </button>
        <p className="num flex items-center gap-1.5 text-[17px]">
          <Icon name={rainy ? "rain" : weather.feelsMax >= 21 ? "sun" : "thermometer"} size={20} className="text-ink-2" />
          {formatRange(weather.feelsMin, weather.feelsMax, units)}
        </p>
      </div>
      <p className="num mt-1 flex flex-wrap gap-x-4 text-[13px] text-ink-2">
        <span>{copy.weather.feels}</span>
        <span>{copy.weather.rain(Math.round(weather.precipProb))}</span>
        <span>{copy.weather.wind(Math.round(weather.windMax))}</span>
        {weather.manual ? <span>{copy.weather.manual}</span> : stale ? <span>{copy.weather.stale}</span> : null}
      </p>
      <p className="mt-1 text-[12px] text-ink-2">
        <a href={OPEN_METEO_URL}>{copy.weather.credit}</a>
      </p>
    </section>
  );
}
