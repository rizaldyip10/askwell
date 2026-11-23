import type { Message } from "@askwell/shared";
import { cn } from "../ui/cn";
import { formatFullTime, formatShortTime } from "./format";

const SPEAKER: Record<Message["role"], string> = { visitor: "Visitor", bot: "Bot" };

/**
 * A conversation's messages, oldest first. Visitor messages sit on the left and bot replies on
 * the right, each with a label, so the speaker never depends on color alone. Bodies render as
 * text, never HTML (§9 XSS); line breaks are kept with `white-space: pre-wrap`.
 */
export function Thread({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-fg-muted">This conversation has no messages.</p>;
  }
  return (
    <ol className="flex flex-col gap-4" aria-label="Messages, oldest first">
      {messages.map((m) => {
        const bot = m.role === "bot";
        return (
          <li key={m.id} className={cn("flex min-w-0 flex-col gap-1", bot ? "items-end" : "items-start")} data-role={m.role}>
            <p className="flex items-center gap-2 text-xs text-fg-muted">
              <span className="font-medium text-fg">{SPEAKER[m.role]}</span>
              <time dateTime={m.createdAt} title={formatFullTime(m.createdAt)} className="tabular-nums">
                {formatShortTime(m.createdAt)}
              </time>
            </p>
            <div
              className={cn(
                "max-w-[85%] rounded-panel px-4 py-3 text-sm break-words whitespace-pre-wrap sm:max-w-[70%]",
                bot ? "bg-primary text-primary-fg" : "border border-glass-line bg-glass-strong text-fg",
              )}
            >
              {m.body}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
