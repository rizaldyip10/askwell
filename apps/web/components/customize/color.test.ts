import { describe, expect, it } from "vitest";
import { readableTextColor as loaderRule } from "../../../widget/src/color";
import { readableTextColor } from "./color";

describe("readableTextColor", () => {
  it.each(["#0A0A0A", "#ffffff", "#e11d48", "#facc15", "#1d4ed8", "#22c55e", "#777777", "#000000"])(
    "matches the widget loader for %s",
    (color) => {
      expect(readableTextColor(color)).toBe(loaderRule(color));
    },
  );

  it("is white on dark and black on light", () => {
    expect(readableTextColor("#0A0A0A")).toBe("#ffffff");
    expect(readableTextColor("#facc15")).toBe("#000000");
  });
});
