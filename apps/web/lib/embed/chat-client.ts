import { apiErrorSchema, type ApiErrorCode, type WidgetChatRequest, type WidgetChatResponse } from "@askwell/shared";

/** The chat route. Same origin: the panel runs inside the /embed iframe on the app's domain. */
export const CHAT_ENDPOINT = "/api/widget/chat";

/** A failed chat call, built from the route's `{ error: { code, message } }`. */
export class ChatError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ChatError";
  }
}

function isChatResponse(value: unknown): value is WidgetChatResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.conversationId === "string" && typeof v.reply === "string";
}

/**
 * Sends a visitor message to `POST /api/widget/chat`.
 * An error response throws `ChatError(code, message)` from its body; a network error, or a body
 * that isn't the expected shape, throws a generic `ChatError("internal", …)`.
 */
export async function sendChatMessage(req: WidgetChatRequest): Promise<WidgetChatResponse> {
  let res: Response;
  try {
    res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    throw new ChatError("internal", "Network error");
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) throw new ChatError(parsed.data.error.code, parsed.data.error.message);
    throw new ChatError("internal", `Unexpected ${res.status} response`);
  }
  if (!isChatResponse(body)) throw new ChatError("internal", "Unexpected response");
  return body;
}

export const GENERIC_ERROR_MESSAGE = "Something went wrong, try again.";
export const RATE_LIMITED_MESSAGE = "You're sending messages too fast. Wait a moment, then try again.";
export const QUOTA_MESSAGE = "This chat isn't available right now. Please try again later.";
export const REPHRASE_MESSAGE = "We couldn't send that message. Try rephrasing it.";
export const RESTARTED_MESSAGE = "This chat was restarted. Send your message again to continue.";

/**
 * The friendly text the panel shows for a failed send. Never the server's raw message.
 * `validation_error` covers the prompt-injection refusal and any other rejected message.
 */
export function chatErrorMessage(error: unknown): string {
  if (error instanceof ChatError) {
    switch (error.code) {
      case "rate_limited":
        return RATE_LIMITED_MESSAGE;
      case "quota_exceeded":
        return QUOTA_MESSAGE;
      case "validation_error":
        return REPHRASE_MESSAGE;
      case "not_found":
        return RESTARTED_MESSAGE;
    }
  }
  return GENERIC_ERROR_MESSAGE;
}

/**
 * A 404 means the conversation is gone (deleted, or not this project's): drop it, so the next
 * send starts a new conversation.
 */
export function shouldResetConversation(error: unknown): boolean {
  return error instanceof ChatError && error.code === "not_found";
}
