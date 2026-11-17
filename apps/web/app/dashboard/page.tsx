import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { EmptyState } from "../../components/dashboard/empty-state";
import { PageHeader } from "../../components/dashboard/page-header";
import { Button } from "../../components/ui/button";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  await auth.protect();

  return (
    <>
      <PageHeader title="Projects" description="Each project is one chat widget for one website." />
      <EmptyState
        title="No projects yet"
        description="Create a project, add what your bot should know, then paste one script tag into your site."
        action={
          <Button disabled aria-describedby="new-project-soon">
            New project
            <span id="new-project-soon" className="text-xs font-normal opacity-80">
              (coming soon)
            </span>
          </Button>
        }
      />
    </>
  );
}
