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

type SourceRow = { id: string; project_id: string; type: string; storage_key: string | null };

/**
 * Turn a knowledge source into embedded chunks: get the text (pasted, or downloaded from the
 * `knowledge` bucket and extracted) → chunk → embed → replace the source's chunks → `ready`.
 *
 * Call it only after the route has checked that the owner owns `projectId` (§9): it uses
 * the service client. The source must belong to `projectId` and match `type` (and
 * `storageKey` for a file); otherwise it returns `source_not_found` and writes nothing.
 * Chunks always get the project_id read from the source row, never one from the input.
 *
 * Running it again on a source replaces its chunks. On any failure it deletes the source's
 * chunks, sets the source to `failed`, logs the reason (never the document text), and
 * returns the reason. It doesn't throw.
 */
export async function processSource(input: ProcessSourceInput): Promise<ProcessSourceResult> {
  const supabase = createServiceClient();

  let source: SourceRow;
  try {
    source = await loadSource(supabase, input);
  } catch (error) {
    return fail(input, error);
  }

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

    await deleteChunks(supabase, source.id);
    const rows = chunks.map((content, i) => ({
      project_id: source.project_id,
      source_id: source.id,
      content,
      embedding: JSON.stringify(vectors[i]),
    }));
    for (let i = 0; i < rows.length; i += CHUNK_INSERT_BATCH) {
      const { error } = await supabase.from("knowledge_chunks").insert(rows.slice(i, i + CHUNK_INSERT_BATCH));
      if (error) throw dbError("insert chunks", error);
    }

    const { error } = await supabase.from("knowledge_sources").update({ status: "ready" }).eq("id", source.id);
    if (error) throw dbError("set ready", error);

    return { status: "ready", chunkCount: chunks.length };
  } catch (error) {
    // Leave no partial chunks behind, then mark the source failed. Cleanup errors are
    // logged; the original reason is what the caller gets.
    try {
      await deleteChunks(supabase, source.id);
    } catch (cleanup) {
      log(input, "cleanup: delete chunks failed", cleanup);
    }
    const { error: statusError } = await supabase
      .from("knowledge_sources")
      .update({ status: "failed" })
      .eq("id", source.id);
    if (statusError) log(input, "cleanup: set failed failed", statusError);
    return fail(input, error);
  }
}

/** The source row, if it belongs to the input's project and matches its type and file. */
async function loadSource(supabase: ServiceClient, input: ProcessSourceInput): Promise<SourceRow> {
  const { data, error } = await supabase
    .from("knowledge_sources")
    .select("id, project_id, type, storage_key")
    .eq("id", input.sourceId)
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (error) throw dbError("load source", error);

  const matches =
    data !== null &&
    data.type === input.type &&
    (input.type === "text" ? data.storage_key === null : data.storage_key === input.storageKey);
  if (!matches) throw new KnowledgeProcessingError("source_not_found", "No matching source in this project");
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
