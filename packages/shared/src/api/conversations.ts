// Owner conversation routes (project.md §6.7, §8 Owner). Read only, no input body.

import { z } from "zod";
import type { Conversation, ConversationSummary, Message } from "../domain";
import { idSchema } from "./common";

/** Conversations per page in GET /api/projects/:id/conversations. */
export const CONVERSATIONS_PAGE_SIZE = 50;

/**
 * Where the next page starts: the `createdAt` and `id` of the last conversation shown.
 * The next page holds the conversations strictly older in (createdAt, id) order, so two
 * conversations with the same createdAt are never skipped or shown twice.
 */
export type ConversationCursor = { createdAt: string; id: string };

const conversationCursorSchema = z.strictObject({
  // Postgres timestamps as supabase-js returns them: offset, up to microseconds.
  createdAt: z.iso.datetime({ offset: true }),
  id: idSchema,
});

/** Max length of an encoded cursor (an ISO timestamp + a UUID, hex: about 140), with room to spare. */
const CURSOR_MAX_LENGTH = 200;

// Hex of the ASCII text, so the cursor is safe in a query string as is (an ISO offset's
// "+" is not) and needs no runtime global (this package runs in the browser and on Node).
const toHex = (text: string) =>
  Array.from(text, (char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) =>
  (hex.match(/../g) ?? []).map((byte) => String.fromCharCode(parseInt(byte, 16))).join("");

/** The opaque `before` value for a cursor. The API returns it as `nextCursor`. */
export function encodeConversationCursor(cursor: ConversationCursor): string {
  return toHex(`${cursor.createdAt}|${cursor.id}`);
}

/** The cursor in an encoded `before` value, or null if it isn't a valid one. */
export function decodeConversationCursor(encoded: string): ConversationCursor | null {
  if (encoded.length > CURSOR_MAX_LENGTH || !/^(?:[0-9a-f]{2})+$/.test(encoded)) return null;
  const parts = fromHex(encoded).split("|");
  if (parts.length !== 2) return null;
  const parsed = conversationCursorSchema.safeParse({ createdAt: parts[0], id: parts[1] });
  return parsed.success ? parsed.data : null;
}

/**
 * Query for GET /api/projects/:id/conversations. No `before` → the newest page.
 * `before` parses to its cursor; an invalid one fails validation (400).
 */
export const listConversationsQuerySchema = z.strictObject({
  before: z
    .string()
    .transform((value, ctx) => {
      const cursor = decodeConversationCursor(value);
      if (cursor === null) {
        ctx.addIssue({ code: "custom", message: "Invalid cursor" });
        return z.NEVER;
      }
      return cursor;
    })
    .optional(),
});
export type ListConversationsQuery = z.input<typeof listConversationsQuerySchema>;
export type ParsedListConversationsQuery = z.output<typeof listConversationsQuerySchema>;

/**
 * GET /api/projects/:id/conversations, newest first, at most CONVERSATIONS_PAGE_SIZE.
 * `nextCursor` is the `before` for the next page, or null when this is the last page.
 */
export type ListConversationsResponse = {
  conversations: ConversationSummary[];
  nextCursor: string | null;
};

/** GET /api/conversations/:id, messages oldest first. */
export type ConversationThreadResponse = { conversation: Conversation; messages: Message[] };
