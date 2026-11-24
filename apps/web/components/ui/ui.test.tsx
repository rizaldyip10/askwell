import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buttonClasses } from "./button";
import { CodeBlock } from "./code-block";
import { TAP_HEIGHT, TAP_MIN, TAP_SIZE } from "./tap-target";

describe("tap targets", () => {
  it("are 44 px (h-11 / size-11) on phones and touch screens", () => {
    expect(TAP_HEIGHT.split(" ").sort()).toEqual(["any-pointer-coarse:h-11", "max-sm:h-11"]);
    expect(TAP_SIZE.split(" ").sort()).toEqual(["any-pointer-coarse:size-11", "max-sm:size-11"]);
    expect(TAP_MIN).toContain("max-sm:min-h-11");
    expect(TAP_MIN).toContain("any-pointer-coarse:min-w-11");
  });

  it("apply to the default (md) button and keep its desktop height", () => {
    const md = buttonClasses({ size: "md" });
    expect(md).toContain("h-10");
    expect(md).toContain(TAP_HEIGHT);
  });
});

describe("CodeBlock", () => {
  it("scrolls sideways by default", () => {
    expect(renderToStaticMarkup(<CodeBlock code="x" />)).toContain("overflow-x-auto");
  });

  it("wraps long lines with `wrap`, so the code fits a 375 px screen", () => {
    const html = renderToStaticMarkup(<CodeBlock code="x" wrap />);
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("wrap-anywhere");
    expect(html).not.toContain("overflow-x-auto");
  });
});
