import "server-only";

import { PLANS, type Plan } from "@askwell/shared";
import { createServiceClient, type ServiceClient } from "../supabase/service";

// The chat route's database calls (project.md §6.6). A public route: the project is resolved
// from its public_key only (§7), and everything runs on the service client, because visitors
// have no Supabase role. Each call is scoped to the resolved project id.
// Errors never carry the visitor's message text.

export interface ChatProject {
  id: string;
  plan: Plan;
}

function toPlan(value: string | undefined): Plan {
  // An unknown plan gets the most restricted one. The server decides the plan (§5).
  return PLANS.find((plan) => plan === value) ?? "free";
}

function dbError(fn: string, error: { code?: string; message?: string } | null): Error {
  return new Error(`${fn} failed: ${error?.code ?? "no data"} ${error?.message ?? ""}`.trim(), { cause: error });
}

/** The project with this public key and its owner's plan, or null. */
export async function getChatProject(
  publicKey: string,
  service: ServiceClient = createServiceClient(),
): Promise<ChatProject | null> {
  const { data, error } = await service
    .from("projects")
    .select("id, accounts(plan)")
    .eq("public_key", publicKey)
    .maybeSingle();

  if (error) throw dbError("getChatProject", error);
  if (!data) return null;
  return { id: data.id, plan: toPlan(data.accounts?.plan) };
}

/** True if the conversation belongs to the project (§6.6 step 2). */
export async function conversationBelongs(
  projectId: string,
  conversationId: string,
  service: ServiceClient = createServiceClient(),
): Promise<boolean> {
  const { data, error } = await service.rpc("conversation_belongs", {
    p_project_id: projectId,
    p_conversation_id: conversationId,
  });
  if (error) throw dbError("conversation_belongs", error);
  return data === true;
}

export type ConsumeResult = { ok: true; used: number } | { ok: false; reason: "quota_exceeded" };

/** Count one message against the monthly quota, before any OpenAI call (§6.6 step 3). */
export async function consumeMessage(
  projectId: string,
  maxMessages: number,
  service: ServiceClient = createServiceClient(),
): Promise<ConsumeResult> {
  const { data, error } = await service.rpc("consume_message", {
    p_project_id: projectId,
    p_max_messages: maxMessages,
  });
  if (error?.code === "P0001" && error.message === "quota_exceeded") return { ok: false, reason: "quota_exceeded" };
  if (error || typeof data !== "number") throw dbError("consume_message", error);
  return { ok: true, used: data };
}

export interface MatchedChunk {
  id: string;
  sourceId: string;
  content: string;
  similarity: number;
}

/** The project's nearest chunks from `ready` sources, nearest first (§6.6 step 4). */
export async function matchChunks(
  projectId: string,
  embedding: number[],
  count: number,
  service: ServiceClient = createServiceClient(),
): Promise<MatchedChunk[]> {
  const { data, error } = await service.rpc("match_chunks", {
    p_project_id: projectId,
    // pgvector's text form: "[0.1,0.2,...]".
    p_embedding: JSON.stringify(embedding),
    p_match_count: count,
  });
  if (error || !data) throw dbError("match_chunks", error);
  return data.map((row) => ({ id: row.id, sourceId: row.source_id, content: row.content, similarity: row.similarity }));
}

export type SaveResult = { ok: true; conversationId: string } | { ok: false; reason: "conversation_not_found" };

/** Save the visitor message and the bot reply. Creates the conversation when none is given (§6.6 step 6). */
export async function saveChatTurn(
  turn: { projectId: string; conversationId: string | null; visitorId: string; message: string; reply: string },
  service: ServiceClient = createServiceClient(),
): Promise<SaveResult> {
  const { data, error } = await service.rpc("save_chat_turn", {
    p_project_id: turn.projectId,
    // null starts a new conversation (typed nullable in packages/db/index.ts).
    p_conversation_id: turn.conversationId,
    p_visitor_id: turn.visitorId,
    p_visitor_message: turn.message,
    p_bot_reply: turn.reply,
  });
  if (error?.code === "P0002" && error.message === "conversation_not_found") {
    return { ok: false, reason: "conversation_not_found" };
  }
  if (error || typeof data !== "string") throw dbError("save_chat_turn", error);
  return { ok: true, conversationId: data };
}
