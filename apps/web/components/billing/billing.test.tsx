import { PLAN_LIMITS } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BillingView, CHECKOUT_RETURN_URL } from "./billing-view";
import { PlanBadge } from "./plan-badge";
import { PROCESSING_MAX_POLLS, overLimitNotes, planFeatures, upgradeStatus } from "./plan-details";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/billing",
}));
vi.mock("@clerk/nextjs", () => ({
  PricingTable: (props: { newSubscriptionRedirectUrl?: string }) => (
    <div data-pricing-table data-redirect={props.newSubscriptionRedirectUrl} />
  ),
  useClerk: () => ({ openUserProfile: vi.fn() }),
}));

const view = (plan: "free" | "pro", returnedFromCheckout = false, overLimit: string[] = []) =>
  renderToStaticMarkup(<BillingView plan={plan} overLimit={overLimit} returnedFromCheckout={returnedFromCheckout} />);

describe("planFeatures", () => {
  it("lists each plan's limits from PLAN_LIMITS", () => {
    for (const plan of ["free", "pro"] as const) {
      const lines = planFeatures(plan).join("\n");
      expect(lines).toContain(`${PLAN_LIMITS[plan].projects.toLocaleString("en")} project`);
      expect(lines).toContain(`${PLAN_LIMITS[plan].messagesPerMonth.toLocaleString("en")} messages a month per project`);
      expect(lines).toContain(`${PLAN_LIMITS[plan].knowledgeSources} knowledge sources per project`);
    }
    expect(planFeatures("free")).toContain("1 project");
    expect(planFeatures("pro")).toContain("2,000 messages a month per project");
    expect(planFeatures("free")).toContain(`"Powered by" badge shown`);
    expect(planFeatures("pro")).toContain(`"Powered by" badge hidden`);
  });
});

describe("overLimitNotes", () => {
  it("is empty within the limits", () => {
    expect(overLimitNotes("free", { projects: 1, sourcesPerProject: [{ name: "Docs", sources: 3 }] })).toEqual([]);
  });

  it("says over-limit projects and sources keep working, but new ones are refused", () => {
    const notes = overLimitNotes("free", {
      projects: 3,
      sourcesPerProject: [
        { name: "Docs", sources: 7 },
        { name: "Shop", sources: 2 },
      ],
    });
    expect(notes).toEqual([
      "You have 3 projects; Free includes 1. They all keep working, but you can't create a new one.",
      "Docs has 7 knowledge sources; Free includes 3. They keep working, but you can't add more.",
    ]);
  });
});

describe("upgradeStatus", () => {
  it("is none without a checkout return", () => {
    expect(upgradeStatus("free", false, 0)).toBe("none");
    expect(upgradeStatus("pro", false, 0)).toBe("none");
  });

  it("is processing until the server says Pro, then done; slow after the last poll", () => {
    expect(upgradeStatus("free", true, 0)).toBe("processing");
    expect(upgradeStatus("free", true, PROCESSING_MAX_POLLS - 1)).toBe("processing");
    expect(upgradeStatus("free", true, PROCESSING_MAX_POLLS)).toBe("slow");
    expect(upgradeStatus("pro", true, 3)).toBe("done");
  });
});

describe("BillingView", () => {
  it("Free: shows the Free plan with its limits and Clerk's pricing table, no Manage button", () => {
    const html = view("free");
    expect(html).toContain(">Your plan<");
    expect(html).toContain(">Free<");
    expect(html).toContain("1 project");
    expect(html).toContain("100 messages a month per project");
    expect(html).toContain("data-pricing-table");
    expect(html).toContain(`data-redirect="${CHECKOUT_RETURN_URL}"`);
    expect(CHECKOUT_RETURN_URL).toBe("/dashboard/billing?checkout=done");
    expect(html).not.toContain("Manage subscription");
    expect(html).not.toContain("Upgrade processing");
  });

  it("Pro: shows Pro with its limits and Manage subscription, no pricing table", () => {
    const html = view("pro");
    expect(html).toContain(">Pro<");
    expect(html).toContain("5 projects");
    expect(html).toContain("2,000 messages a month per project");
    expect(html).toContain(">Manage subscription<");
    expect(html).not.toContain("data-pricing-table");
  });

  it("after checkout, still Free on the server: Upgrade processing…", () => {
    const html = view("free", true);
    expect(html).toContain("Upgrade processing…");
    expect(html).toContain('role="status"');
    // Still Free: the client never marks the owner Pro.
    expect(html).toContain(">Free<");
  });

  it("after checkout, Pro on the server: done", () => {
    const html = view("pro", true);
    expect(html).toContain("You&#x27;re on Pro.");
    expect(html).not.toContain("Upgrade processing");
  });

  it("shows over-limit notes when given", () => {
    const html = view("free", false, ["You have 3 projects; Free includes 1."]);
    expect(html).toContain("Over the Free limits");
    expect(html).toContain("You have 3 projects; Free includes 1.");
  });
});

describe("PlanBadge", () => {
  it("shows the plan and links to Billing", () => {
    const free = renderToStaticMarkup(<PlanBadge plan="free" />);
    expect(free).toContain('href="/dashboard/billing"');
    expect(free).toContain('data-plan="free"');
    expect(free).toContain(">Free<");
    expect(renderToStaticMarkup(<PlanBadge plan="pro" />)).toContain('aria-label="Pro plan. Open billing"');
  });
});
