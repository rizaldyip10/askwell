// Pure helpers for the usage display (project.md §6.12). No server-only import: the
// components use them too.

/** From this share of the limit on, the bar shows "Near limit". */
export const NEAR_LIMIT_RATIO = 0.8;

export type UsageState = "normal" | "near" | "at";

export type UsageSummary = {
  /** Bar fill, 0 to 100, rounded down so it never reads full before the limit. */
  percent: number;
  state: UsageState;
  /** "42 / 100" with thousands separators. */
  count: string;
  /** "Near limit" / "Limit reached", or null when normal: the state in words, not only shade. */
  label: string | null;
};

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

/**
 * The display summary for `used` of `limit` messages. Over the limit (it can't be by
 * consume_message, but the stored value is not trusted) reads as at the limit, with the bar
 * full. A limit of 0 counts as at the limit.
 */
export function summarizeUsage(used: number, limit: number): UsageSummary {
  const safeUsed = Math.max(0, Math.floor(used));
  const safeLimit = Math.max(0, Math.floor(limit));
  const ratio = safeLimit === 0 ? 1 : safeUsed / safeLimit;
  const state: UsageState = ratio >= 1 ? "at" : ratio >= NEAR_LIMIT_RATIO ? "near" : "normal";
  return {
    percent: Math.min(100, Math.floor(ratio * 100)),
    state,
    count: `${NUMBER_FORMAT.format(safeUsed)} / ${NUMBER_FORMAT.format(safeLimit)}`,
    label: state === "at" ? "Limit reached" : state === "near" ? "Near limit" : null,
  };
}
