// Fixed locale and UTC, so the server render and the browser agree (no hydration mismatch).
const DATE_FORMAT = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** `2026-11-19T03:58:28Z` → `Nov 19, 2026`. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE_FORMAT.format(date);
}
