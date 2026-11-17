// System route (project.md §8 System). No input.

/** GET /api/posthog-config: PostHog's public project key and host, read at request time. */
export type PosthogConfigResponse = { key: string; host: string };
