// Customize form logic (project.md §6.8). Pure, so it's unit tested; customize-view.tsx wires it.

import type { ApiResult } from "../projects/api";
import {
  HEX_COLOR_PATTERN,
  updateWidgetConfigRequestSchema,
  type UpdateWidgetConfigRequest,
  type UpdateWidgetConfigResponse,
  type WidgetConfig,
} from "@askwell/shared";

export type ConfigField = keyof WidgetConfig;
export type FieldErrors = Partial<Record<ConfigField, string>>;

const FIELDS: readonly ConfigField[] = ["buttonColor", "position", "label", "animation", "headerText", "showBadge"];

function same(field: ConfigField, a: WidgetConfig[ConfigField], b: WidgetConfig[ConfigField]): boolean {
  if (field === "buttonColor") return String(a).toLowerCase() === String(b).toLowerCase();
  if (field === "label" || field === "headerText") return String(a).trim() === String(b).trim();
  return a === b;
}

/** Only the fields the owner changed since the last save. Text is compared trimmed, colors ignore case. */
export function changedFields(saved: WidgetConfig, draft: WidgetConfig): Partial<WidgetConfig> {
  const changes: Partial<WidgetConfig> = {};
  for (const field of FIELDS) {
    if (!same(field, saved[field], draft[field])) Object.assign(changes, { [field]: draft[field] });
  }
  return changes;
}

export type Validation = { ok: true; request: UpdateWidgetConfigRequest } | { ok: false; errors: FieldErrors };

/**
 * Checks the changed fields with the same shared schema the server uses. The request carries
 * the trimmed values. Messages are the owner's, keyed by field.
 */
export function validateChanges(changes: Partial<WidgetConfig>): Validation {
  const parsed = updateWidgetConfigRequestSchema.safeParse(changes);
  if (parsed.success) return { ok: true, request: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && (FIELDS as readonly string[]).includes(field)) {
      errors[field as ConfigField] ??= fieldMessage(field as ConfigField);
    }
  }
  return { ok: false, errors };
}

function fieldMessage(field: ConfigField): string {
  switch (field) {
    case "buttonColor":
      return "Use a hex color like #1a2b3c.";
    case "label":
      return "Enter a button label.";
    case "headerText":
      return "Enter a header text.";
    default:
      return "Pick one of the options.";
  }
}

/** A valid hex color for the preview: the draft while it's valid, else the fallback. */
export function previewColor(draft: string, fallback: string): string {
  return HEX_COLOR_PATTERN.test(draft) ? draft : fallback;
}

/**
 * The next preview: the draft, with an unfinished color or empty text kept at `fallback`. Pass the
 * previous preview as `fallback`, so each field keeps its latest valid value (not the saved one).
 */
export function previewConfig(draft: WidgetConfig, fallback: WidgetConfig): WidgetConfig {
  return {
    ...draft,
    buttonColor: previewColor(draft.buttonColor, fallback.buttonColor),
    label: draft.label.trim() || fallback.label,
    headerText: draft.headerText.trim() || fallback.headerText,
  };
}

export const UPGRADE_TO_SAVE = "Pro feature: upgrade to save.";
export const NO_CHANGES = "No changes to save.";

export type SaveFn = (projectId: string, request: UpdateWidgetConfigRequest) => Promise<ApiResult<UpdateWidgetConfigResponse>>;

export type SubmitResult =
  | { kind: "unchanged" }
  | { kind: "invalid"; errors: FieldErrors }
  | { kind: "saved"; config: WidgetConfig }
  | { kind: "error"; message: string; upgrade: boolean };

/**
 * One Save: send only the changed fields (checked with the shared schema first), then map the
 * answer. The plan isn't checked here: a Free save still goes out, and the server's 402 reads
 * "upgrade to save".
 */
export async function submitConfig(
  projectId: string,
  saved: WidgetConfig,
  draft: WidgetConfig,
  save: SaveFn,
): Promise<SubmitResult> {
  const changes = changedFields(saved, draft);
  if (Object.keys(changes).length === 0) return { kind: "unchanged" };
  const checked = validateChanges(changes);
  if (!checked.ok) return { kind: "invalid", errors: checked.errors };
  const result = await save(projectId, checked.request);
  if (result.ok) return { kind: "saved", config: result.data.config };
  const upgrade = result.status === 402 || result.code === "payment_required";
  return { kind: "error", message: upgrade ? UPGRADE_TO_SAVE : result.message, upgrade };
}
