// Pure helpers for the Knowledge page: client-side file checks and status labels.
// The server checks files again (declared size and extension at upload-url, real bytes at
// finalize); these only give quick feedback.

import {
  KNOWLEDGE_FILE_NAME_MAX_LENGTH,
  KNOWLEDGE_FILE_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
  knowledgeFileTypeFromName,
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

/** True while a source is still on its way to Ready or Failed. */
export function isProcessing(status: KnowledgeSourceStatus): boolean {
  return sourceStatusLabel(status) === "Processing";
}

/** The label for a source's type. */
export function sourceTypeLabel(type: KnowledgeSourceType): string {
  return { text: "Text", pdf: "PDF", md: "Markdown", txt: "TXT" }[type];
}
