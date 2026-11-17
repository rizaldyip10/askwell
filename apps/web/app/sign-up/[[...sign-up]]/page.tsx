import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPageShell } from "../../../components/dashboard/auth-page-shell";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <AuthPageShell>
      <Suspense>
        <SignUp />
      </Suspense>
    </AuthPageShell>
  );
}
