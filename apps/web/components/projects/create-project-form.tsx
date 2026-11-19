"use client";

import { PROJECT_NAME_MAX_LENGTH, type CreateProjectResponse } from "@askwell/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { BILLING_PATH } from "../../lib/auth/routes";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { requestJson, validateProjectName, type ApiFailure } from "./api";
import { FieldError, TextInput } from "./field";

type FormError = { message: string; upgrade: boolean };

/**
 * Name field + "Create project". The plan limit is checked by the server only (§5): on 403
 * plan_limit this shows the API's message with a link to Billing.
 */
export function CreateProjectForm({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<FormError | null>(null);
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = sending || refreshing;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const checked = validateProjectName(name);
    if (!checked.ok) return setError({ message: checked.message, upgrade: false });

    setSending(true);
    setError(null);
    const result = await requestJson<CreateProjectResponse>("POST", "/api/projects", { name: checked.name });
    setSending(false);

    if (!result.ok) return setError(formError(result));
    setName("");
    startRefresh(() => router.refresh());
  }

  return (
    <form onSubmit={onSubmit} noValidate className={cn("w-full", className)}>
      <label htmlFor={inputId} className="mb-2 block text-left text-sm font-medium">
        Project name
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <TextInput
          id={inputId}
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My website"
          maxLength={PROJECT_NAME_MAX_LENGTH}
          autoComplete="off"
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <Button type="submit" disabled={busy} className="shrink-0">
          {busy ? "Creating…" : "Create project"}
        </Button>
      </div>
      {error ? (
        <FieldError id={errorId}>
          {error.message}{" "}
          {error.upgrade ? (
            <Link href={BILLING_PATH} className="font-medium underline underline-offset-4">
              Go to Billing
            </Link>
          ) : null}
        </FieldError>
      ) : null}
    </form>
  );
}

function formError(failure: ApiFailure): FormError {
  return { message: failure.message, upgrade: failure.code === "plan_limit" };
}
