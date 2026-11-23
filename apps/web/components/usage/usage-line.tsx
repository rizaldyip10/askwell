import type { ProjectUsage } from "@askwell/shared";
import { summarizeUsage } from "../../lib/usage/format";
import { cn } from "../ui/cn";
import { UsageBar } from "./usage-bar";

/** The compact usage line on a project card: "42 / 100 messages", a thin bar, the state in words. */
export function UsageLine({ usage, className }: { usage: ProjectUsage | null; className?: string }) {
  if (!usage) {
    return <p className={cn("text-sm text-fg-muted", className)}>Usage unavailable</p>;
  }
  const summary = summarizeUsage(usage.used, usage.limit);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <p className="flex items-baseline justify-between gap-2 text-sm">
        <span className="tabular-nums">
          {summary.count} <span className="text-fg-muted">messages</span>
        </span>
        {summary.label ? (
          <span className={cn("text-xs font-medium", summary.state === "at" ? "text-fg" : "text-fg-muted")}>
            {summary.label}
          </span>
        ) : null}
      </p>
      <UsageBar summary={summary} label="Messages used this month" />
    </div>
  );
}
