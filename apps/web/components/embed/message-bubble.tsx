import type { ChatMessage } from "../../lib/embed/chat-state";
import { cn } from "../ui/cn";

const styles: Record<ChatMessage["role"], string> = {
  visitor: "ml-auto rounded-br-md bg-primary text-primary-fg",
  bot: "mr-auto rounded-bl-md border border-glass-line bg-white/90 text-fg",
  error: "mr-auto rounded-bl-md border border-glass-line bg-gray-100 text-fg-muted",
};

/** One chat message. Always plain text, never HTML (project.md §9 XSS). */
export function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <li
      role={message.role === "error" ? "alert" : undefined}
      data-role={message.role}
      className={cn(
        "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap",
        styles[message.role],
      )}
    >
      {message.text}
    </li>
  );
}

export function TypingIndicator() {
  return (
    <li
      role="status"
      aria-label="Typing"
      className="mr-auto flex items-center gap-1 rounded-2xl rounded-bl-md border border-glass-line bg-white/90 px-3.5 py-3"
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-gray-400"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </li>
  );
}
