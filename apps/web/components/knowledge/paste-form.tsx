"use client";

import { KNOWLEDGE_TEXT_MAX_LENGTH, KNOWLEDGE_TITLE_MAX_LENGTH } from "@askwell/shared";
import { useId, useState, type FormEvent } from "react";
import { TextInput } from "../projects/field";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { pasteKnowledge } from "./api";
import { FormErrorMessage, toFormError, type FormError } from "./form-error";

/** Title + text → POST …/knowledge. Clears on success and tells the parent to refresh. */
export function PasteForm({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const titleId = useId();
  const textId = useId();
  const errorId = useId();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<FormError | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const t = title.trim();
    const body = text.trim();
    if (!t) return setError({ message: "Enter a title.", upgrade: false });
    if (!body) return setError({ message: "Paste some text.", upgrade: false });

    setSending(true);
    setError(null);
    const result = await pasteKnowledge(projectId, t, body);
    setSending(false);
    if (!result.ok) return setError(toFormError(result));

    setTitle("");
    setText("");
    onAdded();
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={sending} className="flex flex-col gap-3">
      <div>
        <label htmlFor={titleId} className="mb-2 block text-sm font-medium">
          Title
        </label>
        <TextInput
          id={titleId}
          value={title}
          // Read-only (not disabled, which would drop focus) while sending: the fields are
          // cleared on success, so an edit made meanwhile would be lost.
          readOnly={sending}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder="Shipping and returns"
          maxLength={KNOWLEDGE_TITLE_MAX_LENGTH}
          autoComplete="off"
        />
      </div>
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <label htmlFor={textId} className="text-sm font-medium">
            Text
          </label>
          <span className="text-xs text-fg-subtle tabular-nums">
            {text.length.toLocaleString("en")} / {KNOWLEDGE_TEXT_MAX_LENGTH.toLocaleString("en")}
          </span>
        </div>
        <textarea
          id={textId}
          value={text}
          readOnly={sending}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder="Paste FAQs, policies or product details…"
          maxLength={KNOWLEDGE_TEXT_MAX_LENGTH}
          rows={6}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "block w-full min-w-0 resize-y rounded-control border border-glass-line bg-glass-strong px-3 py-2.5 text-sm text-fg",
            "placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
          )}
        />
      </div>
      {error ? <FormErrorMessage id={errorId} error={error} /> : null}
      <div>
        <Button type="submit" disabled={sending}>
          {sending ? "Adding…" : "Add text"}
        </Button>
      </div>
    </form>
  );
}
