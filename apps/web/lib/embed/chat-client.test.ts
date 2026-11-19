import { API_ERROR_CODES } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_ENDPOINT,
  ChatError,
  chatErrorMessage,
  GENERIC_ERROR_MESSAGE,
  QUOTA_MESSAGE,
  RATE_LIMITED_MESSAGE,
  REPHRASE_MESSAGE,
  RESTARTED_MESSAGE,
  sendChatMessage,
  shouldResetConversation,
} from "./chat-client";

const base = { key: "pk_abcdefghijklmnop", visitorId: crypto.randomUUID(), message: "Hi" };
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function caught(promise: Promise<unknown>): Promise<ChatError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ChatError);
  return error as ChatError;
}

describe("sendChatMessage", () => {
  it("POSTs the typed request as JSON to the same-origin route and returns the reply", async () => {
    fetchMock.mockResolvedValue(Response.json({ conversationId: "c1", reply: "Hello" }));
    const req = { ...base, conversationId: crypto.randomUUID() };

    expect(await sendChatMessage(req)).toEqual({ conversationId: "c1", reply: "Hello" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(CHAT_ENDPOINT);
    expect(CHAT_ENDPOINT).toBe("/api/widget/chat");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual(req);
  });

  it("maps every API error code in the { error } body to ChatError(code, message)", async () => {
    for (const code of API_ERROR_CODES) {
      fetchMock.mockResolvedValueOnce(Response.json({ error: { code, message: `m-${code}` } }, { status: 400 }));
      const error = await caught(sendChatMessage(base));
      expect(error.code).toBe(code);
      expect(error.message).toBe(`m-${code}`);
    }
  });

  it("maps the route's real statuses", async () => {
    const cases = [
      [429, "rate_limited"],
      [429, "quota_exceeded"],
      [400, "validation_error"],
      [404, "not_found"],
      [413, "validation_error"],
      [500, "internal"],
    ] as const;
    for (const [status, code] of cases) {
      fetchMock.mockResolvedValueOnce(Response.json({ error: { code, message: "x" } }, { status }));
      expect((await caught(sendChatMessage(base))).code).toBe(code);
    }
  });

  it("throws a generic ChatError on a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await caught(sendChatMessage(base));
    expect(error.code).toBe("internal");
    expect(chatErrorMessage(error)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("throws a generic ChatError on an error without the API shape, or a malformed success", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
    expect((await caught(sendChatMessage(base))).code).toBe("internal");
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "teapot", message: "x" } }, { status: 418 }));
    expect((await caught(sendChatMessage(base))).code).toBe("internal");
    fetchMock.mockResolvedValueOnce(Response.json({ reply: 42 }));
    expect((await caught(sendChatMessage(base))).code).toBe("internal");
  });
});

describe("chatErrorMessage", () => {
  it("is generic for unknown errors and other codes", () => {
    expect(chatErrorMessage(new Error("boom"))).toBe(GENERIC_ERROR_MESSAGE);
    expect(chatErrorMessage("x")).toBe(GENERIC_ERROR_MESSAGE);
    expect(chatErrorMessage(new ChatError("internal", "db down"))).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("has friendly text for rate limit, quota, refusal and a lost conversation", () => {
    expect(chatErrorMessage(new ChatError("rate_limited", "x"))).toBe(RATE_LIMITED_MESSAGE);
    expect(RATE_LIMITED_MESSAGE).toMatch(/too fast/);
    expect(chatErrorMessage(new ChatError("quota_exceeded", "x"))).toBe(QUOTA_MESSAGE);
    // The injection refusal is a 400 validation_error from the route.
    expect(chatErrorMessage(new ChatError("validation_error", "x"))).toBe(REPHRASE_MESSAGE);
    expect(chatErrorMessage(new ChatError("not_found", "x"))).toBe(RESTARTED_MESSAGE);
  });

  it("never shows the server's raw message", () => {
    for (const code of API_ERROR_CODES) {
      expect(chatErrorMessage(new ChatError(code, "secret stack trace"))).not.toContain("secret");
    }
  });
});

describe("shouldResetConversation", () => {
  it("is true only for not_found", () => {
    expect(shouldResetConversation(new ChatError("not_found", "x"))).toBe(true);
    for (const code of API_ERROR_CODES.filter((c) => c !== "not_found")) {
      expect(shouldResetConversation(new ChatError(code, "x"))).toBe(false);
    }
    expect(shouldResetConversation(new Error("x"))).toBe(false);
  });
});
