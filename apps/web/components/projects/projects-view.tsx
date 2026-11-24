import type { Project, ProjectUsage } from "@askwell/shared";
import { EmptyState } from "../dashboard/empty-state";
import { GlassPanel } from "../ui/glass-panel";
import { CreateProjectForm } from "./create-project-form";
import { ProjectCard } from "./project-card";

export type ProjectsViewProps = {
  projects: readonly Project[];
  /** Usage by project id, from the server page; null when it failed to load. */
  usage: Readonly<Record<string, ProjectUsage>> | null;
};

/** The Projects page body: the empty state, or the create form and the list. */
export function ProjectsView({ projects, usage }: ProjectsViewProps) {
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
      <ul aria-label="Your projects" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} usage={usage?.[project.id] ?? null} />
        ))}
      </ul>
    </div>
  );
}
