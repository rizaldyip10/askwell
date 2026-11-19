// Client calls for the Knowledge page. All go through our routes, except the file itself,
// which goes straight to Storage with the one-time signed URL from upload-url (§6.4). The
// browser never has a Supabase key.

import type {
  DeleteKnowledgeResponse,
  FinalizeKnowledgeResponse,
  KnowledgeFileType,
  KnowledgeUploadUrlResponse,
  PasteKnowledgeResponse,
} from "@askwell/shared";
import { GENERIC_ERROR, NETWORK_ERROR, requestJson, type ApiResult } from "../projects/api";
import { uploadContentType } from "./checks";

export function pasteKnowledge(projectId: string, title: string, text: string) {
  return requestJson<PasteKnowledgeResponse>("POST", `/api/projects/${projectId}/knowledge`, { title, text });
}

export function deleteKnowledge(sourceId: string) {
  return requestJson<DeleteKnowledgeResponse>("DELETE", `/api/knowledge/${sourceId}`);
}

export type UploadStep = "reserving" | "uploading" | "finalizing";

/**
 * upload-url → PUT the file to the signed URL → finalize. `onStep` reports progress. If the
 * PUT or finalize fails, the reservation is deleted so it doesn't hold a slot or linger as
 * Processing; the owner retries by picking the file again.
 */
export async function uploadKnowledgeFile(
  projectId: string,
  file: File,
  type: KnowledgeFileType,
  onStep: (step: UploadStep) => void = () => {},
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<FinalizeKnowledgeResponse>> {
  onStep("reserving");
  const reserved = await requestJson<KnowledgeUploadUrlResponse>(
    "POST",
    `/api/projects/${projectId}/knowledge/upload-url`,
    { fileName: file.name, size: file.size },
    fetchImpl,
  );
  if (!reserved.ok) return reserved;
  const { source, upload } = reserved.data;

  onStep("uploading");
  let put: Response | null = null;
  try {
    put = await fetchImpl(upload.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": uploadContentType(type) },
      body: file,
    });
  } catch {
    put = null;
  }
  if (!put?.ok) {
    await requestJson<DeleteKnowledgeResponse>("DELETE", `/api/knowledge/${source.id}`, undefined, fetchImpl);
    return {
      ok: false,
      status: put?.status ?? 0,
      code: "internal",
      message: put ? `The upload failed. ${GENERIC_ERROR}` : NETWORK_ERROR,
    };
  }

  onStep("finalizing");
  const finalized = await requestJson<FinalizeKnowledgeResponse>(
    "POST",
    `/api/projects/${projectId}/knowledge/finalize`,
    { sourceId: source.id },
    fetchImpl,
  );
  if (!finalized.ok) {
    // E.g. "not uploaded yet": the server put the source back to `uploading`, where it would
    // sit as Processing and hold a slot. Remove it; the owner picks the file again to retry.
    // (A refused file is already deleted by the server: this is then a harmless 404.)
    await requestJson<DeleteKnowledgeResponse>("DELETE", `/api/knowledge/${source.id}`, undefined, fetchImpl);
  }
  return finalized;
}
