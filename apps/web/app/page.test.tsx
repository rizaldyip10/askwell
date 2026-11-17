import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { APP_NAME, PLANS, PLAN_LIMITS } from "@askwell/shared";
import { PRICING_ROWS } from "../components/landing/pricing-rows";
import Home from "./page";

const html = renderToStaticMarkup(<Home />);

/** The markup between `data-plan="<plan>"` and the end of that plan's card. */
function planCard(plan: string): string {
  const start = html.indexOf(`data-plan="${plan}"`);
  expect(start).toBeGreaterThan(-1);
  const next = PLANS.map((p) => html.indexOf(`data-plan="${p}"`, start + 1)).filter((i) => i > start);
  return html.slice(start, next.length ? Math.min(...next) : undefined);
}

const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

describe("home page", () => {
  it("renders APP_NAME", () => {
    expect(html).toContain(APP_NAME);
  });

  it("links Start free to /sign-up", () => {
    const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)];
    const startFree = links.filter(([, , text]) => text === "Start free");
    expect(startFree.length).toBeGreaterThan(0);
    for (const [, href] of startFree) expect(href).toBe("/sign-up");
  });

  it("shows every section", () => {
    for (const id of ["how-it-works", "demo", "pricing", "install"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("<footer");
  });

  it("shows the §5 values from PLAN_LIMITS on each plan", () => {
    expect(PRICING_ROWS).toHaveLength(9);
    for (const plan of PLANS) {
      const card = planCard(plan);
      const limits = PLAN_LIMITS[plan];
      for (const row of PRICING_ROWS) {
        expect(card).toContain(escape(row.label));
        expect(card).toContain(`>${escape(row.value(limits))}</dd>`);
      }
    }
    // Spot-check against the §5 table itself.
    expect(planCard("free")).toContain(">100</dd>");
    expect(planCard("pro")).toContain(">2,000</dd>");
    expect(planCard("pro")).toContain(">25</dd>");
  });

  it("renders chat bubbles as text, not HTML", () => {
    expect(html).not.toContain("dangerouslySetInnerHTML");
    expect(html).toContain("&lt;script");
  });
});
