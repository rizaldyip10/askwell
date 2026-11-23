import { cn } from "../ui/cn";
import type { UsageSummary } from "../../lib/usage/format";

// Monochrome (§13): the fill darkens with the state, and the state is also in words
// (`summary.label`, shown by the parent) and in the meter's aria-valuetext.
const FILL: Record<UsageSummary["state"], string> = {
  normal: "bg-fg-subtle",
  near: "bg-fg-muted",
  at: "bg-fg",
};

/** A thin usage bar. `label` names what it measures for screen readers. */
export function UsageBar({ summary, label, className }: { summary: UsageSummary; label: string; className?: string }) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={summary.percent}
      aria-valuetext={`${summary.count} messages${summary.label ? `, ${summary.label.toLowerCase()}` : ""}`}
      data-state={summary.state}
      className={cn("h-2 w-full overflow-hidden rounded-pill border border-glass-line bg-glass-strong", className)}
    >
      <div className={cn("h-full rounded-pill", FILL[summary.state])} style={{ width: `${summary.percent}%` }} />
    </div>
  );
}
