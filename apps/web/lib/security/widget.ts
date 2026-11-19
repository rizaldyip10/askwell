import "server-only";

import type { ArcjetDecision } from "@arcjet/next";
import { widgetChatArcjet, widgetConfigArcjet } from "./arcjet";
import { onBlocked, type BlockReason } from "./blocked";

export { onBlocked, type BlockReason };
export type ProtectResult = { allowed: true } | { allowed: false; reason: BlockReason };

/** Our own ceiling on an Arcjet call, on top of the SDK's 2 s timeout. */
export const PROTECT_TIMEOUT_MS = 2500;

const ALLOWED: ProtectResult = { allowed: true };

class ProtectTimeoutError extends Error {
  constructor() {
    super(`Arcjet did not answer within ${PROTECT_TIMEOUT_MS} ms`);
    this.name = "ProtectTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProtectTimeoutError()), PROTECT_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Run an Arcjet check and map the decision. Fails open (project.md §3): an Arcjet error,
 * an ERROR decision or a timeout lets the request through and is logged.
 */
async function decide(route: string, run: () => Promise<ArcjetDecision>): Promise<ProtectResult> {
  let decision: ArcjetDecision;
  try {
    decision = await withTimeout(run());
  } catch (error) {
    console.error(`[security] ${route}: Arcjet failed, allowing`, error instanceof Error ? error.message : error);
    return ALLOWED;
  }

  if (decision.isDenied()) {
    // Any denial that isn't prompt injection comes from the rate limit: it is the only other rule.
    const reason: BlockReason = decision.reason.isPromptInjection() ? "injection" : "rate_limit";
    return { allowed: false, reason };
  }

  if (decision.isErrored()) {
    const message = decision.reason.isError() ? decision.reason.message : "unknown error";
    console.error(`[security] ${route}: Arcjet errored, allowing`, message);
  }
  return ALLOWED;
}

/** GET /api/widget/config: 60 per minute per public key + IP. */
export function protectWidgetConfig(request: Request, { publicKey }: { publicKey: string }): Promise<ProtectResult> {
  return decide("widget config", () => widgetConfigArcjet.protect(request, { publicKey }));
}

/**
 * POST /api/widget/chat: 20 per minute per public key + IP, and prompt-injection detection on the message.
 * Calls {@link onBlocked} on a block (chat only: `message_blocked` is a chat event).
 */
export async function protectWidgetChat(
  request: Request,
  { publicKey, message }: { publicKey: string; message: string },
): Promise<ProtectResult> {
  const result = await decide("widget chat", () =>
    widgetChatArcjet.protect(request, { publicKey, detectPromptInjectionMessage: message }),
  );
  if (!result.allowed) onBlocked(result.reason, publicKey);
  return result;
}
