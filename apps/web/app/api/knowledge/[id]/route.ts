// DELETE /api/knowledge/:id: delete a source, its file and its chunks (project.md §6.4
// Actions, §8 Owner).
//
// The source is found through the owner client (RLS), so another owner's id is a 404 like a
// missing one. Then the service client deletes the file, then the row (chunks cascade). The
// file goes first: if that fails, the row stays and the owner can retry, instead of the row
// going and the file being orphaned. Deleting while processing is fine: processSource can't
// insert chunks for a deleted source, and its status updates match no row.

import { idParamsSchema, type DeleteKnowledgeResponse } from "@askwell/shared";
import { KNOWLEDGE_BUCKET } from "../../../../lib/knowledge";
import { sourceNotFound } from "../../../../lib/knowledge/routes";
import { apiError, currentUserId, internalError, unauthorized } from "../../../../lib/projects/http";
import { createOwnerClient } from "../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../lib/supabase/service";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return unauthorized();

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return apiError(400, "validation_error", "Invalid knowledge source id");
  const id = params.data.id;

  try {
    const { data: source, error } = await createOwnerClient()
      .from("knowledge_sources")
      .select("id, project_id, storage_key")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`owner lookup failed: ${error.code}`, { cause: error });
    if (!source) return sourceNotFound();

    const service = createServiceClient();
    if (source.storage_key) {
      const { error: removeError } = await service.storage.from(KNOWLEDGE_BUCKET).remove([source.storage_key]);
      if (removeError) throw new Error(`removing the file failed: ${removeError.name}`, { cause: removeError });
    }

    const { error: deleteError } = await service
      .from("knowledge_sources")
      .delete()
      .eq("id", source.id)
      .eq("project_id", source.project_id);
    if (deleteError) throw new Error(`deleting the source failed: ${deleteError.code}`, { cause: deleteError });

    const body: DeleteKnowledgeResponse = { ok: true };
    return Response.json(body);
  } catch (error) {
    console.error("[knowledge] delete failed", {
      userId,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
