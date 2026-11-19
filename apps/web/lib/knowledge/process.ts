import "server-only";

import { MAX_KNOWLEDGE_FILE_BYTES, type KnowledgeFileType } from "@askwell/shared";
import { embedTexts } from "../ai";
import { createServiceClient, type ServiceClient } from "../supabase/service";
import { chunkText } from "./chunk";
import { KnowledgeProcessingError, type KnowledgeFailureReason } from "./errors";
import { checkTextSize, extractText, normalizeText } from "./extract";

/** The private Storage bucket for knowledge files (created by the knowledge migration). */
export const KNOWLEDGE_BUCKET = "knowledge";

/** Chunk rows per insert request. Each row carries a 1536-float vector, about 30 KB of JSON. */
export const CHUNK_INSERT_BATCH = 50;

export type ProcessSourceInput =
  | { sourceId: string; projectId: string; type: "text"; text: string }
  | { sourceId: string; projectId: string; type: KnowledgeFileType; storageKey: string };

export type ProcessSourceResult =
  | { status: "ready"; chunkCount: number }
  | { status: "failed"; reason: KnowledgeFailureReason };

type SourceRow = { id: string; project_id: string; type: string; storage_key: string | null; status: string };

/**
 * Turn a knowledge source into embedded chunks: get the text (pasted, or downloaded from the
 * `knowledge` bucket and extracted) → chunk → embed → replace the source's chunks → `ready`.
 *
 * Call it only after the route has checked that the owner owns `projectId` (§9): it uses
 * the service client. The source must belong to `projectId` and match `type` (and
 * `storageKey` for a file); otherwise it returns `source_not_found` and writes nothing.
 * Chunks always get the project_id read from the source row, never one from the input.
 *
 * One attempt per source at a time. The caller must first claim the source by moving it to
 * `processing` with a conditional update that only one request can win (finalize:
 * `uploading` → `processing`; a re-run: `ready`/`failed` → `processing`), and call this only
 * if it won. A source that isn't `processing` returns `not_processing`, with nothing written.
 * As a second guard, an attempt only ever deletes its own new chunks, and it changes the
 * status (`processing` → `ready` or `failed`) only while the source is still `processing`.
 * So a stale attempt that fails can't wipe the chunks of a newer attempt that finished.
 *
 * Running it again on a claimed source replaces its chunks. On any failure it deletes the
 * chunks it inserted; if it still holds the source, it also deletes the source's older
 * chunks, and only then sets `failed` (releasing the claim). It logs the reason (never the document text) and returns it. It
 * doesn't throw.
 */
export async function processSource(input: ProcessSourceInput): Promise<ProcessSourceResult> {
  const supabase = createServiceClient();

  let source: SourceRow;
  try {
    source = await loadSource(supabase, input);
  } catch (error) {
    return fail(input, error);
  }

  const inserted: string[] = [];
  try {
    const text = await sourceText(supabase, input, source);
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new KnowledgeProcessingError("no_text", "No text found");

    let vectors: number[][];
    try {
      vectors = await embedTexts(chunks);
    } catch (error) {
      throw new KnowledgeProcessingError("embedding_failed", `Embeddings failed: ${describe(error)}`);
    }
    if (vectors.length !== chunks.length) {
      throw new KnowledgeProcessingError("embedding_failed", `Expected ${chunks.length} vectors, got ${vectors.length}`);
    }

    // The old chunks go first, so a reader never sees old and new mixed for long.
    await deleteChunks(supabase, source.id);
    const rows = chunks.map((content, i) => ({
      project_id: source.project_id,
      source_id: source.id,
      content,
      embedding: JSON.stringify(vectors[i]),
    }));
    for (let i = 0; i < rows.length; i += CHUNK_INSERT_BATCH) {
      const { data, error } = await supabase
        .from("knowledge_chunks")
        .insert(rows.slice(i, i + CHUNK_INSERT_BATCH))
        .select("id");
      if (error) throw dbError("insert chunks", error);
      inserted.push(...(data ?? []).map((row) => row.id));
    }

    if (!(await setStatusIfProcessing(supabase, source.id, "ready"))) {
      throw new KnowledgeProcessingError("not_processing", "The source is no longer processing");
    }
    return { status: "ready", chunkCount: chunks.length };
  } catch (error) {
    // Cleanup, each step on its own so one failing doesn't skip the rest (each failure is
    // logged; the caller gets the original reason):
    //   1. Remove this attempt's own chunks. Always safe, whoever holds the source.
    //   2. While the source is still processing (our claim), remove all its chunks, i.e.
    //      older ones. No other attempt can claim a processing source, so none can be
    //      writing chunks now.
    //   3. Last, release the claim: processing → failed. Only after this can a retry claim
    //      the source, so nothing here can delete a retry's chunks.
    await cleanupStep(input, "delete own chunks", () => deleteChunkIds(supabase, inserted));
    await cleanupStep(input, "delete older chunks", async () => {
      if (await isProcessing(supabase, source.id)) await deleteChunks(supabase, source.id);
    });
    await cleanupStep(input, "set failed", () => setStatusIfProcessing(supabase, source.id, "failed"));
    return fail(input, error);
  }
}

