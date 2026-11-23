// Row → API shapes for the conversation reads (project.md §6.7). Pure, so tests cover them.

import {
  MESSAGE_ROLES,
  type Conversation,
  type ConversationSummary,
  type Message,
  type MessageRole,
} from "@askwell/shared";

/** The list shows the first visitor message cut to about this many characters. */
export const PREVIEW_MAX_CHARS = 120;

export type ConversationRow = { id: string; project_id: string; visitor_id: string; created_at: string };
export type MessageRow = { id: string; conversation_id: string; role: string; body: string; created_at: string };

/** A list row: the conversation, its first visitor message (0 or 1 rows) and its message count. */
export type ConversationListRow = ConversationRow & {
  preview: { body: string }[];
  stats: { count: number }[];
};

/**
 * The preview of a message: whitespace runs (newlines included) become one space, and text
 * longer than PREVIEW_MAX_CHARS is cut at a word boundary when one is close, with "…".
 * Always plain text; the dashboard renders it as text, never HTML (§9 XSS).
 */
export function messagePreview(body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (text.length <= PREVIEW_MAX_CHARS) return text;
  const cut = Array.from(text).slice(0, PREVIEW_MAX_CHARS).join("");
  const lastSpace = cut.lastIndexOf(" ");
  // Back off to a word boundary only if it costs little; one long word is cut mid-word.
  const head = lastSpace >= PREVIEW_MAX_CHARS - 20 ? cut.slice(0, lastSpace) : cut;
  return `${head.trimEnd()}…`;
}

export function toConversation(row: ConversationRow): Conversation {
  return { id: row.id, projectId: row.project_id, visitorId: row.visitor_id, createdAt: row.created_at };
}

export function toConversationSummary(row: ConversationListRow): ConversationSummary {
  return {
    ...toConversation(row),
    firstMessagePreview: messagePreview(row.preview[0]?.body ?? ""),
    messageCount: row.stats[0]?.count ?? 0,
  };
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: messageRole(row.role),
    body: row.body,
    createdAt: row.created_at,
  };
}

function messageRole(value: string): MessageRole {
  const role = MESSAGE_ROLES.find((r) => r === value);
  if (!role) throw new Error(`messages: unknown role ${JSON.stringify(value)}`);
  return role;
}
