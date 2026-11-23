"use client";

import {
  DEFAULT_WIDGET_CONFIG,
  HEX_COLOR_PATTERN,
  WIDGET_ANIMATIONS,
  WIDGET_HEADER_TEXT_MAX_LENGTH,
  WIDGET_LABEL_MAX_LENGTH,
  type WidgetAnimation,
  type WidgetConfig,
  type WidgetPosition,
} from "@askwell/shared";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { BILLING_PATH } from "../../lib/auth/routes";
import { FieldError, TextInput } from "../projects/field";
import { Button, ButtonLink } from "../ui/button";
import { cn } from "../ui/cn";
import { GlassPanel } from "../ui/glass-panel";
import { changedFields, NO_CHANGES, previewConfig, submitConfig, type ConfigField, type FieldErrors, type SaveFn } from "./form-state";
import { saveWidgetConfig } from "./save";
import { WidgetPreview } from "./widget-preview";

const POSITION_LABELS: Record<WidgetPosition, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};
// Corners laid out as they sit on a page.
const POSITION_GRID: readonly WidgetPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

const ANIMATION_LABELS: Record<WidgetAnimation, string> = { fade: "Fade", slide: "Slide", scale: "Scale" };

export const SAVED_MESSAGE = "Saved. Your widget shows the new look the next time your site loads.";

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string; upgrade: boolean };

type CustomizeViewProps = {
  projectId: string;
  /** From the plan read on the server. Free: the form is shown but locked. */
  canCustomize: boolean;
  /** What the widget shows today: the stored config on Pro, the defaults on Free. */
  initial: WidgetConfig;
  /** Injected in tests. */
  save?: SaveFn;
};

