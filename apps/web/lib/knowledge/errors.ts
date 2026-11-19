/**
 * Why a knowledge source ended as `failed`. The routes (P3K-T05) can map these to a message
 * for the owner; the database only stores the `failed` status.
 *
 * - `unreadable`        the file can't be decoded (broken PDF, not UTF-8 text)
 * - `no_text`           nothing left after extraction (e.g. a scanned PDF with no text layer)
 * - `text_too_long`     the extracted text is over MAX_EXTRACTED_TEXT_CHARS
 * - `file_too_large`    the stored file is over MAX_KNOWLEDGE_FILE_BYTES
 * - `download_failed`   the file couldn't be read from the `knowledge` bucket
 * - `embedding_failed`  OpenAI's embeddings call failed
 * - `database_failed`   writing chunks or the status failed
 * - `source_not_found`  no such source in this project (nothing is written)
 */
export type KnowledgeFailureReason =
  | "unreadable"
  | "no_text"
  | "text_too_long"
  | "file_too_large"
  | "download_failed"
  | "embedding_failed"
  | "database_failed"
  | "source_not_found";

/**
 * A processing failure with its reason. The message never contains document text, so it is
 * safe to log.
 */
export class KnowledgeProcessingError extends Error {
  readonly reason: KnowledgeFailureReason;

  constructor(reason: KnowledgeFailureReason, message: string = reason) {
    super(message);
    this.name = "KnowledgeProcessingError";
    this.reason = reason;
  }
}
