"use client";

import type { KnowledgeSource } from "@askwell/shared";
import { useId, useState } from "react";
import { Dialog } from "../projects/dialog";
import { FieldError } from "../projects/field";
import { useMountedRef } from "../projects/use-mounted-ref";
import { Button } from "../ui/button";
import { deleteKnowledge } from "./api";

type Props = { source: KnowledgeSource; open: boolean; onClose: () => void; onDeleted: () => void };

export function DeleteSourceDialog({ source, open, onClose, onDeleted }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Delete “${source.title}”?`}
      description="The bot stops using it right away. Its file, if any, is deleted too. This can't be undone."
    >
      <DeleteActions source={source} onCancel={onClose} onDeleted={onDeleted} />
    </Dialog>
  );
}

function DeleteActions({ source, onCancel, onDeleted }: { source: KnowledgeSource; onCancel: () => void; onDeleted: () => void }) {
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const mounted = useMountedRef();

  async function onConfirm() {
    if (sending) return;
    setSending(true);
    setError(null);
    const result = await deleteKnowledge(source.id);
    // 404: it's already gone (another tab). Same outcome as a delete.
    const done = result.ok || result.code === "not_found";
    if (!mounted.current) {
      if (done) onDeleted();
      return;
    }
    setSending(false);
    if (!done) return setError(result.message);
    onDeleted();
  }

  return (
    <div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={sending} autoFocus>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={sending} aria-describedby={error ? errorId : undefined}>
          {sending ? "Deleting…" : "Delete source"}
        </Button>
      </div>
    </div>
  );
}
