"use client";

import { PLAN_LIMITS, type Plan } from "@askwell/shared";
import { PricingTable, useClerk } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { BILLING_PATH } from "../../lib/auth/routes";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { GlassPanel } from "../ui/glass-panel";
import { CHECKOUT_PARAM, PLAN_LABEL, PROCESSING_POLL_MS, planFeatures, upgradeStatus } from "./plan-details";
import { TAP_HEIGHT, TAP_MIN } from "../ui/tap-target";

type Props = {
  /** `accounts.plan`, read on the server. */
  plan: Plan;
  /** Notes for limits a Free owner is over (after a downgrade). */
  overLimit: string[];
  /** Clerk's checkout sent the owner back here (`?checkout=done`). */
  returnedFromCheckout: boolean;
};

/** Where Clerk's checkout returns to, so the page knows to wait for the webhook. */
export const CHECKOUT_RETURN_URL = `${BILLING_PATH}?${CHECKOUT_PARAM}=done`;

// Clerk's components, fitted to §13 with the dashboard's own tokens (monochrome, same radius).
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorForeground: "var(--fg)",
    colorMutedForeground: "var(--fg-muted)",
    borderRadius: "var(--radius-control)",
    fontFamily: "inherit",
  },
  // 44 px tap targets on phones and touch screens (§13); desktop keeps Clerk's sizes.
  elements: { pricingTableCardFooterButton: TAP_HEIGHT, switchRoot: TAP_MIN },
};

export function BillingView({ plan, overLimit, returnedFromCheckout }: Props) {
  const status = useUpgradePolling(plan, returnedFromCheckout);

  return (
    <div className="flex flex-col gap-6">
      <UpgradeBanner status={status} />

      <GlassPanel as="section" aria-labelledby="current-plan" className="min-w-0 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 id="current-plan" className="text-base font-semibold tracking-tight">
              Your plan
            </h2>
            <Badge variant={plan === "pro" ? "solid" : "glass"}>{PLAN_LABEL[plan]}</Badge>
          </div>
          {plan === "pro" ? <ManageSubscriptionButton /> : null}
        </div>
        <ul className="mt-4 grid gap-2 text-sm text-fg-muted sm:grid-cols-2">
          {planFeatures(plan).map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden="true" className="text-fg">
                ·
              </span>
              {line}
            </li>
          ))}
        </ul>
        {overLimit.length > 0 ? (
          <div className="mt-4 rounded-control border border-glass-line bg-glass-strong p-4 text-sm">
            <p className="font-medium">Over the {PLAN_LABEL[plan]} limits</p>
            <ul className="mt-1 flex flex-col gap-1 text-fg-muted">
              {overLimit.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </GlassPanel>

      {plan === "free" ? (
        <GlassPanel as="section" aria-labelledby="upgrade" className="min-w-0 p-5 sm:p-6">
          <h2 id="upgrade" className="text-base font-semibold tracking-tight">
            Upgrade to Pro
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Pro includes {planFeatures("pro").slice(0, 3).join(", ")}
            {PLAN_LIMITS.pro.customWidget ? ", and a widget you can customize" : ""}.
          </p>
          <div className="mt-6 min-w-0">
            <PricingTable
              newSubscriptionRedirectUrl={CHECKOUT_RETURN_URL}
              appearance={clerkAppearance}
              checkoutProps={{ appearance: clerkAppearance }}
              fallback={<PricingFallback />}
            />
          </div>
        </GlassPanel>
      ) : null}
    </div>
  );
}

/** Opens the Billing page of Clerk's account portal (plan, payment methods, invoices, cancel). */
function ManageSubscriptionButton() {
  const clerk = useClerk();
  return (
    <Button variant="secondary" onClick={() => clerk.openUserProfile({ __experimental_startPath: "/billing" })}>
      Manage subscription
    </Button>
  );
}

function PricingFallback() {
  return (
    <div role="status" aria-live="polite" className="grid gap-4 motion-safe:animate-pulse sm:grid-cols-2">
      <span className="sr-only">Loading plans…</span>
      <div aria-hidden="true" className="h-64 rounded-panel bg-glass-strong" />
      <div aria-hidden="true" className="h-64 rounded-panel bg-glass-strong" />
    </div>
  );
}

function UpgradeBanner({ status }: { status: ReturnType<typeof upgradeStatus> }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  if (status === "none") return null;
  if (status === "done") {
    return (
      <GlassPanel role="status" className="p-4 text-sm">
        <span className="font-medium">You&apos;re on Pro.</span> Thanks for upgrading.
      </GlassPanel>
    );
  }
  return (
    <GlassPanel role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
      {status === "processing" ? (
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 rounded-full bg-fg motion-safe:animate-pulse" />
          <span className="font-medium">Upgrade processing…</span>
          <span className="text-fg-muted">This takes a few seconds.</span>
        </p>
      ) : (
        <>
          <p>
            <span className="font-medium">Still processing your upgrade.</span>{" "}
            <span className="text-fg-muted">Payment went through; your plan updates in a minute or two.</span>
          </p>
          <Button variant="secondary" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </>
      )}
    </GlassPanel>
  );
}

/**
 * After checkout, re-read the plan from the server (router.refresh re-renders the page and the
 * layout's badge) every PROCESSING_POLL_MS, at most PROCESSING_MAX_POLLS times. Once the server
 * says Pro, drop `?checkout=done` from the URL.
 */
function useUpgradePolling(plan: Plan, returnedFromCheckout: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const [polls, setPolls] = useState(0);
  // Kept after `?checkout=done` is dropped, so "You're on Pro" stays on screen.
  const [cameFromCheckout] = useState(returnedFromCheckout);
  const status = upgradeStatus(plan, cameFromCheckout || returnedFromCheckout, polls);

  useEffect(() => {
    if (status !== "processing") return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      router.refresh();
    }, PROCESSING_POLL_MS);
    return () => clearTimeout(timer);
  }, [status, polls, router]);

  useEffect(() => {
    if (status === "done") router.replace(pathname, { scroll: false });
  }, [status, router, pathname]);

  return status;
}
