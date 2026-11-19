"use client";

import type { DeleteProjectResponse, Project } from "@askwell/shared";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "../ui/button";
import { requestJson } from "./api";
import { Dialog } from "./dialog";
import { FieldError } from "./field";

type DeleteProjectDialogProps = {
  project: Project;
  open: boolean;
  onClose: () => void;
  /** Called after a successful delete, before the refresh. Default: stay on the page. */
  onDeleted?: () => void;
};

export function DeleteProjectDialog({ project, open, onClose, onDeleted }: DeleteProjectDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Delete “${project.name}”?`}
      description="This deletes the project, its widget, knowledge and conversations. The widget stops working on your site. This can't be undone."
    >
      <DeleteActions project={project} onCancel={onClose} onDeleted={onDeleted ?? onClose} />
    </Dialog>
  );
}

function DeleteActions({ project, onCancel, onDeleted }: { project: Project; onCancel: () => void; onDeleted: () => void }) {
  const router = useRouter();
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = sending || refreshing;

  async function onConfirm() {
    if (busy) return;
    setSending(true);
    setError(null);
    const result = await requestJson<DeleteProjectResponse>("DELETE", `/api/projects/${project.id}`);
    setSending(false);

    // 404: it's already gone (another tab, or deleted elsewhere). Same outcome as a delete.
    if (!result.ok && result.code !== "not_found") return setError(result.message);
    startRefresh(() => {
      onDeleted();
      router.refresh();
    });
  }

  return (
    <div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={busy} aria-describedby={error ? errorId : undefined}>
          {busy ? "Deleting…" : "Delete project"}
        </Button>
      </div>
    </div>
  );
}
