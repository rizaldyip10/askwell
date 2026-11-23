import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomizeView } from "./customize-view";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const STORED = { ...DEFAULT_WIDGET_CONFIG, buttonColor: "#e11d48", position: "top-left" as const, label: "Talk to us" };

describe("CustomizeView", () => {
  it("Free: the form is shown but locked, with an upgrade prompt to Billing", () => {
    const html = renderToStaticMarkup(<CustomizeView projectId={ID} canCustomize={false} initial={{ ...DEFAULT_WIDGET_CONFIG }} />);
    expect(html).toMatch(/<fieldset disabled=""/);
    expect(html).toContain("Customizing the widget is a Pro feature");
    expect(html).toMatch(/href="\/dashboard\/billing"[^>]*>Upgrade to Pro/);
    // Every field is there, inside the disabled fieldset.
    for (const label of ["Button color", "Position", "Button label", "Open animation", "Header text"]) {
      expect(html).toContain(label);
    }
    // The preview shows today's look: the defaults with the badge.
    expect(html).toMatch(/background:#0A0A0A/);
    expect(html).toContain("Powered by");
  });

  it("Pro: the form is editable, with no upgrade prompt, and shows the stored look", () => {
    const html = renderToStaticMarkup(<CustomizeView projectId={ID} canCustomize initial={STORED} />);
    expect(html).not.toMatch(/<fieldset disabled=""/);
    expect(html).not.toContain("Upgrade to Pro");
    expect(html).toContain('value="#e11d48"');
    expect(html).toContain('data-position="top-left"');
    expect(html).toContain("Talk to us");
    expect(html).toContain("Reset to defaults");
  });

  it("renders a stored label as text, never HTML", () => {
    const html = renderToStaticMarkup(
      <CustomizeView projectId={ID} canCustomize initial={{ ...STORED, label: "<script>alert(1)</script>" }} />,
    );
    expect(html).not.toContain("<script>");
  });
});
