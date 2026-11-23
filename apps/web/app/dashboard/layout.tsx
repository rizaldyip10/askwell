import type { Plan } from "@askwell/shared";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PostHogIdentify } from "../../components/analytics/posthog-identify";
import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { EmptyState } from "../../components/dashboard/empty-state";
import { buttonClasses } from "../../components/ui/button";
import { ensureSignedInAccount } from "../../lib/accounts/current-account";
import { DASHBOARD_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "../../lib/auth/routes";
import { readOwnerPlan } from "../../lib/projects/create-project";
import { createOwnerClient } from "../../lib/supabase/owner";

export const metadata: Metadata = { title: "Dashboard" };

// Auth: proxy.ts gates /dashboard/*, and every page calls `auth.protect()` itself.
// This layout also makes sure the owner's `accounts` row exists (plan `free` on first
// sign-in), using the user ID from Clerk on the server. That's one database round trip
// each time the layout renders (full page loads; client navigation between dashboard
// pages reuses the layout).
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const account = await ensureSignedInAccount();
  const plan = account === "ready" ? await readBadgePlan() : null;

  // ClerkProvider lives here, not in the root layout, so /embed loads no Clerk JS.
  return (
    <ClerkProvider
      signInUrl={SIGN_IN_PATH}
      signUpUrl={SIGN_UP_PATH}
      signInFallbackRedirectUrl={DASHBOARD_PATH}
      signUpFallbackRedirectUrl={DASHBOARD_PATH}
      afterSignOutUrl={SIGN_IN_PATH}
    >
      <PostHogIdentify />
      <DashboardShell plan={plan}>{account === "ready" ? children : <AccountErrorState />}</DashboardShell>
    </ClerkProvider>
  );
}

/**
 * The plan for the badge next to the profile button, read on the server through the owner
 * client (RLS). A failure only hides the badge: it must never take the dashboard down.
 * `router.refresh()` re-runs this, so the badge follows an upgrade on the Billing page.
 */
async function readBadgePlan(): Promise<Plan | null> {
  try {
    const { userId } = await auth.protect();
    return await readOwnerPlan(createOwnerClient(), userId);
  } catch (error) {
    console.error("[billing] reading the plan for the badge failed", error instanceof Error ? error.message : error);
    return null;
  }
}

// `app/dashboard/error.tsx` can't catch errors from this layout (its boundary sits inside
// the layout), so the layout shows the same error state itself. "Try again" is a full
// page load, which re-runs this layout.
function AccountErrorState() {
  return (
    <EmptyState
      role="alert"
      title="Something went wrong"
      description="We couldn't set up your account. Try again, or refresh the page."
      action={
        <a href={DASHBOARD_PATH} className={buttonClasses({ variant: "secondary" })}>
          Try again
        </a>
      }
    />
  );
}
