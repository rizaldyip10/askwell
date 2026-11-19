// Zod-free entry for the widget loader: `@askwell/shared/widget` (project.md §6.5, §9).
// The loader runs on customer sites, so nothing here may import zod or other runtime deps.
// Everything here is also exported from the package root.

import type { WidgetConfig } from "./domain";

export { WIDGET_ANIMATIONS, WIDGET_POSITIONS } from "./enums";
export type { WidgetAnimation, WidgetPosition } from "./enums";
export type { WidgetConfig } from "./domain";

export const APP_NAME = "Askwell";

export const PUBLIC_KEY_PREFIX = "pk_";
/** `pk_` followed by 16–64 random URL-safe alphanumeric characters. */
export const PUBLIC_KEY_PATTERN = /^pk_[A-Za-z0-9]{16,64}$/;

/** Default widget config (product owner decision). New projects start with it; Free always gets it. */
export const DEFAULT_WIDGET_CONFIG: WidgetConfig = Object.freeze({
  buttonColor: "#0A0A0A",
  position: "bottom-right",
  label: "Ask us",
  animation: "fade",
  headerText: "How can we help?",
  showBadge: true,
});

/** Loader ↔ panel postMessage types. Origin checks stay in each app. */
export const WIDGET_MESSAGE_TYPES = [
  "askwell:ready",
  "askwell:close",
  "askwell:resize",
  "askwell:unread",
] as const;
export type WidgetMessageType = (typeof WIDGET_MESSAGE_TYPES)[number];

export type WidgetMessage =
  /** Panel → loader, once the panel is mounted. */
  | { type: "askwell:ready" }
  | { type: "askwell:close" }
  /** Panel height in CSS pixels. */
  | { type: "askwell:resize"; height: number }
  /** Unread bot replies. */
  | { type: "askwell:unread"; count: number };

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** True when `data` is a well-formed WidgetMessage. Rejects unknown types and bad payloads. */
export function isWidgetMessage(data: unknown): data is WidgetMessage {
  if (typeof data !== "object" || data === null) return false;
  const message = data as Record<string, unknown>;
  switch (message.type) {
    case "askwell:ready":
    case "askwell:close":
      return true;
    case "askwell:resize":
      return isNonNegativeFinite(message.height);
    case "askwell:unread":
      return isNonNegativeFinite(message.count) && Number.isInteger(message.count);
    default:
      return false;
  }
}
