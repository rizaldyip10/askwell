// THROWAWAY (P4C-T09): never merged. Throws so onRequestError's PostHog capture can be checked on a preview.
export function GET(): Response {
  throw new Error("P4C-T09 server error check");
}
