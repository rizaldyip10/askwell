// POST /api/widget/chat (project.md §6.6, §8 Public). Any origin, no Clerk.
// Order: validate shape → protect (Arcjet) → resolve project + conversation → count → retrieve
// → answer → save. Nothing is counted before the count step, and no OpenAI call happens before it.
// After the count, a failure still uses the message (no refund, §6.6).
// The visitor's message text is never logged.

import { PLAN_LIMITS, widgetChatRequestSchema, type WidgetChatResponse } from "@askwell/shared";
import { answerFromChunks, embedText } from "../../../../lib/ai";
import {
  consumeMessage,
  conversationBelongs,
  getChatProject,
  MATCH_COUNT,
  matchChunks,
  onChatTrace,
  saveChatTurn,
} from "../../../../lib/chat";
import { protectWidgetChat } from "../../../../lib/security";
import { widgetError, widgetJson, widgetPreflight } from "../../../../lib/widget/http";

const NOT_FOUND = "No project or conversation with that id";

/**
 * Log an error by name and message only. Never the whole object: a Postgres error's `details`
 * can quote the failing row, which would include the visitor's message (§9).
 */
function logError(step: string, error: unknown): void {
  const summary = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
  console.error(`[chat] ${step}`, summary);
}

export async function POST(request: Request): Promise<Response> {
  // 1. Validate the body shape (message length is in the schema).
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return widgetError(400, "validation_error", "Body must be JSON");
  }
  const parsed = widgetChatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return widgetError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const { key, visitorId, conversationId, message } = parsed.data;

  // 2. Protect. protectWidgetChat calls onBlocked itself on a block. Fails open on Arcjet errors.
  const protection = await protectWidgetChat(request, { publicKey: key, message });
  if (!protection.allowed) {
    return protection.reason === "rate_limit"
      ? widgetError(429, "rate_limited", "Too many messages. Try again in a minute.")
      : widgetError(400, "validation_error", "We couldn't send that message. Try rephrasing it.");
  }

  // 3. Resolve the project (public key only) and check the conversation. Nothing counted yet.
  let projectId: string;
  let maxMessages: number;
  try {
    const project = await getChatProject(key);
    if (!project) return widgetError(404, "not_found", NOT_FOUND);
    if (conversationId && !(await conversationBelongs(project.id, conversationId))) {
      return widgetError(404, "not_found", NOT_FOUND);
    }
    projectId = project.id;
    maxMessages = PLAN_LIMITS[project.plan].messagesPerMonth;
  } catch (error) {
    logError("project lookup failed", error);
    return widgetError(500, "internal", "Something went wrong");
  }

  // 4. Count, before any OpenAI call.
  try {
    const consumed = await consumeMessage(projectId, maxMessages);
    if (!consumed.ok) {
      return widgetError(429, "quota_exceeded", "This site's assistant has reached its monthly message limit.");
    }
  } catch (error) {
    logError("consume_message failed", error);
    return widgetError(500, "internal", "Something went wrong");
  }

  // 5–7. Retrieve, answer, save. The message is counted from here on.
  try {
    const embedding = await embedText(message);
    const chunks = await matchChunks(projectId, embedding, MATCH_COUNT);

    const started = performance.now();
    const answer = await answerFromChunks({ question: message, chunks });
    onChatTrace({
      projectId,
      usage: answer.usage,
      latencyMs: Math.round(performance.now() - started),
      chunkCount: chunks.length,
    });

    const saved = await saveChatTurn({
      projectId,
      conversationId: conversationId ?? null,
      visitorId,
      message,
      reply: answer.reply,
    });
    // The conversation was deleted after the check above.
    if (!saved.ok) return widgetError(404, "not_found", NOT_FOUND);

    const body: WidgetChatResponse = { conversationId: saved.conversationId, reply: answer.reply };
    return widgetJson(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("answer failed after counting", error);
    return widgetError(500, "internal", "Something went wrong");
  }
}

export function OPTIONS(): Response {
  return widgetPreflight();
}
