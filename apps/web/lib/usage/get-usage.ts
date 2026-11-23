import "server-only";

import { PLAN_LIMITS, type Plan, type ProjectUsage } from "@askwell/shared";
import { readOwnerPlan } from "../projects/create-project";
import { createOwnerClient, type OwnerClient } from "../supabase/owner";

/** Every project's usage this period, by project id, and the owner's plan. */
export type OwnerUsage = { plan: Plan; projects: Readonly<Record<string, ProjectUsage>> };

/**
 * This period's message usage for each of the owner's projects (project.md §6.12).
 *
 * One `owner_activity()` call for all projects, through the owner client, so RLS scopes it.
 * It already gives 0 for a project whose period has ended, before the next chat resets the
 * stored count. The limit is PLAN_LIMITS for the plan read on the server, never the client.
 *
 * Returns null when either read fails (logged), so pages still render with
 * "Usage unavailable" instead of the error page.
 */
export async function getUsage(userId: string, client: OwnerClient = createOwnerClient()): Promise<OwnerUsage | null> {
  try {
    const [plan, activity] = await Promise.all([readOwnerPlan(client, userId), client.rpc("owner_activity")]);
    if (activity.error) throw new Error(`owner_activity: ${activity.error.message}`, { cause: activity.error });

    const limit = PLAN_LIMITS[plan].messagesPerMonth;
    const projects: Record<string, ProjectUsage> = {};
    for (const row of activity.data) {
      projects[row.project_id] = {
        projectId: row.project_id,
        used: row.messages_used,
        limit,
        periodStart: row.period_start,
        periodEnd: row.period_end,
      };
    }
    return { plan, projects };
  } catch (error) {
    console.error("[usage] getUsage failed", { userId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
