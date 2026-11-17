// Domain types as they appear in API responses (camelCase).
// Timestamps are ISO 8601 strings. These are not database row types.

import type {
  KnowledgeSourceStatus,
  KnowledgeSourceType,
  MessageRole,
  WidgetAnimation,
  WidgetPosition,
} from "./enums";

export type Project = {
  id: string;
  name: string;
  publicKey: string;
  messagesUsed: number;
  periodStart: string;
  createdAt: string;
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
