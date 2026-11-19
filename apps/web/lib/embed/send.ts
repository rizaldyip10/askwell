import type { WidgetChatRequest, WidgetChatResponse } from "@askwell/shared";
import { chatErrorMessage, sendChatMessage, shouldResetConversation } from "./chat-client";
import type { ChatAction } from "./chat-state";

export type SendResult = { ok: true; reply: string } | { ok: false };

/**
 * One visitor send: dispatches `sent`, calls the route, then `replied` or `failed`.
 * Reuses `conversationId` (panel state, until reload); a 404 drops it so the next send starts
 * a new conversation. The panel handles the draft and the unread count from the result.
 */
export async function sendVisitorMessage(
  {
    text,
    publicKey,
    visitorId,
    conversationId,
  }: { text: string; publicKey: string; visitorId: string; conversationId: string | undefined },
  dispatch: (action: ChatAction) => void,
  send: (req: WidgetChatRequest) => Promise<WidgetChatResponse> = sendChatMessage,
  newId: () => string = () => crypto.randomUUID(),
): Promise<SendResult> {
  dispatch({ type: "sent", id: newId(), text });
  try {
    const res = await send({ key: publicKey, visitorId, conversationId, message: text });
    dispatch({ type: "replied", id: newId(), text: res.reply, conversationId: res.conversationId });
    return { ok: true, reply: res.reply };
  } catch (error) {
    dispatch({
      type: "failed",
      id: newId(),
      text: chatErrorMessage(error),
      resetConversation: shouldResetConversation(error),
    });
    return { ok: false };
  }
}
