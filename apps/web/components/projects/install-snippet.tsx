"use client";

import type { AnalyticsEvent } from "../../lib/analytics/events";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { loadPostHog } from "../../lib/analytics/browser";
import { projectIdFromPath } from "../../lib/auth/routes";
import { CodeBlock } from "../ui/code-block";
import { CopyButton } from "./copy-button";

/**
 * The snippet with a copy button. If the browser blocks every copy method, the snippet text is
 * selected and a hint says to copy it with the keyboard.
 */
export function InstallSnippet({ snippet }: { snippet: string }) {
  // The Install page is /dashboard/projects/<id>/install.
  const projectId = projectIdFromPath(usePathname());
  const codeRef = useRef<HTMLDivElement>(null);
  const [manual, setManual] = useState(false);

  function selectSnippet() {
    setManual(true);
    const code = codeRef.current?.querySelector("code");
    const selection = typeof window === "undefined" ? null : window.getSelection();
    if (!code || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={codeRef} className="min-w-0">
        <CodeBlock code={snippet} label="HTML" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <CopyButton
          value={snippet}
          label="Copy script tag"
          onFailed={selectSnippet}
          onCopied={() => {
            setManual(false);
            if (projectId) void trackSnippetCopied(projectId);
          }}
        />
        {manual ? (
          <p role="status" className="text-sm text-fg-muted">
            Your browser blocked copying. The tag is selected: press Ctrl+C (⌘C on a Mac).
          </p>
        ) : null}
      </div>
    </div>
  );
}

const SNIPPET_COPIED: AnalyticsEvent = "snippet_copied";

/**
 * Funnel step "install" (project.md §6.11), sent from the browser with the posthog-js client
 * from T05 under the identified owner. Only the project ID: never the snippet or its key.
 * No PostHog (no key) → nothing. Never throws.
 */
export function trackSnippetCopied(projectId: string): Promise<void> {
  return loadPostHog()
    .then((posthog) => {
      posthog?.capture(SNIPPET_COPIED, { project_id: projectId });
    })
    .catch(() => {});
}
