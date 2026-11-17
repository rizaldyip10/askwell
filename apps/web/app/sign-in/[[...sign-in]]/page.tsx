import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPageShell } from "../../../components/dashboard/auth-page-shell";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthPageShell>
      <Suspense>
        <SignIn />
      </Suspense>
    </AuthPageShell>
  );
}
