// The product events (project.md §6.11). One list for the whole app, so the funnel
// (landing → sign up → project → knowledge → install → first chat → upgrade) stays consistent.

export const ANALYTICS_EVENTS = [
  "signed_up",
  "project_created",
  "knowledge_added",
  "snippet_copied",
  "first_chat",
  "upgraded",
  "message_blocked",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/**
 * Event properties: flat scalars only. Never message text, keys or other secrets.
 * `$process_person_profile: false` sends an event without creating a person (signed-out actors).
 */
export type AnalyticsProperties = Record<string, string | number | boolean | null>;
