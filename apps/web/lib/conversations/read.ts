import "server-only";

import {
  CONVERSATIONS_PAGE_SIZE,
  encodeConversationCursor,
  type ConversationCursor,
  type ConversationThreadResponse,
  type ListConversationsResponse,
} from "@askwell/shared";
import { createOwnerClient, type OwnerClient } from "../supabase/owner";
import { toConversation, toConversationSummary, toMessage } from "./to-conversation";

// Owner conversation reads (project.md §6.7, §8 Owner), for the routes and the dashboard
// pages. Owner client only: RLS scopes every row to the signed-in owner (§9 "Tenant leak"),
// so there is no owner filter here and no service client.
//
// Each read is one PostgREST request, never one per conversation. The list embeds two views
// of `messages`: `preview` (the first visitor message) and `stats` (`messages(count)`).
// The embedded count works with PostgREST aggregates off (§9); checked on the dev project.

const LIST_COLUMNS =
  "id, project_id, visitor_id, created_at, preview:messages(body), stats:messages(count)" as const;

/**
 * One page of a project's conversations, newest first: CONVERSATIONS_PAGE_SIZE rows, ordered
 * by (created_at, id) descending. `before` starts the page after that row, so rows with the
 * same created_at are neither skipped nor repeated. `nextCursor` is null on the last page.
 *
 * Another owner's project gives an empty page (RLS); routes check ownership first for a 404.
 */
export async function listConversations(
  projectId: string,
  before?: ConversationCursor,
  client: OwnerClient = createOwnerClient(),
): Promise<ListConversationsResponse> {
  let query = client
    .from("conversations")
    .select(LIST_COLUMNS)
    .eq("project_id", projectId)
    .eq("preview.role", "visitor")
    .order("created_at", { referencedTable: "preview", ascending: true })
    .order("id", { referencedTable: "preview", ascending: true })
    .limit(1, { referencedTable: "preview" });

  if (before) {
    // Both values were validated by the cursor schema (ISO timestamp, UUID); the timestamp is
    // quoted because PostgREST filter values may not hold an unquoted "+" offset reliably.
    const at = `"${before.createdAt}"`;
    query = query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${before.id})`);
  }

  // One extra row tells us whether there is a next page.
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(CONVERSATIONS_PAGE_SIZE + 1);
  if (error) throw new Error(`listConversations: ${error.message}`, { cause: error });

  const rows = data.slice(0, CONVERSATIONS_PAGE_SIZE);
  const last = rows.at(-1);
  const hasMore = data.length > CONVERSATIONS_PAGE_SIZE;
  return {
    conversations: rows.map(toConversationSummary),
    nextCursor: hasMore && last ? encodeConversationCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

/**
 * A conversation and all its messages, oldest first (ties by id), or null when it doesn't
 * exist or isn't the owner's: RLS returns no row either way, so callers can't tell which.
 */
export async function getConversationThread(
  conversationId: string,
  client: OwnerClient = createOwnerClient(),
): Promise<ConversationThreadResponse | null> {
  const { data, error } = await client
    .from("conversations")
    .select("id, project_id, visitor_id, created_at, messages(id, conversation_id, role, body, created_at)")
    .eq("id", conversationId)
    .order("created_at", { referencedTable: "messages", ascending: true })
    .order("id", { referencedTable: "messages", ascending: true })
    .maybeSingle();
  if (error) throw new Error(`getConversationThread: ${error.message}`, { cause: error });
  if (!data) return null;

  return { conversation: toConversation(data), messages: data.messages.map(toMessage) };
}
