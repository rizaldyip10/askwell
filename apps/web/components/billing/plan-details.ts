// What a plan includes and where a Free owner is over a limit. Everything comes from
// PLAN_LIMITS (packages/shared), so no number is written here.

import { PLAN_LIMITS, type Plan } from "@askwell/shared";

export const PLAN_LABEL: Record<Plan, string> = { free: "Free", pro: "Pro" };

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

/** One line per limit, e.g. "5 projects", "2,000 messages a month per project". */
export function planFeatures(plan: Plan): string[] {
  const limits = PLAN_LIMITS[plan];
  return [
    count(limits.projects, "project", "projects"),
    `${count(limits.messagesPerMonth, "message", "messages")} a month per project`,
    `${count(limits.knowledgeSources, "knowledge source", "knowledge sources")} per project`,
    limits.customWidget ? "Customize the widget's color, position, label, header and animation" : "Default widget look",
    limits.showBadge ? `"Powered by" badge shown` : `"Powered by" badge hidden`,
  ];
}

/** What the owner has now, read on the server. */
export type OwnerUsageCounts = { projects: number; sourcesPerProject: { name: string; sources: number }[] };

/**
 * Notes for limits the owner is over on `plan` (after a downgrade). Over-limit projects and
 * sources keep working; only new ones are refused (product owner, 2026-11-23).
 */
export function overLimitNotes(plan: Plan, usage: OwnerUsageCounts): string[] {
  const limits = PLAN_LIMITS[plan];
  const notes: string[] = [];
  if (usage.projects > limits.projects) {
    notes.push(
      `You have ${count(usage.projects, "project", "projects")}; ${PLAN_LABEL[plan]} includes ${limits.projects}. They all keep working, but you can't create a new one.`,
    );
  }
  for (const p of usage.sourcesPerProject) {
    if (p.sources > limits.knowledgeSources) {
      notes.push(
        `${p.name} has ${count(p.sources, "knowledge source", "knowledge sources")}; ${PLAN_LABEL[plan]} includes ${limits.knowledgeSources}. They keep working, but you can't add more.`,
      );
    }
  }
  return notes;
}

/** How often, and how many times, the page re-reads the plan after checkout. */
export const PROCESSING_POLL_MS = 2000;
export const PROCESSING_MAX_POLLS = 15; // 30 seconds, then a Refresh button

/** The search param Clerk's checkout returns with (`newSubscriptionRedirectUrl`). */
export const CHECKOUT_PARAM = "checkout";

export type UpgradeStatus = "none" | "processing" | "slow" | "done";

/**
 * The upgrade banner. After checkout the plan changes only when the webhook lands, so the page
 * shows "processing" while it re-reads the plan from the server, "slow" once it gave up, and
 * "done" when the server says Pro. The client never decides the plan.
 */
export function upgradeStatus(plan: Plan, returnedFromCheckout: boolean, polls: number): UpgradeStatus {
  if (!returnedFromCheckout) return "none";
  if (plan === "pro") return "done";
  return polls >= PROCESSING_MAX_POLLS ? "slow" : "processing";
}
