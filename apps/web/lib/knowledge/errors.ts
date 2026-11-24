import type { KnowledgeFailureReason } from "@askwell/shared";

// The reasons and their meaning live in @askwell/shared (KNOWLEDGE_FAILURE_REASONS): the
// database stores them and the Knowledge page shows them.
export type { KnowledgeFailureReason };

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
