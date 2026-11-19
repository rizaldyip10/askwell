import { describe, expect, it } from "vitest";
import { normalizeHostOrigin, parseEmbedParams } from "./origin";

const KEY = "pk_abcdefghijklmnop";

describe("normalizeHostOrigin", () => {
  it.each([
    ["https://example.com", "https://example.com"],
    ["https://example.com/some/path?q=1#x", "https://example.com"],
    ["http://localhost:3000/", "http://localhost:3000"],
    ["HTTPS://Example.COM:443", "https://example.com"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeHostOrigin(raw)).toBe(expected);
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "ftp://example.com", "not a url", ""])(
    "rejects %s",
    (raw) => {
      expect(normalizeHostOrigin(raw)).toBeNull();
    },
  );
});

describe("parseEmbedParams", () => {
  it("accepts a good key and origin, keeping only the origin", () => {
    expect(parseEmbedParams({ key: KEY, origin: "https://example.com/page" })).toEqual({
      key: KEY,
      origin: "https://example.com",
    });
  });

  it.each([
    {},
    { key: KEY },
    { origin: "https://example.com" },
    { key: "pk_short", origin: "https://example.com" },
    { key: "sk_abcdefghijklmnop", origin: "https://example.com" },
    { key: KEY, origin: "javascript:alert(1)" },
    { key: KEY, origin: "nope" },
    { key: [KEY, KEY], origin: "https://example.com" },
  ])("rejects %j", (params) => {
    expect(parseEmbedParams(params)).toBeNull();
  });
});
