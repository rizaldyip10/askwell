"use client";

import { MESSAGE_MAX_LENGTH, type WidgetConfig } from "@askwell/shared";
import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { chatReducer, INITIAL_CHAT_STATE } from "../../lib/embed/chat-state";
import { closeOnEscape, postToHost } from "../../lib/embed/messaging";
import { sendVisitorMessage } from "../../lib/embed/send";
import { getVisitorId } from "../../lib/embed/visitor-id";
import { MessageBubble, TypingIndicator } from "./message-bubble";
import { PANEL_SURFACE, PanelFooter, PanelHeader, PoweredBy, SendIcon } from "./panel-parts";
import { usePanelHidden } from "./use-panel-hidden";
import { TAP_HEIGHT, TAP_SIZE } from "../ui/tap-target";

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
    const onKeydown = closeOnEscape(window.parent, origin);
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [origin]);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [state.messages.length, state.waiting]);

  // After a reply, return focus to the input, unless the visitor has moved to another control.
  // The input was disabled while waiting, so it lost focus to <body>.
  useEffect(() => {
    if (state.waiting) return;
    const active = document.activeElement;
    if (!active || active === document.body) inputRef.current?.focus();
  }, [state.waiting]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || state.waiting) return;
    setDraft("");
    const result = await sendVisitorMessage(
      { text, publicKey, visitorId: getVisitorId(), conversationId: state.conversationId },
      dispatch,
    );
    if (!result.ok) {
      setDraft((current) => current || text);
      return;
    }
    if (hidden.current) {
      unread.current += 1;
      postToHost(window.parent, origin, { type: "askwell:unread", count: unread.current });
    }
  }

  const empty = state.messages.length === 0 && !state.waiting;

  return (
    <div ref={rootRef} className={`flex h-dvh flex-col ${PANEL_SURFACE}`}>
      <PanelHeader
        headerText={config.headerText}
        onClose={() => postToHost(window.parent, origin, { type: "askwell:close" })}
      />

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

      <PanelFooter>
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
            className={`h-10 ${TAP_HEIGHT} min-w-0 flex-1 rounded-pill border border-glass-line bg-white px-4 text-sm placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-fg disabled:opacity-60`}
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={state.waiting || draft.trim() === ""}
            className={`grid size-10 ${TAP_SIZE} shrink-0 place-items-center rounded-pill bg-primary text-primary-fg transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:opacity-40`}
          >
            <SendIcon />
          </button>
        </form>
        {config.showBadge ? <PoweredBy /> : null}
      </PanelFooter>
    </div>
  );
}
