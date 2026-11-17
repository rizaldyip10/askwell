import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@askwell/shared";
import { Logo } from "../landing/logo";

/** Light page around Clerk's sign-in / sign-up card. The card keeps Clerk's default look (§13). */
export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <Logo />
        <span>{APP_NAME}</span>
      </Link>
      {children}
    </main>
  );
}
