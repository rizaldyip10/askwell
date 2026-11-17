// Temporary stand-in for `PLAN_LIMITS` from `@askwell/shared` (A1).
// B2 swaps this for the real import once A1 merges. Keep the shape identical.
export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];
export type PlanLimits = { projects: number; messagesPerMonth: number; knowledgeSources: number; customWidget: boolean; showBadge: boolean };
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { projects: 1, messagesPerMonth: 100, knowledgeSources: 3, customWidget: false, showBadge: true },
  pro:  { projects: 5, messagesPerMonth: 2000, knowledgeSources: 25, customWidget: true, showBadge: false },
};
