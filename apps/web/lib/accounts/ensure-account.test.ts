import { describe, expect, it, vi } from "vitest";
import { fetchMock, TEST_SUPABASE_URL, setupSupabaseTestEnv } from "../supabase/test-utils";
import { EnsureAccountError, ensureAccount } from "./ensure-account";

// `server-only` throws outside a React Server Components build; neutralise it for tests.
vi.mock("server-only", () => ({}));

const SECRET = "sb_secret_test";
setupSupabaseTestEnv({ SUPABASE_SECRET_KEY: SECRET });

/** The request supabase-js sent (fetch is mocked, nothing hits the network). */
function sentRequest() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [input, init] = fetchMock.mock.calls[0]!;
  const url = new URL(String(input));
  const headers = new Headers(init?.headers);
  return { url, method: init?.method, headers, body: JSON.parse(String(init?.body)) as unknown };
}

describe("ensureAccount", () => {
  it("inserts a new user's row with plan free, through the service client", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));

    await ensureAccount("user_new");

    const { url, method, headers, body } = sentRequest();
    expect(method).toBe("POST");
    expect(`${url.origin}${url.pathname}`).toBe(`${TEST_SUPABASE_URL}/rest/v1/accounts`);
    expect(body).toEqual({ clerk_user_id: "user_new", plan: "free" });
    expect(headers.get("apikey")).toBe(SECRET); // secret key = service_role, not an owner token
  });

  it("ignores an existing row instead of overwriting its plan", async () => {
    // PostgREST answers 201 with no rows when ON CONFLICT DO NOTHING skips the insert.
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));

    await expect(ensureAccount("user_pro")).resolves.toBeUndefined();

    const { url, headers } = sentRequest();
    expect(url.searchParams.get("on_conflict")).toBe("clerk_user_id");
    const prefer = headers.get("prefer") ?? "";
    expect(prefer).toContain("resolution=ignore-duplicates"); // ON CONFLICT DO NOTHING
    expect(prefer).not.toContain("merge-duplicates"); // never ON CONFLICT DO UPDATE (would reset plan)
  });

  it("surfaces a database error", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ code: "42501", message: "permission denied for table accounts", details: null, hint: null }, { status: 403 }),
    );

    const result = ensureAccount("user_x");
    await expect(result).rejects.toBeInstanceOf(EnsureAccountError);
    await expect(result).rejects.toThrow(/permission denied for table accounts/);
  });

  it("surfaces a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(ensureAccount("user_x")).rejects.toBeInstanceOf(EnsureAccountError);
  });

  it("refuses an empty user ID without calling the database", async () => {
    await expect(ensureAccount("")).rejects.toBeInstanceOf(EnsureAccountError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses an injected client when given one", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const client = { from: vi.fn(() => ({ upsert })) };

    await ensureAccount("user_inj", client as never);

    expect(client.from).toHaveBeenCalledWith("accounts");
    expect(upsert).toHaveBeenCalledWith(
      { clerk_user_id: "user_inj", plan: "free" },
      { onConflict: "clerk_user_id", ignoreDuplicates: true },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
