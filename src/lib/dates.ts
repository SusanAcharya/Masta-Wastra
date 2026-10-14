// Days matter in the device's own zone (5): a wear on Tuesday morning in Kathmandu is Tuesday.

const pad = (n: number) => String(n).padStart(2, "0");

export function toLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Whole days from a to b (YYYY-MM-DD), counted on the calendar, immune to DST.
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / 86_400_000);
}

export function addDays(date: string, n: number): string {
  const t = new Date(Date.UTC(...ymd(date)) + n * 86_400_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function ymd(s: string): [number, number, number] {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m - 1, d];
}
