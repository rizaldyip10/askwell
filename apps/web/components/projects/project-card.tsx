"use client";

import type { Project, ProjectUsage } from "@askwell/shared";
import Link from "next/link";
import { useState } from "react";
import { projectPath } from "../../lib/auth/routes";
import { Button } from "../ui/button";
import { GlassPanel } from "../ui/glass-panel";
import { UsageLine } from "../usage/usage-line";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { formatDate } from "./format";
import { RenameProjectDialog } from "./rename-project-dialog";

/**
 * One project in the list. The name is a link to the project (the whole card is clickable).
 * `usage` comes from the server page (one owner_activity() call for all cards); null shows
 * "Usage unavailable".
 */
export function ProjectCard({ project, usage }: { project: Project; usage: ProjectUsage | null }) {
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const close = () => setDialog(null);

  return (
    <GlassPanel as="li" className="relative flex min-w-0 flex-col gap-4 p-5 transition-colors hover:bg-glass-strong">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold tracking-tight">
          <Link
            href={projectPath(project.id)}
            className="after:absolute after:inset-0 after:rounded-panel focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-fg"
          >
            {project.name}
          </Link>
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Created <time dateTime={project.createdAt}>{formatDate(project.createdAt)}</time>
        </p>
      </div>
      <UsageLine usage={usage} />
      {/* Above the card-wide link. */}
      <div className="relative z-10 flex gap-2">
        <Button variant="secondary" onClick={() => setDialog("rename")} aria-label={`Rename ${project.name}`}>
          Rename
        </Button>
        <Button variant="ghost" onClick={() => setDialog("delete")} aria-label={`Delete ${project.name}`}>
          Delete
        </Button>
      </div>
      <RenameProjectDialog project={project} open={dialog === "rename"} onClose={close} />
      <DeleteProjectDialog project={project} open={dialog === "delete"} onClose={close} />
    </GlassPanel>
  );
}
