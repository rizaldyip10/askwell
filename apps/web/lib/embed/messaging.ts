import { isWidgetMessage, type WidgetMessage } from "@askwell/shared";

/** Posts to the host page. Always to its exact origin, never `*` (project.md §9). */
export function postToHost(target: Pick<Window, "postMessage">, origin: string, message: WidgetMessage): void {
  target.postMessage(message, origin);
}

/** True only for a well-formed widget message sent from the host page's origin. */
export function isTrustedHostMessage(
  event: Pick<MessageEvent, "origin" | "data">,
  origin: string,
): event is MessageEvent<WidgetMessage> {
  return event.origin === origin && isWidgetMessage(event.data);
}