export function CustomizeView({ projectId, canCustomize, initial, save = saveWidgetConfig }: CustomizeViewProps) {
  const [saved, setSaved] = useState<WidgetConfig>(initial);
  const [draft, setDraft] = useState<WidgetConfig>(initial);
  // What the preview shows: the latest valid value of each field, so a half-typed color or a
  // cleared text keeps the last good one. Separate from `saved`, the baseline for changes.
  const [preview, setPreview] = useState<WidgetConfig>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const ids = useId();

  const changes = changedFields(saved, draft);
  const dirty = Object.keys(changes).length > 0;
  const saving = status.kind === "saving";

  function update<K extends ConfigField>(field: K, value: WidgetConfig[K]) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    setPreview((current) => previewConfig(next, current));
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    if (status.kind !== "saving") setStatus({ kind: "idle" });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setStatus({ kind: "saving" });
    const result = await submitConfig(projectId, saved, draft, save);
    switch (result.kind) {
      case "unchanged":
        setStatus({ kind: "error", message: NO_CHANGES, upgrade: false });
        return;
      case "invalid":
        setErrors(result.errors);
        setStatus({ kind: "idle" });
        return;
      case "saved":
        setSaved(result.config);
        setDraft(result.config);
        setPreview(result.config);
        setStatus({ kind: "saved" });
        return;
      case "error":
        setStatus({ kind: "error", message: result.message, upgrade: result.upgrade });
    }
  }

  const field = (name: string) => `${ids}-${name}`;
  const colorValid = HEX_COLOR_PATTERN.test(draft.buttonColor);

  return (
    <div className="flex flex-col gap-6">
      {canCustomize ? null : (
        <GlassPanel role="note" className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Customizing the widget is a Pro feature</p>
            <p className="mt-1 text-sm text-fg-muted">
              Your widget uses the default look below. Upgrade to change its color, corner, text and animation.
            </p>
          </div>
          <ButtonLink href={BILLING_PATH} className="shrink-0">
            Upgrade to Pro
          </ButtonLink>
        </GlassPanel>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <GlassPanel className="min-w-0 p-5 sm:p-6">
          <form onSubmit={onSubmit} noValidate aria-label="Widget look">
            <fieldset
              disabled={!canCustomize || saving}
              className={cn("flex min-w-0 flex-col gap-6", !canCustomize && "opacity-60")}
            >
              <legend className="sr-only">Widget look</legend>

              <Field label="Button color" htmlFor={field("color")} error={errors.buttonColor} errorId={field("color-error")}>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    aria-label="Pick a button color"
                    value={(colorValid ? draft.buttonColor : saved.buttonColor).toLowerCase()}
                    onChange={(event) => update("buttonColor", event.target.value)}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-control border border-glass-line bg-glass-strong p-1 disabled:cursor-not-allowed"
                  />
                  <TextInput
                    id={field("color")}
                    value={draft.buttonColor}
                    onChange={(event) => update("buttonColor", event.target.value.trim())}
                    maxLength={7}
                    spellCheck={false}
                    autoComplete="off"
                    className="font-mono uppercase"
                    aria-invalid={errors.buttonColor ? true : undefined}
                    aria-describedby={errors.buttonColor ? field("color-error") : undefined}
                  />
                </div>
              </Field>

              <ChoiceGroup legend="Position">
                <div className="grid grid-cols-2 gap-2">
                  {POSITION_GRID.map((position) => (
                    <Choice
                      key={position}
                      name={field("position")}
                      checked={draft.position === position}
                      onChange={() => update("position", position)}
                      label={POSITION_LABELS[position]}
                    />
                  ))}
                </div>
              </ChoiceGroup>

              <Field
                label="Button label"
                htmlFor={field("label")}
                hint={`${draft.label.length} / ${WIDGET_LABEL_MAX_LENGTH}`}
                error={errors.label}
                errorId={field("label-error")}
              >
                <TextInput
                  id={field("label")}
                  value={draft.label}
                  onChange={(event) => update("label", event.target.value)}
                  maxLength={WIDGET_LABEL_MAX_LENGTH}
                  autoComplete="off"
                  aria-invalid={errors.label ? true : undefined}
                  aria-describedby={errors.label ? field("label-error") : undefined}
                />
              </Field>

              <ChoiceGroup legend="Open animation">
                <div className="grid grid-cols-3 gap-2">
                  {WIDGET_ANIMATIONS.map((animation) => (
                    <Choice
                      key={animation}
                      name={field("animation")}
                      checked={draft.animation === animation}
                      onChange={() => update("animation", animation)}
                      label={ANIMATION_LABELS[animation]}
                    />
                  ))}
                </div>
              </ChoiceGroup>

              <Field
                label="Header text"
                htmlFor={field("header")}
                hint={`${draft.headerText.length} / ${WIDGET_HEADER_TEXT_MAX_LENGTH}`}
                error={errors.headerText}
                errorId={field("header-error")}
              >
                <TextInput
                  id={field("header")}
                  value={draft.headerText}
                  onChange={(event) => update("headerText", event.target.value)}
                  maxLength={WIDGET_HEADER_TEXT_MAX_LENGTH}
                  autoComplete="off"
                  aria-invalid={errors.headerText ? true : undefined}
                  aria-describedby={errors.headerText ? field("header-error") : undefined}
                />
              </Field>

              <label className="flex cursor-pointer items-start gap-3 text-sm has-disabled:cursor-not-allowed">
                <input
                  type="checkbox"
                  checked={draft.showBadge}
                  onChange={(event) => update("showBadge", event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-black"
                />
                <span>
                  <span className="font-medium">Show &ldquo;Powered by&rdquo; badge</span>
                  <span className="block text-fg-muted">A small line under the message box.</span>
                </span>
              </label>

              <div className="flex flex-col-reverse gap-3 border-t border-glass-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft({ ...DEFAULT_WIDGET_CONFIG });
                    setPreview({ ...DEFAULT_WIDGET_CONFIG });
                    setErrors({});
                    setStatus({ kind: "idle" });
                  }}
                >
                  Reset to defaults
                </Button>
                <Button type="submit" disabled={canCustomize && !dirty}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </fieldset>
          </form>

          <SaveStatus status={status} />
        </GlassPanel>

        <GlassPanel className="min-w-0 p-5 sm:p-6">
          <WidgetPreview config={preview} />
        </GlassPanel>
      </div>
    </div>
  );
}

function SaveStatus({ status }: { status: Status }) {
  return (
    <div aria-live="polite" className="mt-4 min-h-5 text-sm">
      {status.kind === "saved" ? <p role="status">{SAVED_MESSAGE}</p> : null}
      {status.kind === "error" ? (
        <p role="alert" className="text-fg">
          {status.message}{" "}
          {status.upgrade ? (
            <a href={BILLING_PATH} className="font-medium underline underline-offset-2">
              See plans
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  errorId: string;
  children: ReactNode;
};

function Field({ label, htmlFor, hint, error, errorId, children }: FieldProps) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {hint ? <span className="text-xs text-fg-subtle tabular-nums">{hint}</span> : null}
      </div>
      {children}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

function ChoiceGroup({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Choice({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label
      className={cn(
        "flex h-10 cursor-pointer items-center justify-center rounded-control border px-3 text-sm transition-colors",
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-fg has-disabled:cursor-not-allowed",
        checked ? "border-fg bg-primary text-primary-fg" : "border-glass-line bg-glass-strong text-fg hover:bg-glass",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {label}
    </label>
  );
}
