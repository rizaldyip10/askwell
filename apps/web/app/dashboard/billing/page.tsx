import type { Plan } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { BillingView } from "../../../components/billing/billing-view";
import { CHECKOUT_PARAM, overLimitNotes, type OwnerUsageCounts } from "../../../components/billing/plan-details";
import { PageHeader } from "../../../components/dashboard/page-header";
import { readOwnerPlan } from "../../../lib/projects/create-project";
import { createOwnerClient, type OwnerClient } from "../../../lib/supabase/owner";

export const metadata: Metadata = { title: "Billing" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BillingPage({ searchParams }: Props) {
  const { userId } = await auth.protect();
  // The plan and what the owner has, both read on the server through the owner client (RLS).
  // A failure throws to app/dashboard/billing/error.tsx.
  const owner = createOwnerClient();
  const [plan, usage, params] = await Promise.all([readOwnerPlan(owner, userId), readUsageCounts(owner), searchParams]);

  return (
    <>
      <PageHeader title="Billing" description="Your plan, what it includes, and your subscription." />
      <BillingView
        plan={plan}
        overLimit={overLimitFor(plan, usage)}
        returnedFromCheckout={params[CHECKOUT_PARAM] === "done"}
      />
    </>
  );
}

function overLimitFor(plan: Plan, usage: OwnerUsageCounts): string[] {
  return plan === "free" ? overLimitNotes(plan, usage) : [];
}

/** The owner's projects with their knowledge-source counts, in one request (embedded count). */
async function readUsageCounts(owner: OwnerClient): Promise<OwnerUsageCounts> {
  const { data, error } = await owner.from("projects").select("name, sources:knowledge_sources(count)").order("created_at");
  if (error) throw new Error(`Loading usage failed: ${error.code}`);
  return {
    projects: data.length,
    sourcesPerProject: data.map((p) => ({ name: p.name, sources: p.sources[0]?.count ?? 0 })),
  };
}
