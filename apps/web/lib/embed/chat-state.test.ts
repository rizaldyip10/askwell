import { describe, expect, it } from "vitest";
import { chatReducer, INITIAL_CHAT_STATE } from "./chat-state";

describe("chatReducer", () => {
  it("sent → waiting, replied → reply + conversation ID", () => {
    let s = chatReducer(INITIAL_CHAT_STATE, { type: "sent", id: "1", text: "Hi" });
    expect(s.waiting).toBe(true);
    s = chatReducer(s, { type: "replied", id: "2", text: "Hello", conversationId: "c1" });
    expect(s).toEqual({
      waiting: false,
      conversationId: "c1",
      messages: [
        { id: "1", role: "visitor", text: "Hi" },
        { id: "2", role: "bot", text: "Hello" },
      ],
    });
  });

  it("failed → stops waiting, adds an error message, keeps the conversation", () => {
    let s = chatReducer({ ...INITIAL_CHAT_STATE, conversationId: "c1" }, { type: "sent", id: "1", text: "Hi" });
    s = chatReducer(s, { type: "failed", id: "2", text: "Something went wrong, try again." });
    expect(s.waiting).toBe(false);
    expect(s.conversationId).toBe("c1");
    expect(s.messages.at(-1)).toEqual({ id: "2", role: "error", text: "Something went wrong, try again." });
  });

  it("failed with resetConversation → drops the conversation", () => {
    let s = chatReducer({ ...INITIAL_CHAT_STATE, conversationId: "c1" }, { type: "sent", id: "1", text: "Hi" });
    s = chatReducer(s, { type: "failed", id: "2", text: "Restarted", resetConversation: true });
    expect(s.waiting).toBe(false);
    expect(s.conversationId).toBeUndefined();
    expect(s.messages).toHaveLength(2);
  });
});
