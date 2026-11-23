// GET /api/conversations/:id: one conversation and all its messages, oldest first
// (project.md §6.7, §8 Owner). Owner client only: RLS returns no row for another owner's
// conversation, so it is the same 404 as a missing one and its existence doesn't leak.

import { idParamsSchema } from "@askwell/shared";
import { getConversationThread } from "../../../../lib/conversations";
import { apiError, currentUserId, internalError, unauthorized } from "../../../../lib/projects/http";

type Context = { params: Promise<{ id: string }> };

const conversationNotFound = () => apiError(404, "not_found", "Conversation not found");

export async function GET(_request: Request, context: Context): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return apiError(400, "validation_error", "Invalid conversation id");

  const conversationId = params.data.id;
  try {
    const thread = await getConversationThread(conversationId);
    if (!thread) return conversationNotFound();
    return Response.json(thread);
  } catch (error) {
    console.error("[conversations] thread failed", { userId, conversationId, error });
    return internalError();
  }
}
