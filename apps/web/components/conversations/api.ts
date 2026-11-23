// Client calls for the Conversations page. The first page comes from the server render; this
// fetches the pages after it through the owner route (P4C-T02).

import type { ConversationSummary, ListConversationsResponse } from "@askwell/shared";
import { requestJson } from "../projects/api";

/** The page after `cursor` (an opaque `nextCursor` from the previous page). */
export function fetchConversationsPage(projectId: string, cursor: string, fetchImpl: typeof fetch = fetch) {
  const params = new URLSearchParams({ before: cursor });
  return requestJson<ListConversationsResponse>(
    "GET",
    `/api/projects/${encodeURIComponent(projectId)}/conversations?${params}`,
    undefined,
    fetchImpl,
  );
}

export type ListState = { conversations: ConversationSummary[]; nextCursor: string | null };

/**
 * Add a fetched page under the rows already shown. A row that is already there is skipped,
 * so a page can never show the same conversation twice.
 */
export function appendPage(state: ListState, page: ListConversationsResponse): ListState {
  const seen = new Set(state.conversations.map((c) => c.id));
  return {
    conversations: [...state.conversations, ...page.conversations.filter((c) => !seen.has(c.id))],
    nextCursor: page.nextCursor,
  };
}