/** Run one cleanup step; log (don't throw) if it fails. */
async function cleanupStep(input: ProcessSourceInput, step: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    log(input, `cleanup: ${step} failed`, error);
  }
}

/** True if the source still exists and is `processing`. */
async function isProcessing(supabase: ServiceClient, sourceId: string): Promise<boolean> {
  const { data, error } = await supabase.from("knowledge_sources").select("status").eq("id", sourceId).maybeSingle();
  if (error) throw dbError("check status", error);
  return data?.status === "processing";
}

/** Move the source from `processing` to `status`. False if it wasn't processing (or is gone). */
async function setStatusIfProcessing(
  supabase: ServiceClient,
  sourceId: string,
  status: "ready" | "failed",
): Promise<boolean> {
  const { data, error } = await supabase
    .from("knowledge_sources")
    .update({ status })
    .eq("id", sourceId)
    .eq("status", "processing")
    .select("id");
  if (error) throw dbError(`set ${status}`, error);
  return (data ?? []).length > 0;
}

/** The source row, if it belongs to the input's project, matches its type and file, and is processing. */
async function loadSource(supabase: ServiceClient, input: ProcessSourceInput): Promise<SourceRow> {
  const { data, error } = await supabase
    .from("knowledge_sources")
    .select("id, project_id, type, storage_key, status")
    .eq("id", input.sourceId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (error) throw dbError("load source", error);

  const matches =
    data !== null &&
    data.type === input.type &&
    (input.type === "text" ? data.storage_key === null : data.storage_key === input.storageKey);
  if (!matches) throw new KnowledgeProcessingError("source_not_found", "No matching source in this project");
  if (data.status !== "processing") {
    throw new KnowledgeProcessingError("not_processing", `The source is ${data.status}, not processing`);
  }
  return data;
}

/** Normalized, size-checked text of the source. */
async function sourceText(supabase: ServiceClient, input: ProcessSourceInput, source: SourceRow): Promise<string> {
  if (input.type === "text") {
    const text = normalizeText(input.text);
    checkTextSize(text);
    return text;
  }

  const { data, error } = await supabase.storage.from(KNOWLEDGE_BUCKET).download(source.storage_key ?? "");
  if (error || !data) {
    throw new KnowledgeProcessingError("download_failed", `Download failed: ${describe(error)}`);
  }
  if (data.size > MAX_KNOWLEDGE_FILE_BYTES) {
    throw new KnowledgeProcessingError("file_too_large", `File is ${data.size} bytes`);
  }
  return extractText(input.type, new Uint8Array(await data.arrayBuffer()));
}

async function deleteChunks(supabase: ServiceClient, sourceId: string): Promise<void> {
  const { error } = await supabase.from("knowledge_chunks").delete().eq("source_id", sourceId);
  if (error) throw dbError("delete chunks", error);
}

/** Chunk ids per delete request, so the `in` filter keeps the URL short. */
const DELETE_ID_BATCH = 100;

async function deleteChunkIds(supabase: ServiceClient, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += DELETE_ID_BATCH) {
    const { error } = await supabase.from("knowledge_chunks").delete().in("id", ids.slice(i, i + DELETE_ID_BATCH));
    if (error) throw dbError("delete own chunks", error);
  }
}

function dbError(step: string, error: unknown): KnowledgeProcessingError {
  return new KnowledgeProcessingError("database_failed", `${step}: ${describe(error)}`);
}

/**
 * A log-safe description of an error: its name and code, never its message. Database and
 * API messages can echo the values sent, and those values are document text.
 */
function describe(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const { name, code, status } = error as { name?: unknown; code?: unknown; status?: unknown };
  return [name, code, status].filter((v) => v !== undefined && v !== null && v !== "").join(" ") || "unknown error";
}

function fail(input: ProcessSourceInput, error: unknown): ProcessSourceResult {
  const reason = error instanceof KnowledgeProcessingError ? error.reason : "database_failed";
  log(input, reason, error);
  return { status: "failed", reason };
}

function log(input: ProcessSourceInput, what: string, error: unknown): void {
  // KnowledgeProcessingError messages are built without document text; anything else is
  // reduced to its name and code.
  const detail = error instanceof KnowledgeProcessingError ? error.message : describe(error);
  console.error(`[knowledge] processSource ${what}`, {
    sourceId: input.sourceId,
    projectId: input.projectId,
    type: input.type,
    detail,
  });
}
