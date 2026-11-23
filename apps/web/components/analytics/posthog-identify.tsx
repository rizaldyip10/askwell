"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useEffect } from "react";
import { loadPostHog } from "../../lib/analytics/browser";
import { identifyUser } from "../../lib/analytics/identify";

/**
 * Identifies the signed-in owner by their Clerk user ID, and resets PostHog on sign-out so
 * the next person on this browser starts anonymous. Mounted from the dashboard layout,
 * inside its ClerkProvider. Renders nothing.
 */
export function PostHogIdentify() {
  const { isLoaded, userId } = useAuth();
  const clerk = useClerk();

  useEffect(() => {
    if (!isLoaded || !userId) return;
    void loadPostHog().then((posthog) => {
      if (posthog) identifyUser(posthog, userId);
    });
  }, [isLoaded, userId]);

  // Clerk's listener fires as the session ends, before the redirect to sign-in unmounts us.
  // `user === null` is signed out; `undefined` is still loading.
  useEffect(
    () =>
      clerk.addListener(({ user }) => {
        if (user !== null) return;
        void loadPostHog().then((posthog) => posthog?.reset());
      }),
    [clerk],
  );

  return null;
}
