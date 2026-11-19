import { PUBLIC_KEY_PATTERN, publicKeySchema } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { generatePublicKey } from "./public-key";

describe("generatePublicKey", () => {
  it("is pk_ + 32 base62 characters and matches the shared pattern and schema", () => {
    for (let i = 0; i < 200; i++) {
      const key = generatePublicKey();
      expect(key).toMatch(/^pk_[0-9A-Za-z]{32}$/);
      expect(PUBLIC_KEY_PATTERN.test(key)).toBe(true);
      expect(publicKeySchema.safeParse(key).success).toBe(true);
    }
  });

  it("is random: no repeats across many keys", () => {
    const keys = new Set(Array.from({ length: 2000 }, generatePublicKey));
    expect(keys.size).toBe(2000);
  });

  it("uses the whole base62 alphabet", () => {
    const seen = new Set(Array.from({ length: 300 }, generatePublicKey).join(""));
    for (const ch of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz") expect(seen).toContain(ch);
  });
});
