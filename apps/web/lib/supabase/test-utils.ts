// Shared test setup for the Supabase client tests: captures what supabase-js sends
// instead of hitting the network.
import { afterEach, beforeEach, vi } from "vitest";

export const TEST_SUPABASE_URL = "https://example.supabase.co";

export const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

export function lastRequest() {
  const [input, init] = fetchMock.mock.calls.at(-1) ?? [];
  return { url: String(input), headers: new Headers(init?.headers) };
}

/** Stubs fetch and the given env vars for each test, and restores them afterwards. */
export function setupSupabaseTestEnv(env: Record<string, string>) {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", TEST_SUPABASE_URL);
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
}
