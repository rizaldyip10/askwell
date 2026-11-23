// Fixed locale and UTC, so the server render and the browser agree (no hydration mismatch).
// A relative time ("5 min ago") would differ between the two renders, so the list uses a short
// absolute time instead, with the full time in a tooltip.
const SHORT = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});
const FULL = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

function valid(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `2026-11-19T14:05:00Z` → `Nov 19, 14:05`. */
export function formatShortTime(iso: string): string {
  const date = valid(iso);
  return date ? SHORT.format(date) : "";
}

/** `2026-11-19T14:05:00Z` → `Nov 19, 2026, 2:05 PM UTC`. */
export function formatFullTime(iso: string): string {
  const date = valid(iso);
  return date ? `${FULL.format(date)} UTC` : "";
}

/** `1 message`, `12 messages`. */
export function messageCountLabel(count: number): string {
  return `${count.toLocaleString("en")} ${count === 1 ? "message" : "messages"}`;
}
