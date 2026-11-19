import { describe, expect, it, vi } from "vitest";
import { closeOnEscape, isTrustedHostMessage, postToHost } from "./messaging";

const ORIGIN = "https://example.com";

describe("postToHost", () => {
  it("posts to the host origin, never *", () => {
    const target = { postMessage: vi.fn() };
    postToHost(target, ORIGIN, { type: "askwell:close" });
    expect(target.postMessage).toHaveBeenCalledWith({ type: "askwell:close" }, ORIGIN);
    expect(target.postMessage).not.toHaveBeenCalledWith(expect.anything(), "*");
  });
});

describe("isTrustedHostMessage", () => {
  it("accepts a widget message from the host origin", () => {
    expect(isTrustedHostMessage({ origin: ORIGIN, data: { type: "askwell:ready" } }, ORIGIN)).toBe(true);
  });

  it.each(["https://evil.com", "http://example.com", "https://example.com:8443", "null", "*"])(
    "rejects origin %s",
    (origin) => {
      expect(isTrustedHostMessage({ origin, data: { type: "askwell:ready" } }, ORIGIN)).toBe(false);
    },
  );

  it.each([null, "askwell:close", { type: "other" }, { type: "askwell:unread", count: -1 }, { type: "askwell:resize" }])(
    "rejects data %j",
    (data) => {
      expect(isTrustedHostMessage({ origin: ORIGIN, data }, ORIGIN)).toBe(false);
    },
  );
});

describe("closeOnEscape", () => {
  it("posts askwell:close to the host origin only", () => {
    const target = { postMessage: vi.fn() };
    closeOnEscape(target, ORIGIN)({ key: "Escape" });
    expect(target.postMessage).toHaveBeenCalledTimes(1);
    expect(target.postMessage).toHaveBeenCalledWith({ type: "askwell:close" }, ORIGIN);
  });

  it.each(["Enter", "a", "Esc"])("ignores %s", (key) => {
    const target = { postMessage: vi.fn() };
    closeOnEscape(target, ORIGIN)({ key });
    expect(target.postMessage).not.toHaveBeenCalled();
  });
});
