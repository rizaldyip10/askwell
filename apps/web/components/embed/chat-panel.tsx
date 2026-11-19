"use client";

import { APP_NAME, MESSAGE_MAX_LENGTH, type WidgetConfig } from "@askwell/shared";
import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { chatErrorMessage, sendChatMessage } from "../../lib/embed/chat-client";
import { chatReducer, INITIAL_CHAT_STATE } from "../../lib/embed/chat-state";
import { postToHost } from "../../lib/embed/messaging";
import { getVisitorId } from "../../lib/embed/visitor-id";
import { MessageBubble, TypingIndicator } from "./message-bubble";
import { usePanelHidden } from "./use-panel-hidden";

type ChatPanelProps = {
  config: WidgetConfig;
  publicKey: string;
  /** The host page's normalized origin: the only postMessage target. */
  origin: string;
};

export function ChatPanel({ config, publicKey, origin }: ChatPanelProps) {
  const [state, dispatch] = useReducer(chatReducer, INITIAL_CHAT_STATE);
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const unread = useRef(0);

  const hidden = usePanelHidden(rootRef, () => {
    if (unread.current === 0) return;
    unread.current = 0;
    postToHost(window.parent, origin, { type: "askwell:unread", count: 0 });
  });

  useEffect(() => {
    postToHost(window.parent, origin, { type: "askwell:ready" });
  }, [origin]);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [state.messages.length, state.waiting]);

  useEffect(() => {
    if (!state.waiting) inputRef.current?.focus();
  }, [state.waiting]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || state.waiting) return;
    setDraft("");
    dispatch({ type: "sent", id: crypto.randomUUID(), text });
    try {
      const res = await sendChatMessage({
        key: publicKey,
        visitorId: getVisitorId(),
        conversationId: state.conversationId,
        message: text,
      });
      dispatch({ type: "replied", id: crypto.randomUUID(), text: res.reply, conversationId: res.conversationId });
      if (hidden.current) {
        unread.current += 1;
        postToHost(window.parent, origin, { type: "askwell:unread", count: unread.current });
      }
    } catch (error) {
      dispatch({ type: "failed", id: crypto.randomUUID(), text: chatErrorMessage(error) });
      setDraft((current) => current || text);
    }
  }

  const empty = state.messages.length === 0 && !state.waiting;

  return (
    <div
      ref={rootRef}
      className="flex h-dvh flex-col bg-linear-to-b from-white to-gray-100 text-fg"
    >
      <header className="flex items-center justify-between gap-3 border-b border-glass-line bg-glass-strong px-4 py-3 backdrop-blur-glass">
        <h1 className="truncate text-sm font-semibold tracking-tight">{config.headerText}</h1>
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => postToHost(window.parent, origin, { type: "askwell:close" })}
          className="grid size-8 shrink-0 place-items-center rounded-pill text-fg-muted transition-colors hover:bg-glass hover:text-fg focus-visible:outline-2 focus-visible:outline-fg"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium">Hi there 👋</p>
            <p className="mt-1 text-sm text-fg-muted">Ask a question and we&apos;ll answer right here.</p>
          </div>
        ) : (
          <ol ref={listRef} className="flex flex-col gap-2">
            {state.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {state.waiting ? <TypingIndicator /> : null}
          </ol>
        )}
      </div>

      <div className="border-t border-glass-line bg-glass-strong px-3 pt-3 pb-2 backdrop-blur-glass">
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <label htmlFor="askwell-message" className="sr-only">
            Message
          </label>
          <input
            ref={inputRef}
            id="askwell-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MESSAGE_MAX_LENGTH}
            disabled={state.waiting}
            autoComplete="off"
            placeholder="Type your message…"
            className="h-10 min-w-0 flex-1 rounded-pill border border-glass-line bg-white px-4 text-sm placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-fg disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={state.waiting || draft.trim() === ""}
            className="grid size-10 shrink-0 place-items-center rounded-pill bg-primary text-primary-fg transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:opacity-40"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
            </svg>
          </button>
        </form>
        {config.showBadge ? (
          <p className="mt-2 text-center text-[11px] text-fg-subtle">Powered by {APP_NAME}</p>
        ) : null}
      </div>
    </div>
  );
}
