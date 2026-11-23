import { applyPlanToWidgetConfig, PLAN_LIMITS } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { CustomizeView } from "../../../../../components/customize/customize-view";
import { PageHeader } from "../../../../../components/dashboard/page-header";
import { readOwnerPlan } from "../../../../../lib/projects/create-project";
import { createOwnerClient } from "../../../../../lib/supabase/owner";
import { loadOwnedProject } from "../load-project";
import { loadStoredConfig } from "./load-config";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Customize" };

export default async function CustomizePage({ params }: Props) {
  const { userId } = await auth.protect();
  // Owner check through getOwnedProject (owner client, RLS). Unknown or not theirs → 404 page.
  const project = await loadOwnedProject((await params).id);

  // The stored config and the plan, both read on the server through the owner client.
  const owner = createOwnerClient();
  const [stored, plan] = await Promise.all([loadStoredConfig(owner, project.id), readOwnerPlan(owner, userId)]);
  const canCustomize = PLAN_LIMITS[plan].customWidget;

  return (
    <>
      <PageHeader title="Customize" description={`How the ${project.name} widget looks on your site.`} />
      <CustomizeView
        projectId={project.id}
        canCustomize={canCustomize}
        // What the widget shows today: on Free, the defaults (a stored look from a past Pro plan is kept).
        initial={applyPlanToWidgetConfig(stored, plan)}
      />
    </>
  );
}
