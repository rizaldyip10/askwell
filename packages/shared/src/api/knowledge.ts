// Owner knowledge routes (project.md §6.4, §8 Owner).

import { z } from "zod";
import type { KnowledgeSource } from "../domain";
import {
  MAX_KNOWLEDGE_FILE_BYTES,
  KNOWLEDGE_FILE_NAME_MAX_LENGTH,
  KNOWLEDGE_TEXT_MAX_LENGTH,
  KNOWLEDGE_TITLE_MAX_LENGTH,
  knowledgeFileTypeFromName,
} from "../limits";
import { idSchema, type OkResponse } from "./common";

/** POST /api/projects/:id/knowledge (paste text) */
export const pasteKnowledgeRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(KNOWLEDGE_TITLE_MAX_LENGTH),
  text: z.string().trim().min(1).max(KNOWLEDGE_TEXT_MAX_LENGTH),
});
export type PasteKnowledgeRequest = z.infer<typeof pasteKnowledgeRequestSchema>;
export type PasteKnowledgeResponse = { source: KnowledgeSource };

/**
 * POST /api/projects/:id/knowledge/upload-url
 * Declared file name (its extension decides the type) and size. The real size
 * and PDF bytes are checked again at finalize.
 */
export const knowledgeUploadUrlRequestSchema = z.strictObject({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(KNOWLEDGE_FILE_NAME_MAX_LENGTH)
    .refine((name) => knowledgeFileTypeFromName(name) !== null, "File type must be PDF, Markdown or TXT"),
  size: z.number().int().positive().max(MAX_KNOWLEDGE_FILE_BYTES, "File is larger than 10 MB"),
});
export type KnowledgeUploadUrlRequest = z.infer<typeof knowledgeUploadUrlRequestSchema>;
/**
 * The reserved source (status `uploading`) and a one-time signed upload URL.
 * The browser uploads the file straight to Storage with `signedUrl` / `token` at `path`.
 */
export type KnowledgeUploadUrlResponse = {
  source: KnowledgeSource;
  upload: { signedUrl: string; token: string; path: string };
};

/** POST /api/projects/:id/knowledge/finalize */
export const finalizeKnowledgeRequestSchema = z.strictObject({ sourceId: idSchema });
export type FinalizeKnowledgeRequest = z.infer<typeof finalizeKnowledgeRequestSchema>;
export type FinalizeKnowledgeResponse = { source: KnowledgeSource };

/** DELETE /api/knowledge/:id */
export type DeleteKnowledgeResponse = OkResponse;
