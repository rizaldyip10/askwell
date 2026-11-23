"use client";

import { usePathname } from "next/navigation";
import { conversationsPath } from "../../../../../../components/conversations/paths";
import { EmptyState } from "../../../../../../components/dashboard/empty-state";
import { ButtonLink } from "../../../../../../components/ui/button";
import { DASHBOARD_PATH, projectIdFromPath } from "../../../../../../lib/auth/routes";

// A bad id, a missing conversation, another owner's, or one from another project all land
// here (a missing project too, since this is the nearest not-found boundary).
export default function ConversationNotFound() {
  const projectId = projectIdFromPath(usePathname());
  return (
    <EmptyState
      title="Conversation not found"
      description="It may not exist, or the link is wrong."
      action={
        <ButtonLink href={projectId ? conversationsPath(projectId) : DASHBOARD_PATH} variant="secondary">
          {projectId ? "Back to conversations" : "Back to projects"}
        </ButtonLink>
      }
    />
  );
}
