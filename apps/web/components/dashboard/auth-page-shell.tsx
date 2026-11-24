import { ClerkFailed, ClerkLoading } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@askwell/shared";
import { Logo } from "../landing/logo";
import { buttonClasses } from "../ui/button";
import { EmptyState } from "./empty-state";

type AuthPageShellProps = {
  children: ReactNode;
  /** This page's own path. "Try again" reloads it when Clerk fails to load. */
  retryHref: string;
};

/**
 * Light page around Clerk's sign-in / sign-up card. The card keeps Clerk's default look (§13).
 * §13 States: a card-shaped skeleton while Clerk's script loads, and an error panel if it can't load.
 */
export function AuthPageShell({ children, retryHref }: AuthPageShellProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <Link href="/" className="flex min-h-11 items-center gap-2 font-semibold tracking-tight">
        <Logo />
        <span>{APP_NAME}</span>
      </Link>
      <ClerkLoading>
        <AuthCardSkeleton />
      </ClerkLoading>
      <ClerkFailed>
        <EmptyState
          role="alert"
          title="This page couldn't load"
          description="Check your connection, or turn off any blocker for this site, then try again."
          action={
            // A full page load, so Clerk's script is fetched again.
            <a href={retryHref} className={buttonClasses({ variant: "secondary" })}>
              Try again
            </a>
          }
        />
      </ClerkFailed>
      {children}
    </main>
  );
}

/** Roughly the size of Clerk's card, so the page doesn't jump when it appears. */
export function AuthCardSkeleton() {
  return (
    <div role="status" aria-live="polite" className="w-full max-w-100 motion-safe:animate-pulse">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="flex flex-col items-center gap-4 rounded-panel border border-glass-line bg-glass p-8 shadow-glass">
        <div className="h-5 w-40 rounded-control bg-glass-strong" />
        <div className="h-3.5 w-56 max-w-full rounded-control bg-glass-strong" />
        <div className="mt-4 h-9 w-full rounded-control bg-glass-strong" />
        <div className="h-3 w-10 rounded-control bg-glass-strong" />
        <div className="h-9 w-full rounded-control bg-glass-strong" />
        <div className="h-9 w-full rounded-control bg-glass-strong" />
      </div>
    </div>
  );
}
