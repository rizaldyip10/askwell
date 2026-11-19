import "server-only";

import type { AnswerUsage } from "../ai";

/** One answer call, for Phase 4's PostHog AI trace (project.md §6.6 step 7). Never the message text. */
export interface ChatTrace {
  projectId: string;
  /** Token usage, or null when no model call was made (no chunks). */
  usage: AnswerUsage | null;
  /** Wall time of the answer step, in milliseconds. */
  latencyMs: number;
  /** How many chunks were retrieved. */
  chunkCount: number;
}

/** No-op for now. Phase 4 sends the trace to PostHog from here. */
export function onChatTrace(trace: ChatTrace): void {
  void trace;
}
