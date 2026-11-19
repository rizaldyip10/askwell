import { APP_NAME, DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageBubble } from "../../components/embed/message-bubble";
import EmbedPage from "./page";

const KEY = "pk_abcdefghijklmnop";

async function render(params: Record<string, string | undefined>): Promise<string> {
  const element = await EmbedPage({ searchParams: Promise.resolve(params) });
  return element ? renderToStaticMarkup(element) : "";
}

describe("/embed", () => {
  it("renders the panel with the default header and badge", async () => {
    const html = await render({ key: KEY, origin: "https://example.com" });
    expect(html).toContain(DEFAULT_WIDGET_CONFIG.headerText);
    expect(html).toContain(`Powered by ${APP_NAME}`);
    expect(html).toContain('maxLength="1000"');
  });

  it.each([{}, { key: KEY }, { key: "bad", origin: "https://example.com" }, { key: KEY, origin: "javascript:alert(1)" }])(
    "renders nothing for %j",
    async (params) => {
      expect(await render(params)).toBe("");
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
