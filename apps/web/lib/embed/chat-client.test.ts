import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatError,
  chatErrorMessage,
  GENERIC_ERROR_MESSAGE,
  MOCK_DELAY_MS,
  MOCK_REPLY,
  sendChatMessage,
} from "./chat-client";

const base = { key: "pk_abcdefghijklmnop", visitorId: crypto.randomUUID(), message: "Hi" };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("sendChatMessage (mock)", () => {
  it("replies with the preview text after the delay", async () => {
    let settled = false;
    const pending = sendChatMessage(base).then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(MOCK_DELAY_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;
    expect(res.reply).toBe(MOCK_REPLY);
    expect(res.reply).toMatch(/preview/i);
  });

  it("makes a conversation ID, then keeps it", async () => {
    const first = sendChatMessage(base);
    await vi.advanceTimersByTimeAsync(MOCK_DELAY_MS);
    const { conversationId } = await first;
    expect(conversationId).toMatch(/^[0-9a-f-]{36}$/);

    const second = sendChatMessage({ ...base, conversationId });
    await vi.advanceTimersByTimeAsync(MOCK_DELAY_MS);
    expect((await second).conversationId).toBe(conversationId);
  });
});

describe("chatErrorMessage", () => {
  it("is generic for unknown errors", () => {
    expect(chatErrorMessage(new Error("boom"))).toBe(GENERIC_ERROR_MESSAGE);
    expect(chatErrorMessage("x")).toBe(GENERIC_ERROR_MESSAGE);
    expect(chatErrorMessage(new ChatError("internal", "db down"))).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("has friendly text for rate limit and quota", () => {
    expect(chatErrorMessage(new ChatError("rate_limited", "x"))).toMatch(/too fast/);
    expect(chatErrorMessage(new ChatError("quota_exceeded", "x"))).toMatch(/isn't available/);
  });

  it("never shows the server's raw message", () => {
    expect(chatErrorMessage(new ChatError("internal", "secret stack trace"))).not.toContain("secret");
  });
});
