import { isWidgetMessage, type WidgetConfig } from "@askwell/shared/widget";
import { readableTextColor } from "./color";
import type { LoaderSetup } from "./setup";
import { STYLES } from "./styles";

export const HOST_TAG = "askwell-widget";
const MIN_HEIGHT = 320;
const MAX_HEIGHT = 600;
const CLOSE_MS = 200;
const ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';

export type WidgetHandle = {
  host: HTMLElement;
  button: HTMLButtonElement;
  /** The panel iframe, once the button has been clicked. */
  frame(): HTMLIFrameElement | null;
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  destroy(): void;
};

/** `/embed` URL for the panel. `origin` is the host page's origin, the panel's only postMessage target. */
export function embedUrl(appOrigin: string, key: string, hostOrigin: string): string {
  return `${appOrigin}/embed?key=${encodeURIComponent(key)}&origin=${encodeURIComponent(hostOrigin)}`;
}

/** Clamps a panel height from `askwell:resize` to what fits. */
export function clampHeight(height: number, viewportHeight: number): number {
  return Math.round(Math.min(Math.max(height, MIN_HEIGHT), MAX_HEIGHT, Math.max(viewportHeight - 108, MIN_HEIGHT)));
}

/**
 * Renders the button in a shadow root on one element appended to <body>.
 * Nothing else on the host page changes (project.md §6.5 Isolation).
 */
export function mountWidget(setup: LoaderSetup, config: WidgetConfig, win: Window = window): WidgetHandle {
  const doc = win.document;
  const host = doc.createElement(HOST_TAG);
  const root = host.attachShadow({ mode: "open" });

  const style = doc.createElement("style");
  style.textContent = STYLES;

  const button = doc.createElement("button");
  button.type = "button";
  button.className = `btn ${config.position}`;
  button.style.background = config.buttonColor;
  button.style.color = readableTextColor(config.buttonColor);
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = ICON;
  const label = doc.createElement("span");
  label.textContent = config.label;
  const dot = doc.createElement("span");
  dot.className = "dot";
  dot.hidden = true;
  dot.setAttribute("aria-hidden", "true");
  button.append(label, dot);

  root.append(style, button);
  doc.body.appendChild(host);

  let frame: HTMLIFrameElement | null = null;
  let open = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const setUnread = (count: number) => {
    dot.hidden = count === 0;
    dot.textContent = count > 9 ? "9+" : String(count);
    button.setAttribute("aria-label", count > 0 ? `${config.label} (${count} unread)` : config.label);
  };
  setUnread(0);

  const ensureFrame = (): HTMLIFrameElement => {
    if (frame) return frame;
    frame = doc.createElement("iframe");
    frame.className = `frame ${config.animation} ${config.position}`;
    frame.title = config.headerText || config.label;
    frame.id = "askwell-panel";
    frame.src = embedUrl(setup.appOrigin, setup.key, win.location.origin);
    root.append(frame);
    button.setAttribute("aria-controls", frame.id);
    return frame;
  };

  const show = () => {
    const f = ensureFrame();
    clearTimeout(hideTimer);
    f.classList.remove("gone");
    void f.offsetWidth; // start the transition from the closed state
    f.classList.add("open");
    open = true;
    button.setAttribute("aria-expanded", "true");
    f.focus();
  };

  const hide = (restoreFocus = true) => {
    if (!frame || !open) return;
    const f = frame;
    f.classList.remove("open");
    open = false;
    button.setAttribute("aria-expanded", "false");
    // Fully hide after the transition so the panel can tell it is out of view.
    hideTimer = setTimeout(() => f.classList.add("gone"), CLOSE_MS);
    if (restoreFocus) button.focus();
  };

  const toggle = () => (open ? hide() : show());

  const onMessage = (event: MessageEvent) => {
    // Only the panel we opened, served from the app origin. A null source never matches.
    const panel = frame?.contentWindow;
    if (!frame || !panel || event.source !== panel || event.origin !== setup.appOrigin) return;
    if (!isWidgetMessage(event.data)) return;
    const message = event.data;
    switch (message.type) {
      case "askwell:close":
        hide();
        break;
      case "askwell:resize":
        frame.style.height = `${clampHeight(message.height, win.innerHeight)}px`;
        break;
      case "askwell:unread":
        setUnread(message.count);
        break;
      case "askwell:ready":
        break;
    }
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) hide();
  };

  button.addEventListener("click", toggle);
  win.addEventListener("message", onMessage);
  doc.addEventListener("keydown", onKeydown);

  return {
    host,
    button,
    frame: () => frame,
    isOpen: () => open,
    open: show,
    close: () => hide(false),
    toggle,
    destroy() {
      clearTimeout(hideTimer);
      win.removeEventListener("message", onMessage);
      doc.removeEventListener("keydown", onKeydown);
      host.remove();
    },
  };
}
