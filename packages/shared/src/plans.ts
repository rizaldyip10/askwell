// Plan limits live here and only here (project.md §5).
// The server reads the plan and passes these values to the Postgres functions.

export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];
export type PlanLimits = { projects: number; messagesPerMonth: number; knowledgeSources: number; customWidget: boolean; showBadge: boolean };
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { projects: 1, messagesPerMonth: 100, knowledgeSources: 3, customWidget: false, showBadge: true },
  pro:  { projects: 5, messagesPerMonth: 2000, knowledgeSources: 25, customWidget: true, showBadge: false },
};
