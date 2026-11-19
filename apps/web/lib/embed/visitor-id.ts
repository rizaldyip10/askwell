import { idSchema } from "@askwell/shared";

export const VISITOR_ID_STORAGE_KEY = "askwell:visitorId";

let memoryId: string | null = null;

/**
 * A random visitor ID kept in the iframe's localStorage and reused across visits.
 * Third-party iframes may have storage blocked or partitioned: then the ID lives
 * in memory for this page load only.
 */
export function getVisitorId(getStorage: () => Storage = () => window.localStorage): string {
  try {
    const storage = getStorage();
    const stored = storage.getItem(VISITOR_ID_STORAGE_KEY);
    if (stored && idSchema.safeParse(stored).success) return stored;
    const id = crypto.randomUUID();
    storage.setItem(VISITOR_ID_STORAGE_KEY, id);
    return id;
  } catch {
    memoryId ??= crypto.randomUUID();
    return memoryId;
  }
}

/** Test-only: forget the in-memory fallback. */
export function resetVisitorIdMemory(): void {
  memoryId = null;
}
