"use client";

import { useId, useState, type ChangeEvent } from "react";
import { buttonClasses } from "../ui/button";
import { cn } from "../ui/cn";
import { uploadKnowledgeFile, type UploadStep } from "./api";
import { KNOWLEDGE_FILE_ACCEPT, checkKnowledgeFile } from "./checks";
import { FormErrorMessage, toFormError, type FormError } from "./form-error";

const STEP_LABEL: Record<UploadStep, string> = {
  reserving: "Preparing…",
  uploading: "Uploading…",
  finalizing: "Checking the file…",
};

/**
 * File picker: PDF, Markdown or TXT, up to 10 MB, checked here first (the server checks
 * again). Picking a file uploads it right away: upload-url → Storage → finalize.
 */
export function UploadForm({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const statusId = useId();
  const [step, setStep] = useState<UploadStep | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<FormError | null>(null);
  const busy = step !== null;

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset the picker so choosing the same file again still fires a change.
    event.target.value = "";
    if (!file || busy) return;

    setError(null);
    const checked = checkKnowledgeFile(file);
    if (!checked.ok) return setError({ message: checked.message, upgrade: false });

    setFileName(file.name);
    const result = await uploadKnowledgeFile(projectId, file, checked.type, setStep);
    setStep(null);
    setFileName(null);
    if (!result.ok) return setError(toFormError(result));
    onAdded();
  }

  return (
    <div>
      <p id={hintId} className="mb-3 text-sm text-fg-muted">
        PDF, Markdown or TXT, up to 10 MB.
      </p>
      <input
        id={inputId}
        type="file"
        accept={KNOWLEDGE_FILE_ACCEPT}
        onChange={onChange}
        disabled={busy}
        className="peer sr-only"
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
      />
      <label
        htmlFor={inputId}
        className={cn(
          buttonClasses({ variant: "secondary" }),
          // The real input is visually hidden but keeps keyboard focus; its ring shows here.
          "cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fg",
          busy && "pointer-events-none opacity-50",
        )}
      >
        {busy ? "Uploading…" : "Choose a file"}
      </label>
      {busy && step ? (
        <p id={statusId} role="status" className="mt-3 flex min-w-0 items-center gap-2 text-sm text-fg-muted">
          <Spinner />
          <span className="min-w-0 truncate">
            {STEP_LABEL[step]} {fileName}
          </span>
        </p>
      ) : null}
      {error ? <FormErrorMessage id={errorId} error={error} /> : null}
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 shrink-0 rounded-full border-2 border-fg-subtle border-t-fg motion-safe:animate-spin"
    />
  );
}
