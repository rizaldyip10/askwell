import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOwnerClient } from "./owner";
import { lastRequest, TEST_SUPABASE_URL, setupSupabaseTestEnv } from "./test-utils";

// `server-only` throws outside a React Server Components build; neutralise it for tests.
vi.mock("server-only", () => ({}));

const getToken = vi.fn<() => Promise<string | null>>();
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ getToken })),
}));

const PUBLISHABLE = "sb_publishable_test";

setupSupabaseTestEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE });

beforeEach(() => {
  getToken.mockReset();
});

describe("createOwnerClient", () => {
  it("sends the owner's Clerk session token and the publishable key", async () => {
    getToken.mockResolvedValue("clerk.session.token");

    await createOwnerClient().from("accounts").select("*");

    const { url, headers } = lastRequest();
    expect(url).toBe(`${TEST_SUPABASE_URL}/rest/v1/accounts?select=*`);
    expect(headers.get("authorization")).toBe("Bearer clerk.session.token");
    expect(headers.get("apikey")).toBe(PUBLISHABLE);
    expect(getToken).toHaveBeenCalled();
  });

  it("fetches a fresh token for each request", async () => {
    // supabase-js may also call accessToken outside requests (e.g. for Realtime), so switch
    // the token between requests instead of counting calls.
    getToken.mockResolvedValue("token-1");
    const client = createOwnerClient();

    await client.from("projects").select("id");
    expect(lastRequest().headers.get("authorization")).toBe("Bearer token-1");
    getToken.mockResolvedValue("token-2");
    await client.from("projects").select("id");
    expect(lastRequest().headers.get("authorization")).toBe("Bearer token-2");
  });

  it("sends no user token when nobody is signed in", async () => {
    getToken.mockResolvedValue(null);

    await createOwnerClient().from("accounts").select("*");

    expect(lastRequest().headers.get("authorization")).not.toMatch(/clerk/);
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])(
    "throws a clear error at call time (not import time) when %s is missing",
    (name) => {
      vi.stubEnv(name, "");
      expect(() => createOwnerClient()).toThrow(new RegExp(`createOwnerClient\\(\\) needs ${name}\\.`));
    },
  );
});
