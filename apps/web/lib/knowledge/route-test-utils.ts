// Test helpers for the knowledge route tests: ids and rows, request builders, and a fake
// Storage bucket to attach to a fakeClient (lib/projects/test-utils).
import { vi } from "vitest";
import type { fakeClient } from "../projects/test-utils";
import type { KnowledgeSourceRow } from "./routes";

export const USER = "user_owner";
export const PROJECT_ID = "00000000-0000-4000-8000-0000000000a1";
export const SOURCE_ID = "00000000-0000-4000-8000-0000000000b1";

export const projectRow = {
  id: PROJECT_ID,
  owner_id: USER,
  name: "Site",
  public_key: `pk_${"0".repeat(32)}`,
  messages_used: 0,
  period_start: "2026-11-19T00:00:00Z",
  created_at: "2026-11-19T00:00:00Z",
};

export function sourceRow(overrides: Partial<KnowledgeSourceRow> = {}): KnowledgeSourceRow {
  return {
    id: SOURCE_ID,
    project_id: PROJECT_ID,
    title: "FAQ",
    type: "text",
    storage_key: null,
    status: "processing",
    created_at: "2026-11-19T00:00:00Z",
    ...overrides,
  };
}

export const context = (id: string) => ({ params: Promise.resolve({ id }) });

export const jsonRequest = (path: string, body: unknown, method = "POST") =>
  new Request(`https://askwell.test${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });

type StorageResult = { data: unknown; error: unknown };

/** A fake `storage.from(bucket)` with the three calls the routes make. */
export function fakeStorage() {
  const bucket = {
    download: vi.fn<(key: string) => Promise<StorageResult>>(async () => ({ data: null, error: { name: "StorageError" } })),
    remove: vi.fn<(keys: string[]) => Promise<StorageResult>>(async () => ({ data: [], error: null })),
    createSignedUploadUrl: vi.fn<(key: string) => Promise<StorageResult>>(async (key) => ({
      data: { signedUrl: `https://storage.test/upload/sign/knowledge/${key}?token=t0k`, token: "t0k", path: key },
      error: null,
    })),
  };
  type Bucket = typeof bucket;
  const from = vi.fn<(name: string) => Bucket>(() => bucket);
  return { from, bucket };
}

/** A fakeClient with a fake Storage attached. */
export function withStorage(client: ReturnType<typeof fakeClient>) {
  const storage = fakeStorage();
  Object.assign(client.client, { storage: { from: storage.from } });
  return storage;
}

/** A Blob with these bytes (or text). */
export const blob = (content: string | Uint8Array) =>
  new Blob([typeof content === "string" ? content : content.slice()]);
