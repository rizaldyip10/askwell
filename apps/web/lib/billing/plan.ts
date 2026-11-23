// Clerk Billing → our plan (project.md §5, §6.10). Pure, so the rules are unit tested.

import type { Plan } from "@askwell/shared";

/** The Pro plan's slug in Clerk (Dashboard → Billing → User plans). Free is "no active Pro item". */
export const PRO_PLAN_SLUG = "pro";

/** What we read from a Clerk subscription item (`BillingSubscriptionItem` from `@clerk/backend`). */
export type SubscriptionItemLike = {
  status: string;
  plan: { slug: string } | null;
  periodEnd: number | null;
  endedAt: number | null;
};

/** What we read from a user's current Clerk subscription (`BillingSubscription`). */
export type SubscriptionLike = { subscriptionItems: readonly SubscriptionItemLike[] };

/**
 * Whether a Pro item still grants Pro at `now` (ms):
 * - `active`, including one already canceled for the period end (Clerk keeps it active).
 * - `canceled` but not ended yet: the paid period still runs until `periodEnd`.
 * Anything else (ended, expired, past due, abandoned, incomplete, upcoming) does not.
 */
function grantsPro(item: SubscriptionItemLike, now: number): boolean {
  if (item.plan?.slug !== PRO_PLAN_SLUG) return false;
  if (item.status === "active") return true;
  if (item.status === "canceled") return item.endedAt === null && item.periodEnd !== null && item.periodEnd > now;
  return false;
}

/**
 * The plan for a user's **current** Clerk subscription. `null` (no subscription at all) is Free.
 * The webhook reads the subscription from Clerk's API on every event and passes it here, so a
 * late or repeated event can't move the plan the wrong way.
 */
export function planFromSubscription(subscription: SubscriptionLike | null, now: number = Date.now()): Plan {
  return subscription?.subscriptionItems.some((item) => grantsPro(item, now)) ? "pro" : "free";
}

/** The parts of a verified webhook event we look at. */
export type BillingEventLike = {
  type: string;
  data: { plan?: { slug?: string } | null; payer?: { user_id?: string | null; organization_id?: string | null } | null };
};

/**
 * The Clerk user whose plan this event may change, or null to acknowledge and ignore it.
 * Only `subscriptionItem.*` events for the Pro plan, paid by a user (not an organization).
 */
export function billingEventUser(event: BillingEventLike): string | null {
  if (!event.type.startsWith("subscriptionItem.")) return null;
  if (event.data.plan?.slug !== PRO_PLAN_SLUG) return null;
  const payer = event.data.payer;
  if (!payer || payer.organization_id) return null;
  return payer.user_id || null;
}
