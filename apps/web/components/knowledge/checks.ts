// Pure helpers for the Knowledge page: client-side file checks and status labels.
// The server checks files again (declared size and extension at upload-url, real bytes at
// finalize); these only give quick feedback.

import {
  KNOWLEDGE_FILE_NAME_MAX_LENGTH,
  KNOWLEDGE_FILE_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
  knowledgeFileTypeFromName,
  type KnowledgeFailureReason,
  type KnowledgeFileType,
  type KnowledgeSourceStatus,
  type KnowledgeSourceType,
} from "@askwell/shared";

/** The file picker's `accept` list: the allowed extensions and MIME types. */
export const KNOWLEDGE_FILE_ACCEPT = Object.values(KNOWLEDGE_FILE_TYPES)
  .flatMap((t) => [...t.extensions, ...t.mimeTypes])
  .join(",");

export type FileCheck = { ok: true; type: KnowledgeFileType } | { ok: false; message: string };

/** Check a picked file's name and size before asking for an upload URL. */
export function checkKnowledgeFile(file: { name: string; size: number }): FileCheck {
  const type = knowledgeFileTypeFromName(file.name);
  if (!type) return { ok: false, message: "Choose a PDF, Markdown (.md) or text (.txt) file." };
  if (file.size === 0) return { ok: false, message: "This file is empty." };
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) {
    return { ok: false, message: `This file is ${formatFileSize(file.size)}. The limit is 10 MB.` };
  }
  if (file.name.trim().length > KNOWLEDGE_FILE_NAME_MAX_LENGTH) {
    return { ok: false, message: `Rename the file to at most ${KNOWLEDGE_FILE_NAME_MAX_LENGTH} characters.` };
  }
  return { ok: true, type };
}

/**
 * The Content-Type to upload with. The bucket only accepts its MIME list, and browsers
 * often report `.md` files as "" or `application/octet-stream`, so it comes from the type.
 */
export function uploadContentType(type: KnowledgeFileType): string {
  return KNOWLEDGE_FILE_TYPES[type].mimeTypes[0];
}

/** `12582912` → `12 MB`; `1536` → `1.5 KB`. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/** The label for a source's status. `uploading` shows as Processing (§6.4). */
export function sourceStatusLabel(status: KnowledgeSourceStatus): "Processing" | "Ready" | "Failed" {
  switch (status) {
    case "uploading":
    case "processing":
      return "Processing";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
  }
}

/**
 * One short line for the owner on why a source failed, and what to do. Shown as text under
 * the source's name. Unknown (null) reasons, e.g. sources that failed before reasons were
 * stored, get the generic line.
 */
export function failureReasonMessage(reason: KnowledgeFailureReason | null): string {
  switch (reason) {
    case "unreadable":
      return "We couldn't read this file. Check that it opens, then upload it again.";
    case "no_text":
      return "This file has no readable text. A scanned PDF needs a text layer.";
    case "text_too_long":
      return "This file has too much text. Split it into smaller files.";
    case "file_too_large":
      return "This file is larger than 10 MB.";
    case "download_failed":
      return "We couldn't load the uploaded file. Upload it again.";
    case "embedding_failed":
    case "database_failed":
      return "Something went wrong on our side. Delete it and add it again.";
    case "source_not_found":
    case "not_processing":
    case null:
      return "Something went wrong. Delete it and add it again.";
  }
}

/** True while a source is still on its way to Ready or Failed. */
export function isProcessing(status: KnowledgeSourceStatus): boolean {
  return sourceStatusLabel(status) === "Processing";
}

/**
 * What to announce when the list refreshes: each source that left Processing, by title.
 * `“FAQ” is ready.` / `“FAQ” failed to process.` Empty if nothing finished.
 */
export function statusChangeAnnouncement(
  before: readonly { id: string; status: KnowledgeSourceStatus }[],
  after: readonly { id: string; title: string; status: KnowledgeSourceStatus }[],
): string {
  const was = new Map(before.map((s) => [s.id, s.status]));
  return after
    .flatMap((source) => {
      const previous = was.get(source.id);
      if (!previous || !isProcessing(previous) || isProcessing(source.status)) return [];
      return [source.status === "ready" ? `“${source.title}” is ready.` : `“${source.title}” failed to process.`];
    })
    .join(" ");
}

/** The label for a source's type. */
export function sourceTypeLabel(type: KnowledgeSourceType): string {
  return { text: "Text", pdf: "PDF", md: "Markdown", txt: "TXT" }[type];
}
