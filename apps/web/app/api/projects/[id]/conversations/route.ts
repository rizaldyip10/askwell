// GET /api/projects/:id/conversations: a project's conversations, newest first, 50 a page
// (project.md §6.7, §8 Owner). `?before=<nextCursor>` gives the next page.
// Owner client only: getOwnedProject (RLS) gives 404 for a project that isn't the caller's.

import { idParamsSchema, listConversationsQuerySchema } from "@askwell/shared";
import { listConversations } from "../../../../../lib/conversations";
import { apiError, currentUserId, internalError, notFound, unauthorized } from "../../../../../lib/projects/http";
import { getOwnedProject } from "../../../../../lib/projects/owned-project";
import { createOwnerClient } from "../../../../../lib/supabase/owner";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return apiError(400, "validation_error", "Invalid project id");

  const query = listConversationsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return apiError(400, "validation_error", query.error.issues[0]?.message ?? "Invalid query");

  const projectId = params.data.id;
  try {
    const owner = createOwnerClient();
    if (!(await getOwnedProject(projectId, owner))) return notFound();
    return Response.json(await listConversations(projectId, query.data.before, owner));
  } catch (error) {
    console.error("[conversations] list failed", { userId, projectId, error });
    return internalError();
  }
}
