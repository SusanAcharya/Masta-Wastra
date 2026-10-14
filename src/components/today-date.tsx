"use client";

import { useSyncExternalStore } from "react";

// Rendered on the device, never at build time, so the date is always today's.
const subscribe = () => () => {};
const format = () =>
  new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());

export function TodayDate() {
  return <>{useSyncExternalStore(subscribe, format, () => "")}</>;
}
