import type { WidgetChatRequest, WidgetChatResponse } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { ChatError, RATE_LIMITED_MESSAGE, RESTARTED_MESSAGE } from "./chat-client";
import { chatReducer, INITIAL_CHAT_STATE, type ChatAction, type ChatState } from "./chat-state";
import { sendVisitorMessage } from "./send";

const KEY = "pk_abcdefghijklmnop";
const VISITOR = "0b1c2d3e-4f5a-4b6c-9d7e-8f9a0b1c2d3e";

/** A panel stand-in: reducer state plus sends that read the current conversation, like the panel does. */
function panel(send: (req: WidgetChatRequest) => Promise<WidgetChatResponse>) {
  let state: ChatState = INITIAL_CHAT_STATE;
  let n = 0;
  const dispatch = (action: ChatAction) => {
    state = chatReducer(state, action);
  };
  return {
    get state() {
      return state;
    },
    say: (text: string) =>
      sendVisitorMessage(
        { text, publicKey: KEY, visitorId: VISITOR, conversationId: state.conversationId },
        dispatch,
        send,
        () => `m${++n}`,
      ),
  };
}

describe("sendVisitorMessage", () => {
  it("starts without a conversation, then reuses the returned id on every send", async () => {
    const send = vi.fn(async (req: WidgetChatRequest) => ({ conversationId: req.conversationId ?? "c1", reply: "ok" }));
    const p = panel(send);

    await p.say("one");
    await p.say("two");
    await p.say("three");

    expect(send.mock.calls.map(([req]) => req.conversationId)).toEqual([undefined, "c1", "c1"]);
    expect(send.mock.calls[0]?.[0]).toEqual({ key: KEY, visitorId: VISITOR, conversationId: undefined, message: "one" });
    expect(p.state.conversationId).toBe("c1");
    expect(p.state.messages.map((m) => m.role)).toEqual(["visitor", "bot", "visitor", "bot", "visitor", "bot"]);
  });

  it("a 404 drops the conversation, so the next send starts a new one", async () => {
    const send = vi
      .fn<(req: WidgetChatRequest) => Promise<WidgetChatResponse>>()
      .mockResolvedValueOnce({ conversationId: "c1", reply: "ok" })
      .mockRejectedValueOnce(new ChatError("not_found", "gone"))
      .mockResolvedValueOnce({ conversationId: "c2", reply: "fresh" });
    const p = panel(send);

    await p.say("one");
    expect(await p.say("two")).toEqual({ ok: false });
    expect(p.state.conversationId).toBeUndefined();
    expect(p.state.messages.at(-1)).toEqual({ id: "m4", role: "error", text: RESTARTED_MESSAGE });

    await p.say("two again");
    expect(send.mock.calls.map(([req]) => req.conversationId)).toEqual([undefined, "c1", undefined]);
    expect(p.state.conversationId).toBe("c2");
  });

  it("other errors keep the conversation and show the friendly text", async () => {
    const send = vi
      .fn<(req: WidgetChatRequest) => Promise<WidgetChatResponse>>()
      .mockResolvedValueOnce({ conversationId: "c1", reply: "ok" })
      .mockRejectedValueOnce(new ChatError("rate_limited", "raw server text"))
      .mockResolvedValueOnce({ conversationId: "c1", reply: "ok" });
    const p = panel(send);

    await p.say("one");
    await p.say("two");
    expect(p.state.conversationId).toBe("c1");
    expect(p.state.waiting).toBe(false);
    expect(p.state.messages.at(-1)?.text).toBe(RATE_LIMITED_MESSAGE);

    await p.say("three");
    expect(send.mock.calls[2]?.[0].conversationId).toBe("c1");
  });

  it("returns the reply on success", async () => {
    const p = panel(async () => ({ conversationId: "c1", reply: "Hello" }));
    expect(await p.say("hi")).toEqual({ ok: true, reply: "Hello" });
  });
});
