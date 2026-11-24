import { APP_NAME } from "@askwell/shared";
import type { ReactNode } from "react";
import { TAP_SIZE } from "../ui/tap-target";

// Presentational parts of the chat panel, shared by /embed (ChatPanel) and the Customize
// page's live preview. No state, no messaging: callers wire the behavior. Text is always
// rendered as text, never HTML (project.md §9 XSS).

/** The panel's background: the whole iframe in /embed, the panel card in the preview. */
export const PANEL_SURFACE = "bg-linear-to-b from-white to-gray-100 text-fg";

type PanelHeaderProps = {
  headerText: string;
  /** /embed's page heading is an h1; the preview sits inside a page that has its own. */
  as?: "h1" | "p";
  /** The close button's click. Without it the button is shown but does nothing (preview). */
  onClose?: () => void;
};

/** The header bar: the header text and a close button. */
export function PanelHeader({ headerText, as: Heading = "h1", onClose }: PanelHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-glass-line bg-glass-strong px-4 py-3 backdrop-blur-glass">
      <Heading className="truncate text-sm font-semibold tracking-tight">{headerText}</Heading>
      <button
        type="button"
        aria-label="Close chat"
        onClick={onClose}
        className={`grid size-8 ${TAP_SIZE} shrink-0 place-items-center rounded-pill text-fg-muted transition-colors hover:bg-glass hover:text-fg focus-visible:outline-2 focus-visible:outline-fg`}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </header>
  );
}

/** The footer bar around the input. */
export function PanelFooter({ children }: { children: ReactNode }) {
  return <div className="border-t border-glass-line bg-glass-strong px-3 pt-3 pb-2 backdrop-blur-glass">{children}</div>;
}

/** "Powered by Askwell" under the input (Free, or Pro with the badge on). */
export function PoweredBy() {
  return <p className="mt-2 text-center text-[11px] text-fg-subtle">Powered by {APP_NAME}</p>;
}

/** The round send button's arrow icon. */
export function SendIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
    </svg>
  );
}
