import { describe, expect, it } from "vitest";
import { NAV_ITEMS, PROJECT_SECTIONS, activeNavHref, projectNavItems } from "./nav-items";

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

describe("projectNavItems", () => {
  const ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
  const base = `/dashboard/projects/${ID}`;

  it("has Overview, Knowledge, Conversations, Customize and Install, in order", () => {
    expect(projectNavItems(ID)).toEqual([
      { href: base, label: "Overview" },
      { href: `${base}/knowledge`, label: "Knowledge" },
      { href: `${base}/conversations`, label: "Conversations" },
      { href: `${base}/customize`, label: "Customize" },
      { href: `${base}/install`, label: "Install" },
    ]);
  });

  it("follows PROJECT_SECTIONS, so later sections only need a new entry", () => {
    expect(projectNavItems(ID).map((i) => i.label)).toEqual(PROJECT_SECTIONS.map((s) => s.label));
  });

  it("highlights the matching section", () => {
    const items = projectNavItems(ID);
    expect(activeNavHref(base, items)).toBe(base);
    expect(activeNavHref(`${base}/knowledge`, items)).toBe(`${base}/knowledge`);
    expect(activeNavHref(`${base}/install`, items)).toBe(`${base}/install`);
    expect(activeNavHref(`${base}/conversations`, items)).toBe(`${base}/conversations`);
    // A thread page keeps Conversations highlighted.
    expect(activeNavHref(`${base}/conversations/abc`, items)).toBe(`${base}/conversations`);
    expect(activeNavHref(`${base}/customize`, items)).toBe(`${base}/customize`);
    // A section without its own nav entry falls back to Overview.
    expect(activeNavHref(`${base}/settings`, items)).toBe(base);
    // A similar-looking path doesn't match Knowledge.
    expect(activeNavHref(`${base}/knowledgebase`, items)).toBe(base);
    expect(activeNavHref("/dashboard/billing", items)).toBeNull();
  });

  it("keeps Projects highlighted in the account nav inside a project", () => {
    expect(activeNavHref(`${base}/install`)).toBe("/dashboard");
  });
});
