"use client";

import type { WidgetAnimation, WidgetConfig, WidgetPosition } from "@askwell/shared";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ChatMessage } from "../../lib/embed/chat-state";
import { MessageBubble } from "../embed/message-bubble";
import { PANEL_SURFACE, PanelFooter, PanelHeader, PoweredBy, SendIcon } from "../embed/panel-parts";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { readableTextColor } from "./color";

// A static picture of the widget on a page: the button and the open panel, as the loader
// (apps/widget) and /embed draw them. No iframe, no chat calls. `inert`, so nothing inside
// takes focus or clicks. Every text is rendered as text, never HTML (project.md §9 XSS).

const SAMPLE: ChatMessage[] = [
  { id: "1", role: "visitor", text: "Do you ship abroad?" },
  { id: "2", role: "bot", text: "Yes. We ship to most countries in 3 to 7 days." },
];

const BUTTON_CORNER: Record<WidgetPosition, string> = {
  "bottom-right": "right-4 bottom-4",
  "bottom-left": "left-4 bottom-4",
  "top-right": "right-4 top-4",
  "top-left": "left-4 top-4",
};

// The panel sits above a bottom button and below a top one, like the loader's frame.
const PANEL_CORNER: Record<WidgetPosition, string> = {
  "bottom-right": "right-4 bottom-[4.5rem] origin-bottom-right",
  "bottom-left": "left-4 bottom-[4.5rem] origin-bottom-left",
  "top-right": "right-4 top-[4.5rem] origin-top-right",
  "top-left": "left-4 top-[4.5rem] origin-top-left",
};

/** The panel's closed state for an animation (the loader's .frame.fade / .slide / .scale). */
export function closedTransform(animation: WidgetAnimation, position: WidgetPosition): string {
  if (animation === "scale") return "scale(0.92)";
  if (animation === "slide") return position.startsWith("top") ? "translateY(-16px)" : "translateY(16px)";
  return "none";
}

type Phase = "open" | "reset";

export function WidgetPreview({ config }: { config: WidgetConfig }) {
  const [phase, setPhase] = useState<Phase>("open");
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => () => cancelAnimationFrame(frame.current ?? 0), []);

  // Snap the panel to its closed state with no transition, then open it on a later frame so
  // the open transition runs with the chosen animation.
  function play() {
    cancelAnimationFrame(frame.current ?? 0);
    setPhase("reset");
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => setPhase("open"));
    });
  }

  const panelStyle: CSSProperties =
    phase === "open"
      ? { opacity: 1, transform: "none" }
      : { opacity: 0, transform: closedTransform(config.animation, config.position) };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Preview</p>
        <Button variant="secondary" onClick={play} aria-label={`Play the ${config.animation} animation`}>
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="currentColor">
            <path d="M5 3.5v9l7-4.5z" />
          </svg>
          Play
        </Button>
      </div>

      <div
        inert
        data-testid="widget-preview"
        className="relative h-[460px] overflow-hidden rounded-panel border border-glass-line bg-gray-50 shadow-glass"
      >
        <SitePlaceholder />

        <div
          data-testid="preview-panel"
          data-animation={config.animation}
          style={panelStyle}
          className={cn(
            "absolute h-[300px] w-[min(300px,calc(100%-2rem))] rounded-[20px] shadow-[0_24px_64px_-16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(0,0,0,0.08)]",
            PANEL_CORNER[config.position],
            phase === "open" ? "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none" : "transition-none",
          )}
        >
          {/* clip-path, not just overflow-hidden: Chromium lets the header's backdrop blur
              paint past rounded corners otherwise. The shadow stays on the outer card. */}
          <div className={cn("flex h-full flex-col overflow-hidden rounded-[20px] [clip-path:inset(0_round_20px)]", PANEL_SURFACE)}>
            <PanelHeader as="p" headerText={config.headerText} />
            <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-4 py-4">
              {SAMPLE.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </ol>
            <PanelFooter>
              <div className="flex items-center gap-2">
                <div className="flex h-10 min-w-0 flex-1 items-center rounded-pill border border-glass-line bg-white px-4 text-sm text-fg-subtle">
                  Type your message…
                </div>
                <div className="grid size-10 shrink-0 place-items-center rounded-pill bg-primary text-primary-fg opacity-40">
                  <SendIcon />
                </div>
              </div>
              {config.showBadge ? <PoweredBy /> : null}
            </PanelFooter>
          </div>
        </div>

        <div
          data-testid="preview-button"
          data-position={config.position}
          style={{ background: config.buttonColor, color: readableTextColor(config.buttonColor) }}
          className={cn(
            "absolute inline-flex h-12 max-w-[calc(100%-2rem)] items-center gap-2 rounded-pill px-[18px] text-[15px] leading-none font-semibold shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45),0_0_0_1px_rgba(0,0,0,0.06)]",
            BUTTON_CORNER[config.position],
          )}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
          <span className="truncate">{config.label}</span>
        </div>
      </div>
    </div>
  );
}

/** A faint page behind the widget, so the corners read as a website. */
function SitePlaceholder() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 p-6 opacity-60">
      <div className="h-4 w-1/3 rounded-full bg-gray-200" />
      <div className="h-3 w-2/3 rounded-full bg-gray-200" />
      <div className="h-3 w-1/2 rounded-full bg-gray-200" />
      <div className="mt-4 h-24 w-full rounded-control bg-gray-200/70" />
      <div className="h-3 w-3/5 rounded-full bg-gray-200" />
    </div>
  );
}
