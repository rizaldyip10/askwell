import { describe, expect, it } from "vitest";
import { embedQuerySchema } from "../index";

const KEY = "pk_a1b2c3d4e5f6a7b8c9d0e1f2";

describe("embedQuerySchema", () => {
  it("accepts a key and the host origin", () => {
    expect(embedQuerySchema.parse({ key: KEY, origin: "https://example.com" })).toEqual({
      key: KEY,
      origin: "https://example.com",
    });
    expect(embedQuerySchema.safeParse({ key: KEY, origin: "http://localhost:3000" }).success).toBe(true);
  });

  it("rejects a bad key", () => {
    expect(embedQuerySchema.safeParse({ key: "pk_short", origin: "https://example.com" }).success).toBe(false);
    expect(embedQuerySchema.safeParse({ origin: "https://example.com" }).success).toBe(false);
  });

  it("rejects a missing or non-URL origin", () => {
    expect(embedQuerySchema.safeParse({ key: KEY }).success).toBe(false);
    expect(embedQuerySchema.safeParse({ key: KEY, origin: "" }).success).toBe(false);
    expect(embedQuerySchema.safeParse({ key: KEY, origin: "example.com" }).success).toBe(false);
  });
});
