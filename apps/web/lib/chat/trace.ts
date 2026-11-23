import "server-only";

import { after } from "next/server";
import type { AnswerUsage } from "../ai";
import { captureServer } from "../analytics/server";
import { isFirstConversation } from "./db";

// PostHog chat analytics (project.md §6.6 step 7, §6.11). Every send goes through
// captureServer: after the response, time-capped, never throws. No message, chunk or reply
// text ever reaches PostHog (privacy mode: no $ai_input / $ai_output_choices).

/** LLM provider of CHAT_MODEL (lib/ai/answer.ts), for PostHog's cost lookup. */
export const AI_PROVIDER = "openai";

/** One answer step of a chat turn. Never the message text. */
export interface ChatTrace {
  projectId: string;
  /** The project owner's Clerk user ID (PostHog distinct ID). */
  ownerId: string;
  /** The saved conversation: the trace ID, so every reply of a conversation shares one trace. */
  conversationId: string;
  /** Token usage, or null when no model call was made (no chunks). */
  usage: AnswerUsage | null;
  /** Wall time of the answer step, in milliseconds. */
  latencyMs: number;
  /** How many chunks were retrieved. */
  chunkCount: number;
}

/**
 * Sends one `$ai_generation` for a reply that made a model call. No model call (no chunks →
 * the fixed "I don't know" reply) → nothing sent. PostHog computes the cost from model + tokens.
 */
export function onChatTrace(trace: ChatTrace): void {
  if (!trace.usage) return;
  try {
    sendGeneration(trace, trace.usage);
  } catch (error) {
    console.warn("[chat] AI trace failed", error instanceof Error ? error.message : "unknown error");
  }
}

function sendGeneration(trace: ChatTrace, usage: AnswerUsage): void {
  captureServer("$ai_generation", trace.ownerId, {
    $ai_trace_id: trace.conversationId,
    $ai_session_id: trace.conversationId,
    $ai_span_id: crypto.randomUUID(),
    $ai_span_name: "widget_answer",
    $ai_provider: AI_PROVIDER,
    $ai_model: usage.model,
    $ai_input_tokens: usage.inputTokens,
    $ai_output_tokens: usage.outputTokens,
    $ai_latency: trace.latencyMs / 1000,
    project_id: trace.projectId,
    chunk_count: trace.chunkCount,
  });
}

export interface NewConversation {
  projectId: string;
  ownerId: string;
  conversationId: string;
}

/**
 * Call when a chat request created a conversation. Sends `first_chat` once per project: only
 * for the project's oldest conversation. The check runs after the response and never throws.
 */
export function onConversationStarted(conversation: NewConversation): void {
  const check = async () => {
    try {
      if (!(await isFirstConversation(conversation.projectId, conversation.conversationId))) return;
      captureServer("first_chat", conversation.ownerId, { project_id: conversation.projectId });
    } catch (error) {
      console.warn("[chat] first_chat check failed", error instanceof Error ? error.message : "unknown error");
    }
  };
  try {
    after(check);
  } catch {
    // Outside a request scope (tests, scripts).
    void check();
  }
}
