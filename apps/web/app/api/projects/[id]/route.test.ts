import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeClient, fail, ok } from "../../../../lib/projects/test-utils";
import { createOwnerClient } from "../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../lib/supabase/service";
import { DELETE, PATCH } from "./route";

vi.mock("server-only", () => ({}));
const authMock = vi.fn<() => Promise<{ userId: string | null }>>();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
vi.mock("../../../../lib/supabase/owner", () => ({ createOwnerClient: vi.fn() }));
vi.mock("../../../../lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

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
  it("401 when signed out", async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await del(ID)).status).toBe(401);
  });

  it("400 for a bad id", async () => {
    const res = await del("nope");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
  });

  it("deletes through the owner client and returns { ok: true }", async () => {
    owner.queue("projects", ok([{ id: ID }]));
    const res = await del(ID);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [calls] = owner.callsTo("projects");
    expect(calls?.map((c) => c.method)).toContain("delete");
    expect(calls).toContainEqual({ method: "eq", args: ["id", ID] });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("404 for another owner's (or a missing) project: RLS deletes no row", async () => {
    owner.queue("projects", ok([]));
    const res = await del(OTHER_OWNERS_ID);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("500 on a database error", async () => {
    owner.queue("projects", fail("XX000", "boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await del(ID)).status).toBe(500);
    log.mockRestore();
  });
});
