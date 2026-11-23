import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { closedTransform, WidgetPreview } from "./widget-preview";

const render = (config: Partial<WidgetConfig>) =>
  renderToStaticMarkup(<WidgetPreview config={{ ...DEFAULT_WIDGET_CONFIG, ...config }} />);

describe("WidgetPreview", () => {
  it("draws the button in the chosen color, corner and label", () => {
    const html = render({ buttonColor: "#e11d48", position: "top-left", label: "Talk to us" });
    expect(html).toContain('data-position="top-left"');
    expect(html).toMatch(/background:#e11d48/);
    expect(html).toMatch(/color:#ffffff/); // readable on red
    expect(html).toContain("Talk to us");
    expect(html).toMatch(/left-4 top-4/);
  });

  it("updates with the config: header text, animation, badge", () => {
    const withBadge = render({ headerText: "Need a hand?", animation: "slide", showBadge: true });
    expect(withBadge).toContain("Need a hand?");
    expect(withBadge).toContain('data-animation="slide"');
    expect(withBadge).toContain("Powered by");
    expect(render({ showBadge: false })).not.toContain("Powered by");
  });

  it("renders label and header text as text, never HTML", () => {
    const html = render({ label: "<script>alert(1)</script>", headerText: "<img src=x onerror=alert(1)>" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("is inert, with no heading of its own (the page has the h1)", () => {
    const html = render({});
    expect(html).toMatch(/<div inert=""/);
    expect(html).not.toContain("<h1");
  });
});

describe("closedTransform", () => {
  it("matches the loader's closed states", () => {
    expect(closedTransform("fade", "bottom-right")).toBe("none");
    expect(closedTransform("scale", "top-left")).toBe("scale(0.92)");
    expect(closedTransform("slide", "bottom-left")).toBe("translateY(16px)");
    expect(closedTransform("slide", "top-right")).toBe("translateY(-16px)");
  });
});
