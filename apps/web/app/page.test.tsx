import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { APP_NAME } from "@askwell/shared";
import Home from "./page";

describe("home page", () => {
  it("renders APP_NAME", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain(APP_NAME);
  });
});
