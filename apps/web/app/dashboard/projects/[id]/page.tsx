import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { PageHeader } from "../../../../components/dashboard/page-header";
import { CopyButton } from "../../../../components/projects/copy-button";
import { formatDate } from "../../../../components/projects/format";
import { ProjectActions } from "../../../../components/projects/project-actions";
import { ButtonLink } from "../../../../components/ui/button";
import { GlassPanel } from "../../../../components/ui/glass-panel";
import { projectSectionPath } from "../../../../lib/auth/routes";
import { loadOwnedProject } from "./load-project";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await auth.protect();
  const project = await loadOwnedProject((await params).id);
  return { title: project.name };
}

export default async function ProjectOverviewPage({ params }: Props) {
  await auth.protect();
  const project = await loadOwnedProject((await params).id);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 [&>div]:mb-0">
          <PageHeader title={project.name} description={`Created ${formatDate(project.createdAt)}`} />
        </div>
        <ProjectActions project={project} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <GlassPanel as="section" aria-labelledby="public-key-heading" className="min-w-0 p-5">
          <h2 id="public-key-heading" className="text-base font-semibold tracking-tight">
            Public key
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Identifies this project&apos;s widget. It&apos;s safe to put on your site: it grants no access to your account.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-control border border-glass-line bg-glass-strong px-3 py-2.5 font-mono text-sm">
              {project.publicKey}
            </code>
            <CopyButton value={project.publicKey} label="Copy key" />
          </div>
        </GlassPanel>

        <GlassPanel as="section" aria-labelledby="install-heading" className="flex min-w-0 flex-col p-5">
          <h2 id="install-heading" className="text-base font-semibold tracking-tight">
            Install
          </h2>
          <p className="mt-1 flex-1 text-sm text-fg-muted">
            Add one script tag to your site to show the chat widget.
          </p>
          <div className="mt-4">
            <ButtonLink href={projectSectionPath(project.id, "install")}>Install the widget</ButtonLink>
          </div>
        </GlassPanel>
      </div>
    </>
  );
}
