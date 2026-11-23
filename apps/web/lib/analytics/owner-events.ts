import "server-only";

import type { KnowledgeSourceType, Plan } from "@askwell/shared";
import type { AnalyticsEvent, AnalyticsProperties } from "./events";
import { captureServer } from "./server";

// The owner-side funnel events (project.md §6.11): landing → sign up → project → knowledge →
// install → first chat → upgrade. `distinct_id` is always the owner's Clerk user ID, the same
// ID the dashboard identifies with (components/analytics/posthog-identify.tsx), so the funnel
// joins one person. Only IDs, plans and types: never message or knowledge text, file names or
// keys. Each helper goes through captureServer (sent after the response) and never throws,
// so analytics can't break the route that calls it.
// (`snippet_copied` is captured in the browser: components/projects/install-snippet.tsx.)

/** A new `accounts` row was created (first sign-in), not on later sign-ins. */
export function trackSignedUp(clerkUserId: string): void {
  send("signed_up", clerkUserId);
}

/** POST /api/projects created a project. */
export function trackProjectCreated(clerkUserId: string, projectId: string, plan: Plan): void {
  send("project_created", clerkUserId, { project_id: projectId, plan });
}

/** A knowledge source finished processing (`ready`). Not for refused or failed files. */
export function trackKnowledgeAdded(clerkUserId: string, projectId: string, sourceType: KnowledgeSourceType): void {
  send("knowledge_added", clerkUserId, { project_id: projectId, source_type: sourceType });
}

/**
 * The owner upgraded to Pro. Nothing calls this yet: the Clerk Billing webhook
 * (`POST /api/clerk/webhook`) calls it in Phase 5, once it has set `accounts.plan` to `pro`.
 */
export function trackUpgraded(clerkUserId: string): void {
  send("upgraded", clerkUserId, { plan: "pro" });
}

function send(event: AnalyticsEvent, clerkUserId: string, properties?: AnalyticsProperties): void {
  try {
    if (properties) captureServer(event, clerkUserId, properties);
    else captureServer(event, clerkUserId);
  } catch (error) {
    console.warn(`[analytics] ${event} failed`, error instanceof Error ? error.name : "unknown error");
  }
}
