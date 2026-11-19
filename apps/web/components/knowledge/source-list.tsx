"use client";

import type { KnowledgeSource } from "@askwell/shared";
import { useState } from "react";
import { formatDate } from "../projects/format";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { sourceStatusLabel, sourceTypeLabel, statusChangeAnnouncement } from "./checks";
import { DeleteSourceDialog } from "./delete-source-dialog";

/**
 * The project's sources, newest first. Titles render as text, never HTML (§9 XSS). A polite
 * status region announces each source that finishes processing (Ready or Failed).
 */
export function SourceList({ sources, onChanged }: { sources: KnowledgeSource[]; onChanged: () => void }) {
  const [previous, setPrevious] = useState(sources);
  const [announcement, setAnnouncement] = useState("");
  if (previous !== sources) {
    // Compare with the last render's list (set during render, React's "previous props" pattern).
    const message = statusChangeAnnouncement(previous, sources);
    setPrevious(sources);
    if (message) setAnnouncement(message);
  }

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ul className="divide-y divide-glass-line">
        {sources.map((source) => (
          <SourceRow key={source.id} source={source} onChanged={onChanged} />
        ))}
      </ul>
    </>
  );
}

function SourceRow({ source, onChanged }: { source: KnowledgeSource; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const label = sourceStatusLabel(source.status);

  return (
    <li className="flex min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" title={source.title}>
          {source.title}
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          {sourceTypeLabel(source.type)} · Added {formatDate(source.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge label={label} />
        <Button variant="ghost" onClick={() => setConfirming(true)} aria-label={`Delete ${source.title}`}>
          Delete
        </Button>
      </div>
      <DeleteSourceDialog
        source={source}
        open={confirming}
        onClose={() => setConfirming(false)}
        onDeleted={() => {
          setConfirming(false);
          onChanged();
        }}
      />
    </li>
  );
}

function StatusBadge({ label }: { label: "Processing" | "Ready" | "Failed" }) {
  return (
    <Badge
      variant={label === "Ready" ? "solid" : label === "Failed" ? "outline" : "glass"}
      className={cn(label === "Failed" && "border-fg text-fg")}
    >
      {label === "Processing" ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-fg-muted motion-safe:animate-pulse" />
      ) : null}
      {label}
    </Badge>
  );
}
