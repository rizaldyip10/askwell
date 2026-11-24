import {
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  PLAN_LIMITS,
  toKnowledgeFailureReason,
  type KnowledgeSource,
} from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { PageHeader } from "../../../../../components/dashboard/page-header";
import { KnowledgeView } from "../../../../../components/knowledge/knowledge-view";
import { readOwnerPlan } from "../../../../../lib/projects/create-project";
import { createOwnerClient, type OwnerClient } from "../../../../../lib/supabase/owner";
import { loadOwnedProject } from "../load-project";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Knowledge" };

export default async function KnowledgePage({ params }: Props) {
  const { userId } = await auth.protect();
  // Owner check through getOwnedProject (owner client, RLS). Unknown or not theirs → 404 page.
  const project = await loadOwnedProject((await params).id);

  // The sources and the plan, both read on the server through the owner client (RLS).
  const owner = createOwnerClient();
  const [sources, plan] = await Promise.all([listSources(owner, project.id), readOwnerPlan(owner, userId)]);

  return (
    <>
      <PageHeader title="Knowledge" description={`What the ${project.name} bot knows. It answers only from these.`} />
      <KnowledgeView projectId={project.id} sources={sources} limit={PLAN_LIMITS[plan].knowledgeSources} />
    </>
  );
}

async function listSources(owner: OwnerClient, projectId: string): Promise<KnowledgeSource[]> {
  const { data, error } = await owner
    .from("knowledge_sources")
    .select("id, project_id, title, type, status, failure_reason, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  // Thrown errors show the dashboard's error state (app/dashboard/error.tsx).
  if (error) throw new Error(`Loading knowledge sources failed: ${error.code}`);

  return data.flatMap((row) => {
    const type = KNOWLEDGE_SOURCE_TYPES.find((t) => t === row.type);
    const status = KNOWLEDGE_SOURCE_STATUSES.find((s) => s === row.status);
    if (!type || !status) return [];
    // The reason only means something on a failed source (the database enforces it too).
    const failureReason = status === "failed" ? toKnowledgeFailureReason(row.failure_reason) : null;
    return [{ id: row.id, projectId: row.project_id, title: row.title, type, status, failureReason, createdAt: row.created_at }];
  });
}
