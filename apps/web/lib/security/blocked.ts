import "server-only";

export type BlockReason = "rate_limit" | "injection";

/**
 * Called when a widget chat message is blocked (chat only, never config: project.md §6.6, §6.11).
 * Phase 4 sends the `message_blocked` PostHog event from here.
 * Never pass or log the visitor's message text.
 */
export function onBlocked(reason: BlockReason, publicKey: string): void {
  void reason;
  void publicKey;
}
