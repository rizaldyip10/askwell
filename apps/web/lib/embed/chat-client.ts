import type { ApiErrorCode, WidgetChatRequest, WidgetChatResponse } from "@askwell/shared";

export const MOCK_REPLY = "This is a preview reply. Real answers arrive soon.";
export const MOCK_DELAY_MS = 800;

/** A failed chat call. Phase 3 builds it from the route's `{ error: { code, message } }`. */
export class ChatError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ChatError";
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends a visitor message. Mock until Phase 3 builds `POST /api/widget/chat`:
 * it waits ~800 ms, keeps the conversation ID (or makes one), and returns a preview reply.
 * Phase 3 swaps the body for a `fetch` and throws `ChatError` on an error response.
 */
export async function sendChatMessage(req: WidgetChatRequest): Promise<WidgetChatResponse> {
  await wait(MOCK_DELAY_MS);
  return { conversationId: req.conversationId ?? crypto.randomUUID(), reply: MOCK_REPLY };
}

export const GENERIC_ERROR_MESSAGE = "Something went wrong, try again.";

/** The friendly text the panel shows for a failed send. */
export function chatErrorMessage(error: unknown): string {
  if (error instanceof ChatError) {
    if (error.code === "rate_limited") return "You're sending messages too fast. Wait a moment, then try again.";
    if (error.code === "quota_exceeded") return "This chat isn't available right now. Please try again later.";
  }
  return GENERIC_ERROR_MESSAGE;
}
