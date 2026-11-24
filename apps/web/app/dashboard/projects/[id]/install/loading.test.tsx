import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import InstallLoading from "./loading";

describe("Install loading state", () => {
  it("announces loading and draws the three steps", () => {
    const html = renderToStaticMarkup(<InstallLoading />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading install steps…");
    expect(html.match(/size-7 shrink-0 rounded-pill/g)).toHaveLength(3);
  });
});
