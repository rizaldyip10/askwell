import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_ID, SOURCE_ID, USER, context, withStorage } from "../../../../lib/knowledge/route-test-utils";
import { fail, fakeClient, ok } from "../../../../lib/projects/test-utils";
import { createOwnerClient } from "../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../lib/supabase/service";
import { DELETE } from "./route";

vi.mock("server-only", () => ({}));
const authMock = vi.fn<() => Promise<{ userId: string | null }>>();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
vi.mock("../../../../lib/supabase/owner", () => ({ createOwnerClient: vi.fn() }));
vi.mock("../../../../lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("../../../../lib/knowledge", () => ({ processSource: vi.fn(), KNOWLEDGE_BUCKET: "knowledge" }));

const KEY = `${PROJECT_ID}/file.pdf`;

let owner: ReturnType<typeof fakeClient>;
let service: ReturnType<typeof fakeClient>;
let storage: ReturnType<typeof withStorage>;

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ userId: USER });
  owner = fakeClient();
  service = fakeClient();
  storage = withStorage(service);
  vi.mocked(createOwnerClient).mockReturnValue(owner.client as unknown as ReturnType<typeof createOwnerClient>);
  vi.mocked(createServiceClient).mockReturnValue(service.client as unknown as ReturnType<typeof createServiceClient>);
});

const del = (id = SOURCE_ID) =>
  DELETE(new Request(`https://askwell.test/api/knowledge/${id}`, { method: "DELETE" }), context(id));

describe("DELETE /api/knowledge/:id", () => {
  it("401 when signed out", async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await del()).status).toBe(401);
    expect(createOwnerClient).not.toHaveBeenCalled();
  });

  it("400 for an invalid id", async () => {
    expect((await del("nope")).status).toBe(400);
    expect(createOwnerClient).not.toHaveBeenCalled();
  });

  it("404 for another owner's source (RLS returns no row), with nothing deleted", async () => {
    owner.queue("knowledge_sources", ok(null));
    const res = await del();
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("finds the source with the owner client, then deletes the file and the row with the service client", async () => {
    owner.queue("knowledge_sources", ok({ id: SOURCE_ID, project_id: PROJECT_ID, storage_key: KEY }));
    service.queue("knowledge_sources", ok(null));

    const res = await del();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [lookup] = owner.callsTo("knowledge_sources");
    expect(lookup).toContainEqual({ method: "eq", args: ["id", SOURCE_ID] });
    expect(storage.from).toHaveBeenCalledWith("knowledge");
    expect(storage.bucket.remove).toHaveBeenCalledWith([KEY]);
    const [rowDelete] = service.callsTo("knowledge_sources");
    expect(rowDelete).toEqual([
      { method: "from", args: ["knowledge_sources"] },
      { method: "delete", args: [] },
      { method: "eq", args: ["id", SOURCE_ID] },
      { method: "eq", args: ["project_id", PROJECT_ID] },
    ]);
  });

  it("pasted text has no file: only the row is deleted", async () => {
    owner.queue("knowledge_sources", ok({ id: SOURCE_ID, project_id: PROJECT_ID, storage_key: null }));
    service.queue("knowledge_sources", ok(null));
    expect((await del()).status).toBe(200);
    expect(storage.bucket.remove).not.toHaveBeenCalled();
  });

  it("if the file can't be removed: 500 and the row is kept, so the owner can retry", async () => {
    owner.queue("knowledge_sources", ok({ id: SOURCE_ID, project_id: PROJECT_ID, storage_key: KEY }));
    storage.bucket.remove.mockResolvedValueOnce({ data: null, error: { name: "StorageError" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await del();

    expect(res.status).toBe(500);
    expect(service.callsTo("knowledge_sources")).toEqual([]);
    log.mockRestore();
  });

  it("500 internal on a database error", async () => {
    owner.queue("knowledge_sources", fail("XX000", "boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await del()).status).toBe(500);
    log.mockRestore();
  });
});
