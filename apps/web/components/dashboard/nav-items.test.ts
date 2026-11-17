import { describe, expect, it } from "vitest";
import { NAV_ITEMS, activeNavHref } from "./nav-items";

describe("activeNavHref", () => {
  it("has Projects and Billing", () => {
    expect(NAV_ITEMS.map((i) => [i.label, i.href])).toEqual([
      ["Projects", "/dashboard"],
      ["Billing", "/dashboard/billing"],
    ]);
  });

  it("picks the most specific item", () => {
    expect(activeNavHref("/dashboard")).toBe("/dashboard");
    expect(activeNavHref("/dashboard/projects/abc")).toBe("/dashboard");
    expect(activeNavHref("/dashboard/billing")).toBe("/dashboard/billing");
  });

  it("returns null outside the dashboard", () => {
    expect(activeNavHref("/")).toBeNull();
    expect(activeNavHref("/dashboardx")).toBeNull();
  });
});
