"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useEffect } from "react";
import { loadPostHog } from "../../lib/analytics/browser";
import { createSignOutWatcher, syncIdentity } from "../../lib/analytics/identify";

/**
 * Keeps PostHog in step with Clerk: identifies the signed-in owner by their Clerk user ID, and
 * resets on sign-out so the next person on this browser starts anonymous. Mount it inside a
 * ClerkProvider (the dashboard, sign-in and sign-up layouts). Renders nothing.
 */
export function PostHogIdentify() {
  const { isLoaded, userId } = useAuth();
  const clerk = useClerk();

  // On load and on every user change: identify, or reset if signed out but still identified.
  useEffect(() => {
    if (!isLoaded) return;
    void loadPostHog().then((posthog) => {
      if (posthog) syncIdentity(posthog, userId ?? null);
    });
  }, [isLoaded, userId]);

  // Sign-out: Clerk emits a transitional state and navigates away before it emits `null`,
  // so reset as soon as the signed-in user goes away, while we're still mounted.
  useEffect(() => {
    const signedOut = createSignOutWatcher();
    return clerk.addListener(({ user }) => {
      if (!signedOut(user)) return;
      void loadPostHog().then((posthog) => posthog?.reset());
    });
  }, [clerk]);

  return null;
}
