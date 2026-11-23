import type { ApiError } from "@askwell/shared";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { clerkClient } from "@clerk/nextjs/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextResponse, type NextRequest } from "next/server";
import { billingEventUser, planFromSubscription, type SubscriptionLike } from "../../../../lib/billing";
import { syncAccountPlan } from "../../../../lib/billing/sync-plan";

// POST /api/clerk/webhook (project.md §6.10, §8 System; subscribe it to subscriptionItem.*). Public: Svix deliveries carry no
// session, so the signature is the only check (lib/auth/routes.ts keeps it out of the gates).
//
// 1. Verify the signature (CLERK_WEBHOOK_SIGNING_SECRET) before anything else. Bad → 400.
// 2. Pro `subscriptionItem.*` events for a user payer only; anything else → 200, ignored.
// 3. Read the user's **current** subscription from Clerk, not the payload: Svix may deliver
//    late, twice or out of order, and the current state is right whatever the order.
// 4. Set accounts.plan from it, then read Clerk again to confirm, so a slow delivery's stale
//    read can't overwrite a newer plan (lib/billing/sync-plan.ts). Clerk or database errors
//    → 500, so Svix retries.

export const dynamic = "force-dynamic";

const error = (status: number, code: ApiError["error"]["code"], message: string) =>
  NextResponse.json<ApiError>({ error: { code, message } }, { status });

export async function POST(req: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(req);
  } catch {
    return error(400, "validation_error", "Webhook signature verification failed.");
  }

  const userId = billingEventUser(event as Parameters<typeof billingEventUser>[0]);
  if (!userId) return NextResponse.json({ received: true, ignored: true });

  try {
    const { plan, changed } = await syncAccountPlan(userId, async () => planFromSubscription(await currentSubscription(userId)));
    return NextResponse.json({ received: true, plan, changed });
  } catch (cause) {
    console.error("[billing webhook] syncing the plan failed", errorSummary(cause));
    return error(500, "internal", "Couldn't sync the plan. Retry later.");
  }
}

/** The user's current subscription, or null when they have none (Clerk answers 404). */
async function currentSubscription(userId: string): Promise<SubscriptionLike | null> {
  try {
    const client = await clerkClient();
    return await client.billing.getUserBillingSubscription(userId);
  } catch (cause) {
    if (isClerkAPIResponseError(cause) && cause.status === 404) return null;
    throw cause;
  }
}

function errorSummary(cause: unknown): string {
  if (isClerkAPIResponseError(cause)) return `clerk ${cause.status} ${cause.errors[0]?.code ?? ""}`;
  return cause instanceof Error ? cause.name : "unknown error";
}
