import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeKnowledgeFiles } from "../../../../lib/knowledge/routes";
import { fakeClient, fail, ok } from "../../../../lib/projects/test-utils";
import { createOwnerClient } from "../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../lib/supabase/service";
import { DELETE, PATCH } from "./route";

vi.mock("server-only", () => ({}));
const authMock = vi.fn<() => Promise<{ userId: string | null }>>();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
vi.mock("../../../../lib/supabase/owner", () => ({ createOwnerClient: vi.fn() }));
vi.mock("../../../../lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
// The real shared helper, wrapped in a spy: the route must go through it, and its Storage
// call is still exercised end to end.
vi.mock("../../../../lib/knowledge/routes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/knowledge/routes")>();
  return { ...actual, removeKnowledgeFiles: vi.fn(actual.removeKnowledgeFiles) };
});
const removeFiles = vi.mocked(removeKnowledgeFiles);

const ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const OTHER_OWNERS_ID = "0b0b0b0b-0000-4000-8000-000000000000";
const ROW = {
  id: ID,
  owner_id: "user_a",
  name: "Renamed",
  public_key: "pk_x",
  messages_used: 0,
  period_start: "t",
  created_at: "t",
};

let owner: ReturnType<typeof fakeClient>;

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ userId: "user_a" });
  owner = fakeClient();
  vi.mocked(createOwnerClient).mockReturnValue(owner.client as unknown as ReturnType<typeof createOwnerClient>);
  vi.mocked(createServiceClient).mockReset();
  removeFiles.mockClear();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (id: string, body: unknown) =>
  PATCH(new Request(`https://askwell.test/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }), ctx(id));
const del = (id: string) => DELETE(new Request(`https://askwell.test/api/projects/${id}`, { method: "DELETE" }), ctx(id));

describe("PATCH /api/projects/:id", () => {
  it("401 when signed out", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await patch(ID, { name: "x" });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  it("400 for a bad id or body", async () => {
    expect((await patch("not-a-uuid", { name: "x" })).status).toBe(400);
    for (const body of [{}, { name: "" }, { name: "x".repeat(61) }, { name: "x", publicKey: "pk_y" }]) {
      const res = await patch(ID, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error.code).toBe("validation_error");
    }
    expect(owner.client.from).not.toHaveBeenCalled();
  });

  it("renames through the owner client and returns the project", async () => {
    owner.queue("projects", ok(ROW));
    const res = await patch(ID, { name: "  Renamed " });

    expect(res.status).toBe(200);
    expect((await res.json()).project).toMatchObject({ id: ID, name: "Renamed" });
    const [calls] = owner.callsTo("projects");
    expect(calls).toContainEqual({ method: "update", args: [{ name: "Renamed" }] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", ID] });
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(removeFiles).not.toHaveBeenCalled();
  });

  it("404 for another owner's (or a missing) project: RLS updates no row", async () => {
    owner.queue("projects", ok(null));
    const res = await patch(OTHER_OWNERS_ID, { name: "Mine now" });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("500 on a database error", async () => {
    owner.queue("projects", fail("XX000", "boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await patch(ID, { name: "x" })).status).toBe(500);
    log.mockRestore();
  });
});

describe("DELETE /api/projects/:id", () => {
  const KEYS = [`${ID}/a.pdf`, `${ID}/b.md`];

  /** A fake service client whose storage.from("knowledge").remove resolves to `result`. */
  function serviceWithStorage(result: { data: unknown; error: unknown } = { data: [], error: null }) {
    const remove = vi.fn<(keys: string[]) => Promise<typeof result>>(async () => result);
    const from = vi.fn<(name: string) => { remove: typeof remove }>(() => ({ remove }));
    vi.mocked(createServiceClient).mockReturnValue({ storage: { from } } as unknown as ReturnType<
      typeof createServiceClient
    >);
    return { from, remove };
  }

  it("401 when signed out", async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await del(ID)).status).toBe(401);
  });

  it("400 for a bad id", async () => {
    const res = await del("nope");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
  });

  it("deletes through the owner client and returns { ok: true }; no files → no Storage call", async () => {
    owner.queue("knowledge_sources", ok([]));
    owner.queue("projects", ok([{ id: ID }]));
    const res = await del(ID);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [calls] = owner.callsTo("projects");
    expect(calls?.map((c) => c.method)).toContain("delete");
    expect(calls).toContainEqual({ method: "eq", args: ["id", ID] });
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(removeFiles).not.toHaveBeenCalled();
  });

  it("removes exactly the project's file keys (2 files, 1 pasted text), in one batch, after the delete", async () => {
    // RLS-scoped read of the non-null keys; the pasted text's null key is filtered out.
    owner.queue("knowledge_sources", ok(KEYS.map((storage_key) => ({ storage_key }))));
    owner.queue("projects", ok([{ id: ID }]));
    const storage = serviceWithStorage();

    const res = await del(ID);

    expect(res.status).toBe(200);
    const [read] = owner.callsTo("knowledge_sources");
    expect(read).toContainEqual({ method: "select", args: ["storage_key"] });
    expect(read).toContainEqual({ method: "eq", args: ["project_id", ID] });
    expect(read).toContainEqual({ method: "not", args: ["storage_key", "is", null] });
    expect(removeFiles).toHaveBeenCalledTimes(1);
    expect(removeFiles).toHaveBeenCalledWith(vi.mocked(createServiceClient).mock.results[0]?.value, KEYS, "delete project");
    expect(storage.from).toHaveBeenCalledWith("knowledge");
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(KEYS);
    // Files are read first, the project deleted second, the files removed last.
    expect(owner.queries.map((q) => q.target)).toEqual(["knowledge_sources", "projects"]);
  });

  it("404 for another owner's (or a missing) project: RLS deletes no row, and no Storage call", async () => {
    owner.queue("knowledge_sources", ok([])); // RLS: another owner's sources are invisible
    owner.queue("projects", ok([]));
    const res = await del(OTHER_OWNERS_ID);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(removeFiles).not.toHaveBeenCalled();
  });

  it("no row deleted → 404 and no files touched, even if keys were read", async () => {
    owner.queue("knowledge_sources", ok(KEYS.map((storage_key) => ({ storage_key }))));
    owner.queue("projects", ok([])); // e.g. deleted by another request in between
    expect((await del(ID)).status).toBe(404);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(removeFiles).not.toHaveBeenCalled();
  });

  it("a Storage error is logged without file names and the delete still returns { ok: true }", async () => {
    owner.queue("knowledge_sources", ok(KEYS.map((storage_key) => ({ storage_key }))));
    owner.queue("projects", ok([{ id: ID }]));
    serviceWithStorage({ data: null, error: Object.assign(new Error(`Object not found: ${KEYS[0]}`), { name: "StorageApiError" }) });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await del(ID);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(log).toHaveBeenCalledWith("[knowledge] delete project: removing files failed", {
      count: 2,
      error: "StorageApiError",
    });
    const logged = JSON.stringify(log.mock.calls);
    for (const key of KEYS) expect(logged).not.toContain(key);
    expect(logged).not.toContain("a.pdf");
    log.mockRestore();
  });

  it("a thrown Storage error is handled the same way", async () => {
    owner.queue("knowledge_sources", ok([{ storage_key: KEYS[0] }]));
    owner.queue("projects", ok([{ id: ID }]));
    const storage = serviceWithStorage();
    storage.remove.mockRejectedValueOnce(new TypeError("fetch failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await del(ID)).status).toBe(200);
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("500 on a database error reading the files, with nothing deleted", async () => {
    owner.queue("knowledge_sources", fail("XX000", "boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await del(ID)).status).toBe(500);
    expect(owner.callsTo("projects")).toEqual([]);
    log.mockRestore();
  });

  it("500 on a database error deleting the project, with no Storage call", async () => {
    owner.queue("knowledge_sources", ok([{ storage_key: KEYS[0] }]));
    owner.queue("projects", fail("XX000", "boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await del(ID)).status).toBe(500);
    expect(createServiceClient).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
