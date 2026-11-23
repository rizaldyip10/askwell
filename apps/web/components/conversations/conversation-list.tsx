import type { ConversationSummary } from "@askwell/shared";
import Link from "next/link";
import { formatFullTime, formatShortTime, messageCountLabel } from "./format";
import { conversationPath } from "./paths";

/**
 * Conversation rows, newest first, each linking to its thread. The preview is visitor text, so
 * it renders as text, never HTML (§9 XSS).
 */
export function ConversationList({ projectId, conversations }: { projectId: string; conversations: ConversationSummary[] }) {
  return (
    <ul className="divide-y divide-glass-line">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link
            href={conversationPath(projectId, c.id)}
            className="-mx-2 flex min-w-0 flex-col gap-1 rounded-control px-2 py-4 transition-colors hover:bg-glass focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <span className="min-w-0 truncate text-sm font-medium" title={c.firstMessagePreview || undefined}>
              {c.firstMessagePreview || <span className="text-fg-muted italic">No visitor message</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-fg-muted tabular-nums">
              <span>{messageCountLabel(c.messageCount)}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={c.createdAt} title={formatFullTime(c.createdAt)}>
                {formatShortTime(c.createdAt)}
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
