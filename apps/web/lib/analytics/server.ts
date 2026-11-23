import "server-only";

import { after } from "next/server";
import { PostHog } from "posthog-node";
import { missingPosthogVariable, posthogMissingMessage, readPosthogEnv } from "./config";
import type { AnalyticsEvent, AnalyticsProperties } from "./events";

/** Longest a send may take. Analytics must never stall a request. */
export const SEND_TIMEOUT_MS = 2000;

/** The header posthog-js adds to our own API calls (`tracing_headers`). */
const DISTINCT_ID_HEADER = "x-posthog-distinct-id";
const MAX_DISTINCT_ID_LENGTH = 200;

// One client per server process, created on first use (never at import, so builds and tests
// with no key work). `null` means "no key": every call is a no-op.
let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client !== undefined) return client;
  const env = readPosthogEnv();
  if (!env) {
    if (process.env.NODE_ENV === "development") console.warn(posthogMissingMessage(missingPosthogVariable()));
    client = null;
    return null;
  }
  // Serverless: send each event at once rather than batching; the send itself runs in `after()`.
  client = new PostHog(env.key, { host: env.host, flushAt: 1, flushInterval: 0 });
  return client;
}

function withTimeout(promise: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((_, reject) => {
    timer = setTimeout(() => reject(new Error("PostHog send timed out")), SEND_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** Runs `send` after the response (`after()`), or right away outside a request. Never throws. */
function schedule(label: string, send: () => Promise<void>): void {
  const run = () =>
    withTimeout(Promise.resolve().then(send)).catch((error: unknown) => {
      console.warn(`[analytics] ${label} failed`, { error: errorName(error) });
    });
  try {
    after(run);
  } catch {
    // Outside a request scope (a script, a test, a callback already past the response).
    void run();
  }
}

/**
 * Sends a product event from the server without slowing the response: it goes out after the
 * response is sent. No key set → no-op. Never throws into the caller.
 *
 * `distinctId` is the Clerk user ID for owners. For a signed-out actor, pass a random or
 * per-project ID and `$process_person_profile: false`. Properties must never hold message
 * text or keys.
 */
export function captureServer(event: AnalyticsEvent, distinctId: string, properties: AnalyticsProperties = {}): void {
  try {
    const posthog = getClient();
    if (!posthog) return;
    schedule(`capture ${event}`, () => posthog.captureImmediate({ event, distinctId, properties }));
  } catch (error) {
    console.warn("[analytics] capture failed", { event, error: errorName(error) });
  }
}

/**
 * Sends a server error to PostHog Error tracking and waits for it (at most SEND_TIMEOUT_MS):
 * used from `onRequestError`, which runs after the error response. No key → no-op. Never throws.
 * No `distinctId` → a random one, sent without creating a person.
 */
export async function captureServerException(
  error: unknown,
  distinctId: string | null,
  properties: AnalyticsProperties = {},
): Promise<void> {
  try {
    const posthog = getClient();
    if (!posthog) return;
    const props: AnalyticsProperties = distinctId ? properties : { ...properties, $process_person_profile: false };
    await withTimeout(
      Promise.resolve().then(() => posthog.captureExceptionImmediate(error, distinctId ?? crypto.randomUUID(), props)),
    );
  } catch (sendError) {
    console.warn("[analytics] exception capture failed", { error: errorName(sendError) });
  }
}

/** The browser's PostHog distinct ID from the tracing header, if it looks sane. */
export function distinctIdFromHeaders(headers: Record<string, string | string[] | undefined> | Headers): string | null {
  const raw = headers instanceof Headers ? headers.get(DISTINCT_ID_HEADER) : headers[DISTINCT_ID_HEADER];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value && value.length <= MAX_DISTINCT_ID_LENGTH ? value : null;
}
