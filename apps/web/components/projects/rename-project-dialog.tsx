"use client";

import { PROJECT_NAME_MAX_LENGTH, type Project, type RenameProjectResponse } from "@askwell/shared";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Button } from "../ui/button";
import { requestJson, validateProjectName } from "./api";
import { Dialog } from "./dialog";
import { FieldError, TextInput } from "./field";
import { useMountedRef } from "./use-mounted-ref";

export function RenameProjectDialog({ project, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Rename project">
      <RenameForm project={project} onDone={onClose} />
    </Dialog>
  );
}

function RenameForm({ project, onDone }: { project: Project; onDone: () => void }) {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const [name, setName] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = sending || refreshing;
  const mounted = useMountedRef();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const checked = validateProjectName(name);
    if (!checked.ok) return setError(checked.message);
    if (checked.name === project.name) return onDone();

    setSending(true);
    setError(null);
    const result = await requestJson<RenameProjectResponse>("PATCH", `/api/projects/${project.id}`, { name: checked.name });
    if (!mounted.current) {
      // The dialog was dismissed meanwhile. Show the new data, but leave any reopened dialog alone.
      if (result.ok) router.refresh();
      return;
    }
    setSending(false);

    if (!result.ok) return setError(result.message);
    startRefresh(() => {
      router.refresh();
      onDone();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <label htmlFor={inputId} className="mb-2 block text-sm font-medium">
        Name
      </label>
      <TextInput
        id={inputId}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        maxLength={PROJECT_NAME_MAX_LENGTH}
        autoComplete="off"
        autoFocus
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
