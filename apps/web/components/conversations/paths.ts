import { projectSectionPath } from "../../lib/auth/routes";

/** `/dashboard/projects/<id>/conversations`. */
export function conversationsPath(projectId: string): string {
  return projectSectionPath(projectId, "conversations");
}

/** `/dashboard/projects/<id>/conversations/<conversationId>`. */
export function conversationPath(projectId: string, conversationId: string): string {
  return `${conversationsPath(projectId)}/${encodeURIComponent(conversationId)}`;
}
