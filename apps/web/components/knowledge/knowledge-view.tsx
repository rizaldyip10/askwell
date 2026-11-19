"use client";

import type { KnowledgeSource } from "@askwell/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { BILLING_PATH } from "../../lib/auth/routes";
import { EmptyState } from "../dashboard/empty-state";
import { Button } from "../ui/button";
import { GlassPanel } from "../ui/glass-panel";
import { isProcessing } from "./checks";
import { PasteForm } from "./paste-form";
import { SourceList } from "./source-list";
import { UploadForm } from "./upload-form";

/** How often the list refreshes while a source is Processing, and for how long at most. */
export const POLL_INTERVAL_MS = 3000;
export const POLL_MAX_TICKS = 60; // 3 minutes; then a Refresh button takes over

type Props = { projectId: string; sources: KnowledgeSource[]; limit: number };

/**
 * The Knowledge page body. The list comes from the server (owner client); after a change, or
 * every few seconds while anything is Processing, it re-renders the server page.
 */
export function KnowledgeView({ projectId, sources, limit }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);
  const processing = sources.some((s) => isProcessing(s.status));
  const atLimit = sources.length >= limit;
  const pollingDone = usePolling(processing, refresh);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted" aria-live="polite">
          <span className="font-medium text-fg tabular-nums">
            {sources.length} of {limit}
          </span>{" "}
          sources used
          {atLimit ? (
            <>
              {" · "}
              <Link href={BILLING_PATH} className="font-medium text-fg underline underline-offset-4">
                Upgrade for more
              </Link>
            </>
          ) : null}
        </p>
        {processing ? (
          <Button variant="secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : pollingDone ? "Refresh" : "Refresh now"}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel as="section" aria-labelledby="paste-heading" className="min-w-0 p-5">
          <h2 id="paste-heading" className="mb-4 text-base font-semibold tracking-tight">
            Paste text
          </h2>
          <PasteForm projectId={projectId} onAdded={refresh} />
        </GlassPanel>
        <GlassPanel as="section" aria-labelledby="upload-heading" className="min-w-0 p-5">
          <h2 id="upload-heading" className="mb-1 text-base font-semibold tracking-tight">
            Upload a file
          </h2>
          <UploadForm projectId={projectId} onAdded={refresh} />
        </GlassPanel>
      </div>

      <section aria-labelledby="sources-heading">
        <h2 id="sources-heading" className="mb-3 text-base font-semibold tracking-tight">
          Sources
        </h2>
        {sources.length === 0 ? (
          <EmptyState
            title="No knowledge yet"
            description="Paste text or upload a file above. The bot answers only from what you add here."
          />
        ) : (
          <GlassPanel className="min-w-0 p-5">
            <SourceList sources={sources} onChanged={refresh} />
            {processing && pollingDone ? (
              <p className="mt-4 text-sm text-fg-muted">Still processing. Use Refresh to check again.</p>
            ) : null}
          </GlassPanel>
        )}
      </section>
    </div>
  );
}

/**
 * While `active`, call `tick` every POLL_INTERVAL_MS, up to POLL_MAX_TICKS times in a row.
 * Returns true once it gave up (the caller then shows a Refresh hint). Starts over whenever
 * `active` turns on again.
 */
function usePolling(active: boolean, tick: () => void): boolean {
  const [ticks, setTicks] = useState(0);
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setTicks(0);
  }
  const done = ticks >= POLL_MAX_TICKS;

  useEffect(() => {
    if (!active || done) return;
    const timer = setTimeout(() => {
      setTicks((n) => n + 1);
      tick();
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [active, done, ticks, tick]);

  return active && done;
}
