import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { PageHeader } from "../../components/dashboard/page-header";
import { ProjectsView } from "../../components/projects/projects-view";
import { toProject } from "../../lib/projects/to-project";
import { createOwnerClient } from "../../lib/supabase/owner";
import { getUsage } from "../../lib/usage";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const { userId } = await auth.protect();
  const owner = createOwnerClient();

  // Owner client: RLS returns only this owner's projects (§9). A failure shows dashboard/error.tsx.
  // Usage is one owner_activity() call for every card; if it fails, the cards say so instead.
  const [{ data, error }, usage] = await Promise.all([
    owner.from("projects").select("*").order("created_at", { ascending: false }),
    getUsage(userId, owner),
  ]);
  if (error) throw new Error(`Couldn't load projects: ${error.message}`, { cause: error });

  return (
    <>
      <PageHeader title="Projects" description="Each project is one chat widget for one website." />
      <ProjectsView projects={data.map(toProject)} usage={usage?.projects ?? null} />
    </>
  );
}
