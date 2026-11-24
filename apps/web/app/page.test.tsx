import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { APP_NAME, PLANS, PLAN_LIMITS } from "@askwell/shared";
import { PRICING_ROWS } from "../components/landing/pricing-rows";
import Home from "./page";

const APP_URL = "https://askwell.test";
// Records the order of the request-time opt-in and the app URL read.
const calls = vi.hoisted(() => [] as string[]);
vi.mock("next/server", () => ({ connection: vi.fn(async () => void calls.push("connection")) }));
vi.mock("../lib/app-url", () => ({ appUrl: vi.fn(() => (calls.push("appUrl"), "https://askwell.test")) }));
// The key reader, per request; the widget as a marker carrying its props (its effect is tested on its own).
const widgetKey = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("../lib/landing/widget-key", () => ({
  landingWidgetKey: vi.fn(() => (calls.push("landingWidgetKey"), widgetKey.value)),
}));
vi.mock("../components/landing/landing-widget", () => ({
  LandingWidget: ({ appUrl, widgetKey }: { appUrl: string; widgetKey: string | null }) =>
    widgetKey ? <i data-landing-widget={widgetKey} data-app-url={appUrl} /> : null,
}));

const KEY = "pk_a1b2c3d4e5f6a7b8c9d0e1f2";

const html = renderToStaticMarkup(await Home());

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

  it("links Sign in to /sign-in", () => {
    const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)];
    const signIn = links.filter(([, , text]) => text === "Sign in");
    expect(signIn.length).toBeGreaterThan(0);
    for (const [, href] of signIn) expect(href).toBe("/sign-in");
  });

  it("renders per request: connection() runs before appUrl() and the widget key are read", () => {
    expect(calls).toEqual(["connection", "appUrl", "landingWidgetKey"]);
  });

  it("without LANDING_WIDGET_KEY: no widget", () => {
    expect(html).not.toContain("data-landing-widget");
  });

  it("reads the widget key on each request and passes it with appUrl()", async () => {
    widgetKey.value = KEY;
    const withKey = renderToStaticMarkup(await Home());
    expect(withKey).toContain(`data-landing-widget="${KEY}" data-app-url="${APP_URL}"`);

    widgetKey.value = null;
    expect(renderToStaticMarkup(await Home())).not.toContain("data-landing-widget");
  });

  it("labels the demo chat as a preview", () => {
    expect(html).toContain(">Preview</span>");
  });

  it("points at the live button only when the widget runs", async () => {
    expect(html).not.toContain("Try it: ask the bot in the corner.");
    widgetKey.value = KEY;
    expect(renderToStaticMarkup(await Home())).toContain("Try it: ask the bot in the corner.");
    widgetKey.value = null;
  });

  it("builds the install snippet from appUrl()", () => {
    expect(html).toContain(`src=&quot;${APP_URL}/widget.js&quot;`);
    expect(html).not.toContain("example.com");
  });

  it("renders chat bubbles as text, not HTML", () => {
    expect(html).not.toContain("dangerouslySetInnerHTML");
    expect(html).toContain("&lt;script");
  });
});
