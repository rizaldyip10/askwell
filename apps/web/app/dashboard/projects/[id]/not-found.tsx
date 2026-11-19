import { EmptyState } from "../../../../components/dashboard/empty-state";
import { ButtonLink } from "../../../../components/ui/button";
import { DASHBOARD_PATH } from "../../../../lib/auth/routes";

// A bad id, a deleted project and another owner's project all land here.
export default function ProjectNotFound() {
  return (
    <EmptyState
      title="Project not found"
      description="It may have been deleted, or the link is wrong."
      action={
        <ButtonLink href={DASHBOARD_PATH} variant="secondary">
          Back to projects
        </ButtonLink>
      }
    />
  );
}
