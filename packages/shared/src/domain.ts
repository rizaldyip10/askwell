// Domain types as they appear in API responses (camelCase).
// Timestamps are ISO 8601 strings. These are not database row types.

import type {
  KnowledgeSourceStatus,
  KnowledgeSourceType,
  MessageRole,
  WidgetAnimation,
  WidgetPosition,
} from "./enums";

/**
 * Why a knowledge source ended as `failed` (project.md §6.4). Stored in
 * `knowledge_sources.failure_reason` with the `failed` status; null otherwise. The
 * database CHECK lists exactly these values (pglite tests keep the two in step).
 *
 * - `unreadable`        the file can't be decoded (broken PDF, not UTF-8 text)
 * - `no_text`           nothing left after extraction (e.g. a scanned PDF with no text layer)
 * - `text_too_long`     the extracted text is over the server's extracted-text cap
 * - `file_too_large`    the stored file is over MAX_KNOWLEDGE_FILE_BYTES
 * - `download_failed`   the file couldn't be read from the `knowledge` bucket
 * - `embedding_failed`  the embeddings call failed
 * - `database_failed`   writing chunks or the status failed
 * - `source_not_found`  no such source in this project (nothing is written)
 * - `not_processing`    the source isn't (or is no longer) `processing`: another attempt or a
 *                       delete changed it. Nothing is written, so these last two are never stored.
 */
export const KNOWLEDGE_FAILURE_REASONS = [
  "unreadable",
  "no_text",
  "text_too_long",
  "file_too_large",
  "download_failed",
  "embedding_failed",
  "database_failed",
  "source_not_found",
  "not_processing",
] as const;
export type KnowledgeFailureReason = (typeof KNOWLEDGE_FAILURE_REASONS)[number];

/** `value` as a failure reason, or null if it isn't one (e.g. a null column). */
export function toKnowledgeFailureReason(value: string | null | undefined): KnowledgeFailureReason | null {
  return KNOWLEDGE_FAILURE_REASONS.find((r) => r === value) ?? null;
}

export type Project = {
  id: string;
  name: string;
  publicKey: string;
  messagesUsed: number;
  periodStart: string;
  createdAt: string;
};

/**
 * A project's messages this period (project.md §6.12), from `owner_activity()`.
 * `used` is 0 once the stored period has ended, even before the next chat resets it.
 * `limit` is `PLAN_LIMITS[plan].messagesPerMonth` for the owner's plan, read on the server.
 * The period is [periodStart, periodEnd): the count resets at periodEnd.
 */
export type ProjectUsage = {
  projectId: string;
  used: number;
  limit: number;
  periodStart: string;
  periodEnd: string;
};

export type WidgetConfig = {
  buttonColor: string;
  position: WidgetPosition;
  label: string;
  animation: WidgetAnimation;
  headerText: string;
  showBadge: boolean;
};

export type KnowledgeSource = {
  id: string;
  projectId: string;
  title: string;
  type: KnowledgeSourceType;
  status: KnowledgeSourceStatus;
  /** Set only when `status` is `failed`; null otherwise. */
  failureReason: KnowledgeFailureReason | null;
  createdAt: string;
};

export type Conversation = {
  id: string;
  projectId: string;
  visitorId: string;
  createdAt: string;
};

/** A conversation in the per-project list (project.md §6.7). */
export type ConversationSummary = Conversation & {
  firstMessagePreview: string;
  messageCount: number;
};

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  body: string;
  createdAt: string;
};
