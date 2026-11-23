// Client calls for the Conversations page. The first page comes from the server render; this
// fetches the pages after it through the owner route (P4C-T02).

import type { ConversationSummary, ListConversationsResponse } from "@askwell/shared";
import { requestJson, type ApiResult } from "../projects/api";

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

/** The rows shown, the cursor for the next page, and the last Load more error (tied to this list). */
export type ListState = { conversations: ConversationSummary[]; nextCursor: string | null; error: string | null };

/** A list freshly rendered by the server (first load or Refresh). */
export function initialListState(page: ListConversationsResponse): ListState {
  return { conversations: page.conversations, nextCursor: page.nextCursor, error: null };
}

/**
 * Add a fetched page under the rows already shown. A row that is already there is skipped,
 * so a page can never show the same conversation twice.
 */
export function appendPage(state: ListState, page: ListConversationsResponse): ListState {
  const seen = new Set(state.conversations.map((c) => c.id));
  return {
    conversations: [...state.conversations, ...page.conversations.filter((c) => !seen.has(c.id))],
    nextCursor: page.nextCursor,
    error: null,
  };
}

/**
 * Apply a finished Load more to `current`, but only if the list is still the one the request
 * started from. A Refresh in between replaces the list, so the late page (or its error) would
 * belong to the old list: dropping it keeps rows from being skipped after the new first page.
 */
export function settleLoadMore(
  current: ListState,
  snapshot: ListState,
  result: ApiResult<ListConversationsResponse>,
): ListState {
  if (current !== snapshot) return current;
  return result.ok ? appendPage(current, result.data) : { ...current, error: result.message };
}
