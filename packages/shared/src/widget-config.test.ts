import { describe, expect, it } from "vitest";
import type { WidgetConfig } from "./domain";
import { PLAN_LIMITS, PLANS } from "./plans";
import { DEFAULT_WIDGET_CONFIG } from "./widget";
import { applyPlanToWidgetConfig } from "./widget-config";

const CUSTOM: WidgetConfig = {
  buttonColor: "#1a2b3c",
  position: "top-left",
  label: "Chat with us",
  animation: "scale",
  headerText: "Hi there",
  showBadge: false,
};

describe("applyPlanToWidgetConfig", () => {
  it("Free with a custom stored config gets the defaults with the badge shown", () => {
    expect(applyPlanToWidgetConfig(CUSTOM, "free")).toEqual({ ...DEFAULT_WIDGET_CONFIG, showBadge: true });
  });

  it("Pro gets the stored config unchanged", () => {
    const stored = { ...CUSTOM };
    expect(applyPlanToWidgetConfig(stored, "pro")).toEqual(CUSTOM);
    expect(stored).toEqual(CUSTOM);
  });

  it("follows PLAN_LIMITS for every plan", () => {
    for (const plan of PLANS) {
      const result = applyPlanToWidgetConfig(CUSTOM, plan);
      const { customWidget, showBadge } = PLAN_LIMITS[plan];
      expect(result).toEqual(customWidget ? CUSTOM : { ...DEFAULT_WIDGET_CONFIG, showBadge });
    }
  });

  it("never returns the shared defaults object", () => {
    expect(applyPlanToWidgetConfig(CUSTOM, "free")).not.toBe(DEFAULT_WIDGET_CONFIG);
  });
});
