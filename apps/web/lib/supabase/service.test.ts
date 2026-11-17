import { describe, expect, it, vi } from "vitest";
import { createServiceClient } from "./service";
import { lastRequest, TEST_SUPABASE_URL, setupSupabaseTestEnv } from "./test-utils";

// `server-only` throws outside a React Server Components build; neutralise it for tests.
vi.mock("server-only", () => ({}));

const getToken = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ getToken })),
}));

const SECRET = "sb_secret_test";

setupSupabaseTestEnv({ SUPABASE_SECRET_KEY: SECRET });

describe("createServiceClient", () => {
  it("authenticates with the secret key, never a user token", async () => {
    await createServiceClient().from("accounts").select("*");

    const { url, headers } = lastRequest();
    expect(url).toBe(`${TEST_SUPABASE_URL}/rest/v1/accounts?select=*`);
    expect(headers.get("apikey")).toBe(SECRET);
    expect(getToken).not.toHaveBeenCalled();
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"])(
    "throws a clear error at call time (not import time) when %s is missing",
    (name) => {
      vi.stubEnv(name, "");
      expect(() => createServiceClient()).toThrow(new RegExp(`createServiceClient\\(\\) needs ${name}\\.`));
    },
  );

  it("names every missing variable in one error", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(() => createServiceClient()).toThrow(/needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY\./);
  });
});
