import { PLAN_LIMITS, type Plan, type ProjectUsage } from "@askwell/shared";
import Link from "next/link";
import { BILLING_PATH } from "../../lib/auth/routes";
import { summarizeUsage } from "../../lib/usage/format";
import { formatDate } from "../projects/format";
import { Badge } from "../ui/badge";
import { cn } from "../ui/cn";
import { GlassPanel } from "../ui/glass-panel";
import { UsageBar } from "./usage-bar";

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

/**
 * The project overview's Usage panel (project.md §6.12): "N / limit messages this month",
 * a bar and the reset date. `usage` null → "Usage unavailable"; the rest of the page renders.
 */
export function UsagePanel({
  usage,
  plan,
  className,
}: {
  usage: ProjectUsage | null;
  plan: Plan | null;
  className?: string;
}) {
  return (
    <GlassPanel as="section" aria-labelledby="usage-heading" className={cn("min-w-0 p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="usage-heading" className="text-base font-semibold tracking-tight">
          Usage
        </h2>
        {usage ? <UsageLabel usage={usage} /> : null}
      </div>
      {usage ? <UsageDetails usage={usage} plan={plan} /> : (
        <p className="mt-1 text-sm text-fg-muted">Usage unavailable. Refresh the page to try again.</p>
      )}
    </GlassPanel>
  );
}

function UsageLabel({ usage }: { usage: ProjectUsage }) {
  const { label, state } = summarizeUsage(usage.used, usage.limit);
  if (!label) return null;
  return <Badge variant={state === "at" ? "solid" : "outline"}>{label}</Badge>;
}

function UsageDetails({ usage, plan }: { usage: ProjectUsage; plan: Plan | null }) {
  const summary = summarizeUsage(usage.used, usage.limit);
  return (
    <>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
        {summary.count} <span className="text-sm font-normal text-fg-muted">messages this month</span>
      </p>
      <UsageBar summary={summary} label="Messages used this month" className="mt-3" />
      <p className="mt-2 text-sm text-fg-muted">
        Resets <time dateTime={usage.periodEnd}>{formatDate(usage.periodEnd)}</time>
      </p>
      {summary.state === "at" ? (
        <p className="mt-3 text-sm text-fg">
          The widget now shows visitors the quota message until the count resets.
          {plan === "free" ? (
            <>
              {" "}
              <Link href={BILLING_PATH} className="font-medium underline underline-offset-4">
                Upgrade to Pro
              </Link>{" "}
              for {NUMBER_FORMAT.format(PLAN_LIMITS.pro.messagesPerMonth)} messages a month.
            </>
          ) : null}
        </p>
      ) : null}
    </>
  );
}
