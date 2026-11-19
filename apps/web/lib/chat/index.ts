import "server-only";

export {
  consumeMessage,
  conversationBelongs,
  getChatProject,
  matchChunks,
  saveChatTurn,
  type ChatProject,
  type ConsumeResult,
  type MatchedChunk,
  type SaveResult,
} from "./db";
export { onChatTrace, type ChatTrace } from "./trace";

/** Chunks retrieved per question (project.md §6.6 step 4). */
export const MATCH_COUNT = 5;
