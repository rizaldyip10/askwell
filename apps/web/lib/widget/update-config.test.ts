import { describe, expect, it, vi } from "vitest";
import { toWidgetConfigUpdate } from "./update-config";

vi.mock("server-only", () => ({}));

describe("toWidgetConfigUpdate", () => {
  it("maps every field to its column", () => {
    expect(
      toWidgetConfigUpdate({
        buttonColor: "#112233",
        position: "top-left",
        label: "Help",
        animation: "slide",
        headerText: "Hi",
        showBadge: false,
      }),
    ).toEqual({
      button_color: "#112233",
      position: "top-left",
      label: "Help",
      animation: "slide",
      header_text: "Hi",
      show_badge: false,
    });
  });

  it("includes only the fields that were sent (a partial update never resets the rest)", () => {
    expect(toWidgetConfigUpdate({ buttonColor: "#112233" })).toEqual({ button_color: "#112233" });
    expect(toWidgetConfigUpdate({ showBadge: false })).toEqual({ show_badge: false });
  });
});
