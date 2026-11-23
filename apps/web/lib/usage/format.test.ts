import { describe, expect, it } from "vitest";
import { NEAR_LIMIT_RATIO, summarizeUsage } from "./format";

describe("summarizeUsage", () => {
  it("0 used: empty bar, normal, no label", () => {
    expect(summarizeUsage(0, 100)).toEqual({ percent: 0, state: "normal", count: "0 / 100", label: null });
  });

  it("just under 80%: still normal", () => {
    expect(summarizeUsage(79, 100)).toMatchObject({ percent: 79, state: "normal", label: null });
  });

  it("80%: near the limit", () => {
    expect(NEAR_LIMIT_RATIO).toBe(0.8);
    expect(summarizeUsage(80, 100)).toEqual({ percent: 80, state: "near", count: "80 / 100", label: "Near limit" });
    expect(summarizeUsage(1600, 2000)).toMatchObject({ state: "near", count: "1,600 / 2,000" });
  });

  it("one below the limit: near, and the bar is not yet full", () => {
    expect(summarizeUsage(1999, 2000)).toMatchObject({ percent: 99, state: "near" });
  });

  it("100%: at the limit, full bar", () => {
    expect(summarizeUsage(100, 100)).toEqual({ percent: 100, state: "at", count: "100 / 100", label: "Limit reached" });
  });

  it("over the limit: at the limit, bar capped at 100", () => {
    expect(summarizeUsage(150, 100)).toMatchObject({ percent: 100, state: "at", count: "150 / 100" });
  });

  it("a limit of 0 is at the limit; bad numbers are clamped", () => {
    expect(summarizeUsage(0, 0)).toMatchObject({ percent: 100, state: "at" });
    expect(summarizeUsage(-5, 100)).toMatchObject({ percent: 0, state: "normal", count: "0 / 100" });
  });
});
