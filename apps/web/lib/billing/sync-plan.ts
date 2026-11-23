import "server-only";

import type { Plan } from "@askwell/shared";
import { ensureAccount } from "../accounts/ensure-account";
import { trackUpgraded } from "../analytics/owner-events";
import { createServiceClient, type ServiceClient } from "../supabase/service";

export class SyncPlanError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SyncPlanError";
  }
}

/**
 * Sets `accounts.plan` for a Clerk user (service client: owners have no write grant on
 * `accounts`). Creates the row first if the webhook beats the first dashboard visit.
 *
 * The update only matches a row whose plan differs (`plan <> new`), so it returns a row only
 * on a real change. Postgres re-checks that condition after a concurrent update commits, so
 * two deliveries of the same event can't both see the change: `upgraded` is sent once per
 * free → pro change, never on a replay. Returns whether the plan changed.
 */
export async function setAccountPlan(
  clerkUserId: string,
  plan: Plan,
  client: ServiceClient = createServiceClient(),
): Promise<boolean> {
  await ensureAccount(clerkUserId, client);

  const { data, error } = await client
    .from("accounts")
    .update({ plan })
    .eq("clerk_user_id", clerkUserId)
    .neq("plan", plan)
    .select("plan");
  if (error) throw new SyncPlanError(`Updating the plan failed: ${error.message}`, { cause: error });

  const changed = data.length > 0;
  if (changed && plan === "pro") trackUpgraded(clerkUserId);
  return changed;
}
