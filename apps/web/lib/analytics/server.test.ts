import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const afterMock = vi.fn<(task: () => unknown) => void>();
vi.mock("next/server", () => ({ after: (task: () => unknown) => afterMock(task) }));

const captureImmediate = vi.fn<(msg: unknown) => Promise<void>>();
const captureExceptionImmediate = vi.fn<(...args: unknown[]) => Promise<void>>();
const ctor = vi.fn();
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(...args: unknown[]) {
      ctor(...args);
    }
    captureImmediate = captureImmediate;
    captureExceptionImmediate = captureExceptionImmediate;
  },
}));

async function load(withKey: boolean) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", withKey ? "phc_test" : "");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", withKey ? "https://us.i.posthog.com" : "");
  return import("./server");
}

beforeEach(() => {
  afterMock.mockReset();
  captureImmediate.mockReset().mockResolvedValue(undefined);
  captureExceptionImmediate.mockReset().mockResolvedValue(undefined);
  ctor.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("captureServer", () => {
  it("is a no-op without a key", async () => {
    const { captureServer } = await load(false);
    captureServer("project_created", "user_1", { plan: "free" });
    expect(ctor).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("sends after the response, with one client per process", async () => {
    const { captureServer } = await load(true);
    captureServer("project_created", "user_1", { plan: "free" });
    captureServer("knowledge_added", "user_1");
    expect(ctor).toHaveBeenCalledOnce();
    expect(ctor).toHaveBeenCalledWith(
      "phc_test",
      // One bounded attempt: no retry or request outlives SEND_TIMEOUT_MS.
      expect.objectContaining({ host: "https://us.i.posthog.com", requestTimeout: 2000, fetchRetryCount: 0 }),
    );
    expect(captureImmediate).not.toHaveBeenCalled(); // nothing sent during the request

    await Promise.all(afterMock.mock.calls.map(([task]) => task()));
    expect(captureImmediate).toHaveBeenCalledWith({ event: "project_created", distinctId: "user_1", properties: { plan: "free" } });
    expect(captureImmediate).toHaveBeenCalledWith({ event: "knowledge_added", distinctId: "user_1", properties: {} });
  });

  it("sends right away outside a request scope", async () => {
    afterMock.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    const { captureServer } = await load(true);
    expect(() => captureServer("upgraded", "user_1")).not.toThrow();
    await vi.waitFor(() => expect(captureImmediate).toHaveBeenCalledOnce());
  });

  it("never throws when the send fails", async () => {
    captureImmediate.mockRejectedValue(new Error("network down"));
    const { captureServer } = await load(true);
    captureServer("first_chat", "user_1");
    await expect(afterMock.mock.calls[0]![0]()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it("never throws when the client blows up synchronously", async () => {
    captureImmediate.mockImplementation(() => {
      throw new Error("boom");
    });
    const { captureServer } = await load(true);
    captureServer("first_chat", "user_1");
    await expect(afterMock.mock.calls[0]![0]()).resolves.toBeUndefined();
  });

  it("gives up on a stalled send after the timeout", async () => {
    vi.useFakeTimers();
    captureImmediate.mockReturnValue(new Promise(() => {}));
    const { captureServer, SEND_TIMEOUT_MS } = await load(true);
    captureServer("signed_up", "user_1");
    const done = afterMock.mock.calls[0]![0]();
    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
    await expect(done).resolves.toBeUndefined();
  });
});

describe("captureServerException", () => {
  it("is a no-op without a key", async () => {
    const { captureServerException } = await load(false);
    await captureServerException(new Error("x"), "user_1");
    expect(ctor).not.toHaveBeenCalled();
  });

  it("sends with the known distinct ID", async () => {
    const { captureServerException } = await load(true);
    const error = new Error("x");
    await captureServerException(error, "anon-1", { path: "/dashboard" });
    expect(captureExceptionImmediate).toHaveBeenCalledWith(error, "anon-1", { path: "/dashboard" });
  });

  it("sends personless with a random ID when the visitor is unknown", async () => {
    const { captureServerException } = await load(true);
    await captureServerException(new Error("x"), null, { path: "/api/x" });
    const [, distinctId, props] = captureExceptionImmediate.mock.calls[0]!;
    expect(distinctId).toEqual(expect.any(String));
    expect(distinctId).not.toBe("");
    expect(props).toEqual({ path: "/api/x", $process_person_profile: false });
  });

  it("never throws when the send fails", async () => {
    captureExceptionImmediate.mockRejectedValue(new Error("network down"));
    const { captureServerException } = await load(true);
    await expect(captureServerException(new Error("x"), "u")).resolves.toBeUndefined();
  });
});

describe("distinctIdFromHeaders", () => {
  it("reads the tracing header from a record or Headers", async () => {
    const { distinctIdFromHeaders } = await load(false);
    expect(distinctIdFromHeaders({ "x-posthog-distinct-id": "abc" })).toBe("abc");
    expect(distinctIdFromHeaders({ "x-posthog-distinct-id": ["abc", "def"] })).toBe("abc");
    expect(distinctIdFromHeaders(new Headers({ "X-PostHog-Distinct-Id": "abc" }))).toBe("abc");
  });

  it("ignores a missing, blank or oversized header", async () => {
    const { distinctIdFromHeaders } = await load(false);
    expect(distinctIdFromHeaders({})).toBeNull();
    expect(distinctIdFromHeaders({ "x-posthog-distinct-id": " " })).toBeNull();
    expect(distinctIdFromHeaders({ "x-posthog-distinct-id": "a".repeat(201) })).toBeNull();
  });
});
