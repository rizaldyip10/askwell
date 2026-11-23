"use client";

import type { ListConversationsResponse } from "@askwell/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EmptyState } from "../dashboard/empty-state";
import { ButtonLink, Button } from "../ui/button";
import { GlassPanel } from "../ui/glass-panel";
import { projectSectionPath } from "../../lib/auth/routes";
import { appendPage, fetchConversationsPage, type ListState } from "./api";
import { ConversationList } from "./conversation-list";

type Props = { projectId: string; initial: ListConversationsResponse };

/**
 * The Conversations page body. The first page comes from the server render (owner client);
 * "Load more" fetches the next one from the route; "Refresh" re-renders the server page, which
 * starts the list again from the newest. No realtime, no polling (§6.7, §12).
 */
export function ConversationsView({ projectId, initial }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [state, setState] = useState<ListState>(initial);
  const [previous, setPrevious] = useState(initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (previous !== initial) {
    // A refresh brought a new first page: start over from it (React's "previous props" pattern).
    setPrevious(initial);
    setState(initial);
    setError(null);
  }

  const refresh = () => startRefresh(() => router.refresh());

  async function loadMore() {
    if (!state.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    const result = await fetchConversationsPage(projectId, state.nextCursor);
    setLoadingMore(false);
    if (result.ok) setState((s) => appendPage(s, result.data));
    else setError(result.message);
  }

  const refreshButton = (
    <Button variant="secondary" onClick={refresh} disabled={refreshing}>
      {refreshing ? "Refreshing…" : "Refresh"}
    </Button>
  );

  if (state.conversations.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState
          title="No conversations yet"
          description="Install the widget on your site. Each chat a visitor starts shows up here."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink href={projectSectionPath(projectId, "install")}>Install the widget</ButtonLink>
              {refreshButton}
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted" aria-live="polite">
          Showing <span className="font-medium text-fg tabular-nums">{state.conversations.length}</span>{" "}
          {state.conversations.length === 1 ? "conversation" : "conversations"}, newest first
        </p>
        {refreshButton}
      </div>

      <GlassPanel as="section" aria-label="Conversations" className="min-w-0 p-5" aria-busy={refreshing}>
        <ConversationList projectId={projectId} conversations={state.conversations} />
      </GlassPanel>

      {error ? (
        <p role="alert" className="text-center text-sm text-fg">
          {error}
        </p>
      ) : null}

      {state.nextCursor ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : error ? "Try again" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
