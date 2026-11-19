import { describe, expect, it, vi } from "vitest";
import { isTrustedHostMessage, postToHost } from "./messaging";

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
