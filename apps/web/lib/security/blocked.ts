import "server-only";

import { captureServer } from "../analytics/server";

export type BlockReason = "rate_limit" | "injection";

/**
 * Called when a widget chat message is blocked (chat only, never config: project.md §6.6, §6.11).
 * Sends `message_blocked` with the reason and public key. The project may not exist yet, so
 * the event gets a random distinct ID and no person profile. Never the visitor's message text.
 * captureServer sends after the response and never throws.
 */
export function onBlocked(reason: BlockReason, publicKey: string): void {
  captureServer("message_blocked", crypto.randomUUID(), {
    reason,
    public_key: publicKey,
    $process_person_profile: false,
  });
}
