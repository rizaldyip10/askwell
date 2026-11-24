import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPageShell } from "../../../components/dashboard/auth-page-shell";
import { SIGN_IN_PATH } from "../../../lib/auth/routes";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthPageShell retryHref={SIGN_IN_PATH}>
      <Suspense>
        <SignIn />
      </Suspense>
    </AuthPageShell>
  );
}
