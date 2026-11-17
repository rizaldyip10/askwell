import { describe, expect, it } from "vitest";
import { APP_NAME } from "./index";

describe("APP_NAME", () => {
  it("is a non-empty string", () => {
    expect(typeof APP_NAME).toBe("string");
    expect(APP_NAME.trim().length).toBeGreaterThan(0);
  });
});
