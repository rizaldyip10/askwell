"use client";

import { useEffect } from "react";
import { EmptyState } from "../../../../../components/dashboard/empty-state";
import { Button } from "../../../../../components/ui/button";

// Covers the list and the thread pages (both sit under this segment).
export default function ConversationsError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      role="alert"
      title="Couldn't load conversations"
      description="Something went wrong on our side. Try again, or refresh the page."
      action={
        <Button variant="secondary" onClick={() => retry()}>
          Try again
        </Button>
      }
    />
  );
}
