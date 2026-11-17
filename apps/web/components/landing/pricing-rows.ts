import type { PlanLimits } from "@askwell/shared";

export type PricingRow = {
  label: string;
  value: (limits: PlanLimits) => string;
};

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** The rows of project.md §5, each derived from a plan's limits. */
export const PRICING_ROWS: readonly PricingRow[] = [
  { label: "Projects", value: (l) => formatCount(l.projects) },
  { label: "Messages / month (per project)", value: (l) => formatCount(l.messagesPerMonth) },
  { label: "Knowledge sources (per project, files + pasted text)", value: (l) => formatCount(l.knowledgeSources) },
  { label: "Button color", value: (l) => (l.customWidget ? "Any" : "Default") },
  { label: "Button position", value: (l) => (l.customWidget ? "Any corner" : "Bottom right") },
  { label: "Button label", value: (l) => (l.customWidget ? "Custom" : "Default") },
  { label: "Open animation", value: (l) => (l.customWidget ? "Fade / slide / scale" : "Fade") },
  { label: "Header text", value: (l) => (l.customWidget ? "Custom" : "Default") },
  { label: "“Powered by” badge", value: (l) => (l.showBadge ? "Shown" : "Hidden") },
];
