import type { Project } from "@askwell/shared";
import { EmptyState } from "../dashboard/empty-state";
import { GlassPanel } from "../ui/glass-panel";
import { CreateProjectForm } from "./create-project-form";
import { ProjectCard } from "./project-card";

/** The Projects page body: the empty state, or the create form and the list. */
export function ProjectsView({ projects }: { projects: readonly Project[] }) {
  if (projects.length === 0) {
    return (
      <EmptyState
        title="Create your first project"
        description="A project is one chat widget for one website. Name it, then add what your bot should know."
        action={<CreateProjectForm className="min-w-0 sm:w-96" />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassPanel className="p-5">
        <CreateProjectForm />
      </GlassPanel>
      <ul aria-label="Your projects" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </ul>
    </div>
  );
}
