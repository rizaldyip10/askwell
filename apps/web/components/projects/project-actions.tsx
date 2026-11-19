"use client";

import type { Project } from "@askwell/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DASHBOARD_PATH } from "../../lib/auth/routes";
import { Button } from "../ui/button";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { RenameProjectDialog } from "./rename-project-dialog";

/** Rename and delete on a project's own page. After a delete, back to the list. */
export function ProjectActions({ project }: { project: Project }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const close = () => setDialog(null);

  return (
    <div className="flex shrink-0 gap-2">
      <Button variant="secondary" onClick={() => setDialog("rename")}>
        Rename
      </Button>
      <Button variant="ghost" onClick={() => setDialog("delete")}>
        Delete
      </Button>
      <RenameProjectDialog project={project} open={dialog === "rename"} onClose={close} />
      <DeleteProjectDialog
        project={project}
        open={dialog === "delete"}
        onClose={close}
        onDeleted={() => router.replace(DASHBOARD_PATH)}
      />
    </div>
  );
}
