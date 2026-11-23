import type { PostHog } from "posthog-js";

export type IdentifyClient = Pick<PostHog, "get_distinct_id" | "get_property" | "identify" | "reset">;

/**
 * Links this browser to the Clerk user ID (no email or name). Already that user → nothing.
 * Still identified as someone else (a sign-out we missed) → reset first, so the two people's
 * events never merge.
 */
export function identifyUser(posthog: IdentifyClient, userId: string): void {
  if (posthog.get_distinct_id() === userId) return;
  if (posthog.get_property("$user_state") === "identified") posthog.reset();
  posthog.identify(userId);
}
