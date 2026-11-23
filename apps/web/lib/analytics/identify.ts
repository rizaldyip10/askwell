import type { PostHog } from "posthog-js";

export type IdentifyClient = Pick<PostHog, "get_distinct_id" | "get_property" | "identify" | "reset">;

/**
 * Links this browser to the Clerk user ID (no email or name). Already that user → nothing.
 * Still identified as someone else (a sign-out we missed) → reset first, so the two people's
 * events never merge.
 */
export function identifyUser(posthog: IdentifyClient, userId: string): void {
  if (posthog.get_distinct_id() === userId) return;
  if (isIdentified(posthog)) posthog.reset();
  posthog.identify(userId);
}

/**
 * Matches PostHog to Clerk's state once Clerk has loaded. Signed in → identify. Signed out
 * while PostHog still holds an identified ID (a sign-out in another tab, an expired session,
 * or a sign-out whose event we missed) → reset, so the next events are anonymous. Signed out
 * and already anonymous → nothing (a reset would only rotate the anonymous ID).
 */
export function syncIdentity(posthog: IdentifyClient, userId: string | null): void {
  if (userId) identifyUser(posthog, userId);
  else if (isIdentified(posthog)) posthog.reset();
}

function isIdentified(posthog: IdentifyClient): boolean {
  return posthog.get_property("$user_state") === "identified";
}

/**
 * Tracks Clerk's user across listener events and says when to reset PostHog. Clerk's sign-out
 * first emits a transitional state (`user` undefined) and navigates away before it emits
 * `null`, so we reset as soon as a signed-in user goes to anything else, while still mounted.
 */
export function createSignOutWatcher(): (user: { id: string } | null | undefined) => boolean {
  let lastUserId: string | null = null;
  return (user) => {
    if (user) {
      lastUserId = user.id;
      return false;
    }
    if (!lastUserId) return false;
    lastUserId = null;
    return true;
  };
}
