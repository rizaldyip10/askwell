import { describe, expect, it } from "vitest";
import * as root from "./index";
import * as widget from "./widget";
import {
  APP_NAME,
  DEFAULT_WIDGET_CONFIG,
  isWidgetMessage,
  PUBLIC_KEY_PATTERN,
  WIDGET_ANIMATIONS,
  WIDGET_MESSAGE_TYPES,
  WIDGET_POSITIONS,
} from "./widget";

describe("DEFAULT_WIDGET_CONFIG", () => {
  it("has the product owner's values", () => {
    expect(DEFAULT_WIDGET_CONFIG).toEqual({
      buttonColor: "#0A0A0A",
      position: "bottom-right",
      label: "Ask us",
      animation: "fade",
      headerText: "How can we help?",
      showBadge: true,
    });
  });

  it("uses allowed enum values and is frozen", () => {
    expect(WIDGET_POSITIONS).toContain(DEFAULT_WIDGET_CONFIG.position);
    expect(WIDGET_ANIMATIONS).toContain(DEFAULT_WIDGET_CONFIG.animation);
    expect(Object.isFrozen(DEFAULT_WIDGET_CONFIG)).toBe(true);
  });
});

describe("@askwell/shared/widget", () => {
  it("exports the same values as the package root", () => {
    for (const [name, value] of Object.entries(widget)) {
      expect(root[name as keyof typeof root], name).toBe(value);
    }
  });

  it("keeps APP_NAME and PUBLIC_KEY_PATTERN unchanged", () => {
    expect(APP_NAME).toBe("Askwell");
    expect(PUBLIC_KEY_PATTERN.test("pk_a1b2c3d4e5f6a7b8c9d0e1f2")).toBe(true);
    expect(PUBLIC_KEY_PATTERN.test("pk_short")).toBe(false);
  });
});

describe("isWidgetMessage", () => {
  it("accepts every well-formed message", () => {
    expect(isWidgetMessage({ type: "askwell:ready" })).toBe(true);
    expect(isWidgetMessage({ type: "askwell:close" })).toBe(true);
    expect(isWidgetMessage({ type: "askwell:resize", height: 480 })).toBe(true);
    expect(isWidgetMessage({ type: "askwell:resize", height: 0 })).toBe(true);
    expect(isWidgetMessage({ type: "askwell:unread", count: 3 })).toBe(true);
    expect(isWidgetMessage({ type: "askwell:unread", count: 0 })).toBe(true);
  });

  it("covers every message type", () => {
    expect(WIDGET_MESSAGE_TYPES).toEqual(["askwell:ready", "askwell:close", "askwell:resize", "askwell:unread"]);
  });

  it("rejects non-objects", () => {
    for (const data of [null, undefined, "askwell:close", 1, true, ["askwell:close"]]) {
      expect(isWidgetMessage(data), String(data)).toBe(false);
    }
  });

  it("rejects unknown types", () => {
    expect(isWidgetMessage({})).toBe(false);
    expect(isWidgetMessage({ type: "close" })).toBe(false);
    expect(isWidgetMessage({ type: "askwell:open" })).toBe(false);
    expect(isWidgetMessage({ type: "ASKWELL:CLOSE" })).toBe(false);
    expect(isWidgetMessage({ type: 1 })).toBe(false);
  });

  it("rejects malformed resize payloads", () => {
    for (const height of [undefined, "480", -1, Number.NaN, Number.POSITIVE_INFINITY, null]) {
      expect(isWidgetMessage({ type: "askwell:resize", height }), String(height)).toBe(false);
    }
  });

  it("rejects malformed unread payloads", () => {
    for (const count of [undefined, "3", -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null]) {
      expect(isWidgetMessage({ type: "askwell:unread", count }), String(count)).toBe(false);
    }
  });
});
