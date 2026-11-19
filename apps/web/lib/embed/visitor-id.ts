import { idSchema } from "@askwell/shared";

export const VISITOR_ID_STORAGE_KEY = "askwell:visitorId";

let pageId: string | null = null;

function readStored(getStorage: () => Storage): string | null {
  try {
    const stored = getStorage().getItem(VISITOR_ID_STORAGE_KEY);
    return stored && idSchema.safeParse(stored).success ? stored : null;
  } catch {
    return null;
  }
}

/**
 * A random visitor ID kept in the iframe's localStorage and reused across visits.
 * Resolved once per page load and then kept in memory, so it stays stable even if
 * storage access starts or stops failing mid-session. Third-party iframes may have
 * storage blocked or partitioned: then the ID lasts for this page load only.
 */
export function getVisitorId(getStorage: () => Storage = () => window.localStorage): string {
  if (pageId) return pageId;
  const stored = readStored(getStorage);
  if (stored) return (pageId = stored);
  const id = crypto.randomUUID();
  pageId = id;
  try {
    getStorage().setItem(VISITOR_ID_STORAGE_KEY, id);
  } catch {
    // Storage blocked or full: the in-memory ID still serves this page load.
  }
  return id;
}

/** Test-only: forget the ID resolved for this page load. */
export function resetVisitorIdMemory(): void {
  pageId = null;
}
