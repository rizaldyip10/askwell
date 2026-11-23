"use client";

import { useEffect } from "react";
import { EmptyState } from "../../../components/dashboard/empty-state";
import { Button } from "../../../components/ui/button";

export default function BillingError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      role="alert"
      title="Couldn't load your plan"
      description="Something went wrong on our side. Your subscription isn't affected. Try again, or refresh the page."
      action={
        <Button variant="secondary" onClick={() => retry()}>
          Try again
        </Button>
      }
    />
  );
}
