// POST /api/projects/:id/knowledge/upload-url: reserve a file source → one-time signed upload
// URL (project.md §6.4 Upload step 1, §8 Owner, §9 File upload).
//
// The file never passes through this route (Vercel's 4.5 MB body cap): the browser uploads
// it straight to Storage with the signed URL, then calls finalize.

import {
  knowledgeFileTypeFromName,
  knowledgeUploadUrlRequestSchema,
  type KnowledgeUploadUrlResponse,
} from "@askwell/shared";
import { KNOWLEDGE_BUCKET } from "../../../../../../lib/knowledge";
import {
  checkOwnedProjectRequest,
  knowledgeLimit,
  knowledgeLimitError,
  knowledgeStorageKey,
  removeKnowledgeFiles,
  reserveKnowledgeSource,
  toKnowledgeSource,
} from "../../../../../../lib/knowledge/routes";
import { readOwnerPlan } from "../../../../../../lib/projects/create-project";
import { apiError, internalError, notFound } from "../../../../../../lib/projects/http";
import { createOwnerClient } from "../../../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../../../lib/supabase/service";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const checked = await checkOwnedProjectRequest(request, context, knowledgeUploadUrlRequestSchema);
    if (checked instanceof Response) return checked;
    const { userId, projectId, body } = checked;

    // The schema already refused other extensions; this narrows the type.
    const type = knowledgeFileTypeFromName(body.fileName);
    if (!type) return apiError(400, "validation_error", "File type must be PDF, Markdown or TXT");

    const plan = await readOwnerPlan(createOwnerClient(), userId);
    const limit = knowledgeLimit(plan);
    const service = createServiceClient();
    const storageKey = knowledgeStorageKey(projectId, type);
    const reserved = await reserveKnowledgeSource(service, {
      projectId,
      title: body.fileName,
      type,
      storageKey,
      status: "uploading",
      maxSources: limit,
    });
    if (!reserved.ok) return reserved.reason === "knowledge_limit" ? knowledgeLimitError(limit) : notFound();

    await removeKnowledgeFiles(service, reserved.reclaimedKeys, "upload-url");

    const { data, error } = await service.storage.from(KNOWLEDGE_BUCKET).createSignedUploadUrl(storageKey);
    if (error || !data) {
      // Don't leave a reservation nobody can upload to.
      const { error: rollbackError } = await service
        .from("knowledge_sources")
        .delete()
        .eq("id", reserved.source.id)
        .eq("project_id", projectId);
      if (rollbackError) {
        // The `uploading` row stays and holds a slot until the owner deletes it or it is
        // reclaimed after 2 hours; log it so it's visible.
        console.error("[knowledge] upload-url rollback failed", {
          projectId,
          sourceId: reserved.source.id,
          error: rollbackError.code,
        });
      }
      throw new Error(`createSignedUploadUrl failed: ${error?.name ?? "no data"}`);
    }

    const response: KnowledgeUploadUrlResponse = {
      source: toKnowledgeSource(reserved.source),
      upload: { signedUrl: data.signedUrl, token: data.token, path: data.path },
    };
    return Response.json(response, { status: 201 });
  } catch (error) {
    console.error("[knowledge] upload-url failed", { error: error instanceof Error ? error.message : String(error) });
    return internalError();
  }
}
