import { describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "./plan-limits.mock";
import { PRICING_ROWS, formatCount } from "./pricing-rows";

const table = (plan: keyof typeof PLAN_LIMITS) =>
  Object.fromEntries(PRICING_ROWS.map((r) => [r.label, r.value(PLAN_LIMITS[plan])]));

describe("formatCount", () => {
  it("adds thousands separators", () => {
    expect(formatCount(2000)).toBe("2,000");
    expect(formatCount(3)).toBe("3");
  });
});

describe("PRICING_ROWS", () => {
  it("has every §5 row", () => {
    expect(PRICING_ROWS).toHaveLength(9);
  });

  it("matches the §5 Free column", () => {
    expect(Object.values(table("free"))).toEqual([
      "1", "100", "3", "Default", "Bottom right", "Default", "Fade", "Default", "Shown",
    ]);
  });

  it("matches the §5 Pro column", () => {
    expect(Object.values(table("pro"))).toEqual([
      "5", "2,000", "25", "Any", "Any corner", "Custom", "Fade / slide / scale", "Custom", "Hidden",
    ]);
  });
});
