// Owner conversation routes (project.md §6.7, §8 Owner). Read only, no input body.

import type { Conversation, ConversationSummary, Message } from "../domain";

/** GET /api/projects/:id/conversations, newest first. */
export type ListConversationsResponse = { conversations: ConversationSummary[] };

/** GET /api/conversations/:id, messages oldest first. */
export type ConversationThreadResponse = { conversation: Conversation; messages: Message[] };
