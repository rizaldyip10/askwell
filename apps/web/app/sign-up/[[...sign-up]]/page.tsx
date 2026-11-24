import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPageShell } from "../../../components/dashboard/auth-page-shell";
import { SIGN_UP_PATH } from "../../../lib/auth/routes";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <AuthPageShell retryHref={SIGN_UP_PATH}>
      <Suspense>
        <SignUp />
      </Suspense>
    </AuthPageShell>
  );
}
