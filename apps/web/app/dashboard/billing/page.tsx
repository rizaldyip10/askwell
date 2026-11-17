import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { EmptyState } from "../../../components/dashboard/empty-state";
import { PageHeader } from "../../../components/dashboard/page-header";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  await auth.protect();

  return (
    <>
      <PageHeader title="Billing" description="Your plan and payments." />
      <EmptyState
        title="Billing is coming soon"
        description="You're on the Free plan. Upgrading to Pro will be available here."
      />
    </>
  );
}
