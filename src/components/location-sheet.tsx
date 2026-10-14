"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/icon";
import { Sheet } from "@/components/lounge/ios-bottom-sheet-detents/sheet";
import { Chip, ChipRow, ChoiceRow } from "@/components/lounge/mobile-filter-chips-list/chips";
import type { Settings } from "@/db/schema";
import { copy } from "@/lib/copy";
import { round2, searchCity, type CityResult } from "@/lib/weather";

type Pick = "cold" | "cool" | "mild" | "warm" | "hot";

// Where you are (8.1): your location only when you tap for it, rounded to 2 decimals;
// or a city search; or, offline, a quick pick of the weather itself.
export function LocationSheet({
  open,
  onClose,
  onPlace,
  onManual,
}: {
  open: boolean;
  onClose: () => void;
  onPlace: (loc: NonNullable<Settings["location"]>) => void;
  onManual: (pick: Pick, rain: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityResult[]>([]);
  const [status, setStatus] = useState<string>();
  const [manual, setManual] = useState<Pick>();
  const [rain, setRain] = useState(false);

  function useMine() {
    if (!navigator.geolocation) return setStatus(copy.location.noGeo);
    setStatus(copy.location.finding);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus(undefined);
        onPlace({ name: copy.location.mine, lat: round2(pos.coords.latitude), lon: round2(pos.coords.longitude), source: "geo" });
      },
      () => setStatus(copy.location.denied),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 3_600_000 },
    );
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setStatus(copy.location.searching);
    try {
      const r = await searchCity(query);
      setResults(r);
      setStatus(r.length ? undefined : copy.location.none);
    } catch {
      setStatus(copy.location.offline);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={copy.location.title} detent="full">
      <button type="button" className="btn btn-primary w-full" onClick={useMine}>
        <Icon name="map-pin" size={20} />
        {copy.location.useMine}
      </button>
      <p className="mt-2 text-[13px] text-ink-2">{copy.location.why}</p>

      <form onSubmit={search} className="mt-6 flex gap-2" role="search">
        <label className="sr-only" htmlFor="city">
          {copy.location.search}
        </label>
        <input
          id="city"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={copy.location.searchHint}
          autoComplete="address-level2"
          className="min-h-[48px] flex-1 rounded-ui border border-line-strong bg-surface px-3 text-[16px] text-ink placeholder:text-ink-3"
        />
        <button type="submit" className="btn" aria-label={copy.location.search}>
          <Icon name="search" size={20} />
        </button>
      </form>
      {status ? (
        <p className="mt-3 text-[14px] text-ink-2" role="status">
          {status}
        </p>
      ) : null}
      {results.length ? (
        <ul className="mt-3 divide-y divide-line">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                className="flex min-h-[52px] w-full items-center justify-between text-left"
                onClick={() => onPlace({ name: r.name, lat: r.lat, lon: r.lon, source: "search" })}
              >
                <span>
                  <span className="block text-[15px]">{r.name}</span>
                  <span className="block text-[13px] text-ink-2">{r.label}</span>
                </span>
                <Icon name="chevron-right" size={18} className="text-ink-2" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8 border-t border-line pt-5">
        <p className="label mb-3">{copy.location.quick}</p>
        <ChoiceRow
          label={copy.location.quick}
          value={manual}
          onChange={setManual}
          options={(["cold", "cool", "mild", "warm", "hot"] as Pick[]).map((p) => ({ value: p, label: copy.location.picks[p] }))}
        />
        <div className="mt-3">
          <ChipRow label={copy.location.rain}>
            <Chip pressed={rain} onClick={() => setRain(!rain)}>
              <Icon name="rain" size={18} />
              {copy.location.rain}
            </Chip>
          </ChipRow>
        </div>
        <button type="button" className="btn mt-4 w-full" disabled={!manual} onClick={() => manual && onManual(manual, rain)}>
          {copy.location.useQuick}
        </button>
      </div>
    </Sheet>
  );
}
