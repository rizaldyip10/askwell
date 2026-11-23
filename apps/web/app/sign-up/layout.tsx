import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { PostHogIdentify } from "../../components/analytics/posthog-identify";
import { DASHBOARD_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "../../lib/auth/routes";

// ClerkProvider lives here and in the dashboard layout, not in the root layout, so /embed
// loads no Clerk JS. Same props in all three. PostHogIdentify resets PostHog here when the
// visitor is signed out but PostHog still holds an owner's ID (sign-out, another tab, expiry).
export default function SignUpLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      signInUrl={SIGN_IN_PATH}
      signUpUrl={SIGN_UP_PATH}
      signInFallbackRedirectUrl={DASHBOARD_PATH}
      signUpFallbackRedirectUrl={DASHBOARD_PATH}
      afterSignOutUrl={SIGN_IN_PATH}
    >
      <PostHogIdentify />
      {children}
    </ClerkProvider>
  );
}
