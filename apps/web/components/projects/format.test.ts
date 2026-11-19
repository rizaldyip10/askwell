import { describe, expect, it } from "vitest";
import { formatDate } from "./format";

describe("formatDate", () => {
  it("formats in UTC with a fixed locale, so server and browser agree", () => {
    expect(formatDate("2026-11-19T03:58:28.954505+00:00")).toBe("Nov 19, 2026");
    // Late on the 19th in UTC is still the 19th, whatever the machine's time zone.
    expect(formatDate("2026-11-19T23:59:59Z")).toBe("Nov 19, 2026");
  });

  it("returns an empty string for a bad date", () => {
    expect(formatDate("not a date")).toBe("");
  });
});
