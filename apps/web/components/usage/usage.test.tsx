import type { ProjectUsage } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UsageLine } from "./usage-line";
import { UsagePanel } from "./usage-panel";

const usage = (used: number, limit = 100): ProjectUsage => ({
  projectId: "p1",
  used,
  limit,
  periodStart: "2026-11-05T00:00:00+00:00",
  periodEnd: "2026-12-05T00:00:00+00:00",
});

describe("UsagePanel", () => {
  it("shows N / limit messages this month, a bar and the reset date", () => {
    const html = renderToStaticMarkup(<UsagePanel usage={usage(42)} plan="free" />);
    expect(html).toContain("42 / 100");
    expect(html).toContain("messages this month");
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain('<time dateTime="2026-12-05T00:00:00+00:00">Dec 5, 2026</time>');
    expect(html).not.toContain("quota message");
    expect(html).not.toContain("Near limit");
  });

  it("near the limit: says so in words", () => {
    const html = renderToStaticMarkup(<UsagePanel usage={usage(85)} plan="free" />);
    expect(html).toContain("Near limit");
    expect(html).toContain('data-state="near"');
  });

  it("at the limit on Free: the quota message note and a link to Billing", () => {
    const html = renderToStaticMarkup(<UsagePanel usage={usage(100)} plan="free" />);
    expect(html).toContain("Limit reached");
    expect(html).toContain("The widget now shows visitors the quota message");
    expect(html).toContain('href="/dashboard/billing"');
    expect(html).toContain("2,000 messages a month");
  });

  it("at the limit on Pro: the note, no upgrade link", () => {
    const html = renderToStaticMarkup(<UsagePanel usage={usage(2000, 2000)} plan="pro" />);
    expect(html).toContain("The widget now shows visitors the quota message");
    expect(html).not.toContain("/dashboard/billing");
  });

  it("no usage: Usage unavailable, no number or bar", () => {
    const html = renderToStaticMarkup(<UsagePanel usage={null} plan={null} />);
    expect(html).toContain("Usage unavailable");
    expect(html).not.toContain('role="meter"');
  });
});

describe("UsageLine", () => {
  it("shows N / limit messages and a bar", () => {
    const html = renderToStaticMarkup(<UsageLine usage={usage(1234, 2000)} />);
    expect(html).toContain("1,234 / 2,000");
    expect(html).toContain("messages");
    expect(html).toContain('role="meter"');
  });

  it("at the limit: Limit reached in words", () => {
    expect(renderToStaticMarkup(<UsageLine usage={usage(100)} />)).toContain("Limit reached");
  });

  it("no usage: Usage unavailable", () => {
    const html = renderToStaticMarkup(<UsageLine usage={null} />);
    expect(html).toContain("Usage unavailable");
    expect(html).not.toContain('role="meter"');
  });
});
