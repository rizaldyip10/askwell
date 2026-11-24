// POST /api/projects/:id/knowledge/finalize: check the uploaded file → process
// (project.md §6.4 Upload step 3, §8 Owner, §9 File upload).
//
// 1. The claim: one conditional update `uploading` → `processing`, scoped to this source and
//    project. Only one request can win it, so a file is processed at most once. No row
//    (unknown id, another project's, or already finalized) → 404 not_found, nothing done.
// 2. The real object, not the declared one: no file yet → the claim is undone (back to
//    `uploading`) → 400, so the browser can upload and finalize again. Over
//    MAX_KNOWLEDGE_FILE_BYTES, or a .pdf whose bytes don't start with `%PDF-` → the object
//    and the source are deleted → 400 validation_error.
// 3. processSource in after() → 200 with the source (`processing`). `knowledge_added` is sent
//    once processing ends `ready`.

import {
  finalizeKnowledgeRequestSchema,
  KNOWLEDGE_FILE_TYPE_NAMES,
  MAX_KNOWLEDGE_FILE_BYTES,
  type FinalizeKnowledgeResponse,
  type KnowledgeFileType,
} from "@askwell/shared";
import { after } from "next/server";
import { trackKnowledgeAdded } from "../../../../../../lib/analytics/owner-events";
import { KNOWLEDGE_BUCKET, processSource } from "../../../../../../lib/knowledge";
import {
  checkOwnedProjectRequest,
  hasPdfHeader,
  removeKnowledgeFiles,
  sourceNotFound,
  toKnowledgeSource,
  type KnowledgeSourceRow,
} from "../../../../../../lib/knowledge/routes";
import { apiError, internalError } from "../../../../../../lib/projects/http";
import { createServiceClient, type ServiceClient } from "../../../../../../lib/supabase/service";

// Literal (Next.js reads it statically); equals KNOWLEDGE_MAX_DURATION_SECONDS.
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const checked = await checkOwnedProjectRequest(request, context, finalizeKnowledgeRequestSchema);
    if (checked instanceof Response) return checked;
    const { userId, projectId, body } = checked;
    const service = createServiceClient();

    // 1. The claim. A processing source never has a failure reason (the database allows
    //    one only on a failed source), so the claim clears it too.
    const { data: claimed, error: claimError } = await service
      .from("knowledge_sources")
      .update({ status: "processing", failure_reason: null })
      .eq("id", body.sourceId)
      .eq("project_id", projectId)
      .eq("status", "uploading")
      .select("*")
      .maybeSingle();
    if (claimError) throw new Error(`claim failed: ${claimError.code}`, { cause: claimError });
    if (!claimed) return sourceNotFound();
    const source: KnowledgeSourceRow = claimed;
    const storageKey = source.storage_key;
    const type = KNOWLEDGE_FILE_TYPE_NAMES.find((t) => t === source.type);
    if (!storageKey || !type) throw new Error("an uploading source has no storage key or file type");

    // 2. The real object.
    const { data: file, error: downloadError } = await service.storage.from(KNOWLEDGE_BUCKET).download(storageKey);
    if (downloadError || !file) {
      await setStatus(service, source.id, "processing", "uploading");
      return apiError(400, "validation_error", "The file hasn't been uploaded yet. Upload it, then try again.");
    }

    const refusal = await checkFile(file, type);
    if (refusal) {
      await removeKnowledgeFiles(service, [storageKey], "finalize");
      const { error } = await service.from("knowledge_sources").delete().eq("id", source.id).eq("project_id", projectId);
      if (error) throw new Error(`deleting a refused source failed: ${error.code}`, { cause: error });
      return apiError(400, "validation_error", refusal);
    }

    // 3. Process after the response. `knowledge_added` only once the source is `ready`:
    // never for a refused (above) or failed file.
    after(async () => {
      const processed = await processSource({ sourceId: source.id, projectId, type, storageKey });
      if (processed.status === "ready") trackKnowledgeAdded(userId, projectId, type);
    });

    const response: FinalizeKnowledgeResponse = { source: toKnowledgeSource(source) };
    return Response.json(response);
  } catch (error) {
    console.error("[knowledge] finalize failed", { error: error instanceof Error ? error.message : String(error) });
    return internalError();
  }
}

/** Why the stored file is refused, or null if it's fine. */
async function checkFile(file: Blob, type: KnowledgeFileType): Promise<string | null> {
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) return "File is larger than 10 MB";
  if (file.size === 0) return "File is empty";
  if (type === "pdf" && !hasPdfHeader(new Uint8Array(await file.slice(0, 5).arrayBuffer()))) {
    return "File is not a valid PDF";
  }
  return null;
}

/** Conditional status change for this source (from → to). */
async function setStatus(service: ServiceClient, sourceId: string, from: string, to: string): Promise<void> {
  const { error } = await service.from("knowledge_sources").update({ status: to }).eq("id", sourceId).eq("status", from);
  if (error) throw new Error(`status ${from} → ${to} failed: ${error.code}`, { cause: error });
}
