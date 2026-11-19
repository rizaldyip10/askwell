import { APP_NAME, DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageBubble } from "../../components/embed/message-bubble";
import { getWidgetConfigByKey } from "../../lib/widget/config";
import EmbedPage from "./page";

vi.mock("../../lib/widget/config", () => ({ getWidgetConfigByKey: vi.fn() }));
const lookup = vi.mocked(getWidgetConfigByKey);

const KEY = "pk_abcdefghijklmnop";
const PRO: WidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  headerText: "Questions? We're here",
  showBadge: false,
};

async function render(params: Record<string, string | undefined>): Promise<string> {
  const element = await EmbedPage({ searchParams: Promise.resolve(params) });
  return element ? renderToStaticMarkup(element) : "";
}

beforeEach(() => {
  lookup.mockReset();
});

describe("/embed", () => {
  it("renders a Free project's config: defaults and the badge", async () => {
    lookup.mockResolvedValue({ ...DEFAULT_WIDGET_CONFIG });
    const html = await render({ key: KEY, origin: "https://example.com" });
    expect(lookup).toHaveBeenCalledWith(KEY);
    expect(html).toContain(DEFAULT_WIDGET_CONFIG.headerText);
    expect(html).toContain(`Powered by ${APP_NAME}`);
    expect(html).toContain('maxLength="1000"');
  });

  it("renders the project's own config", async () => {
    lookup.mockResolvedValue(PRO);
    const html = await render({ key: KEY, origin: "https://example.com" });
    expect(html).toContain("Questions? We&#x27;re here");
    expect(html).not.toContain("Powered by");
  });

  it("renders nothing for an unknown key", async () => {
    lookup.mockResolvedValue(null);
    expect(await render({ key: KEY, origin: "https://example.com" })).toBe("");
  });

  it("renders nothing when the lookup fails", async () => {
    lookup.mockRejectedValue(new Error("db down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await render({ key: KEY, origin: "https://example.com" })).toBe("");
    expect(log).toHaveBeenCalled();
  });

  it.each([{}, { key: KEY }, { key: "bad", origin: "https://example.com" }, { key: KEY, origin: "javascript:alert(1)" }])(
    "renders nothing, without a lookup, for %j",
    async (params) => {
      expect(await render(params)).toBe("");
      expect(lookup).not.toHaveBeenCalled();
    },
  );
});

describe("MessageBubble", () => {
  it("renders HTML in a message as literal text", () => {
    const text = "<b>hi</b><img src=x onerror=alert(1)>";
    const html = renderToStaticMarkup(<MessageBubble message={{ id: "1", role: "visitor", text }} />);
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;&lt;img src=x onerror=alert(1)&gt;");
  });
});
