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
 * PUT fails, the reservation is deleted so it doesn't hold a slot.
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
  return requestJson<FinalizeKnowledgeResponse>(
    "POST",
    `/api/projects/${projectId}/knowledge/finalize`,
    { sourceId: source.id },
    fetchImpl,
  );
}
