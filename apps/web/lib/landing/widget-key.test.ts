import { afterEach, describe, expect, it, vi } from "vitest";
import { landingWidgetKey } from "./widget-key";

vi.mock("server-only", () => ({}));

const KEY = "pk_a1b2c3d4e5f6a7b8c9d0e1f2";
const env = (value: string | undefined) => ({ LANDING_WIDGET_KEY: value }) as unknown as NodeJS.ProcessEnv;

describe("landingWidgetKey", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the key when it is set", () => {
    expect(landingWidgetKey(env(KEY))).toBe(KEY);
  });

  it("trims whitespace", () => {
    expect(landingWidgetKey(env(`  ${KEY}\n`))).toBe(KEY);
  });

  it.each([undefined, "", "   "])("returns null without a warning for %j", (value) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(landingWidgetKey(env(value))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns null and warns on the server for a value that isn't a public key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(landingWidgetKey(env("sk_live_secret"))).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("sk_live_secret");
  });

  it("reads process.env on every call (request time, not build time)", () => {
    vi.stubEnv("LANDING_WIDGET_KEY", KEY);
    expect(landingWidgetKey()).toBe(KEY);
    vi.stubEnv("LANDING_WIDGET_KEY", "");
    expect(landingWidgetKey()).toBeNull();
    vi.unstubAllEnvs();
  });
});
