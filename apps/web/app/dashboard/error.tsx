"use client";

import { useEffect } from "react";
import { EmptyState } from "../../components/dashboard/empty-state";
import { Button } from "../../components/ui/button";

export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      role="alert"
      title="Something went wrong"
      description="This page couldn't load. Try again, or refresh the page."
      action={
        <Button variant="secondary" onClick={() => retry()}>
          Try again
        </Button>
      }
    />
  );
}
