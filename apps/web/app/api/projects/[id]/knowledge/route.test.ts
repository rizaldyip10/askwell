import { PLAN_LIMITS } from "@askwell/shared";
import { after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { processSource } from "../../../../../lib/knowledge";
import {
  PROJECT_ID,
  SOURCE_ID,
  USER,
  context,
  jsonRequest,
  projectRow,
  sourceRow,
  withStorage,
} from "../../../../../lib/knowledge/route-test-utils";
import { fail, fakeClient, ok } from "../../../../../lib/projects/test-utils";
import { createOwnerClient } from "../../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../../lib/supabase/service";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
const authMock = vi.fn<() => Promise<{ userId: string | null }>>();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../../../../../lib/supabase/owner", () => ({ createOwnerClient: vi.fn() }));
vi.mock("../../../../../lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("../../../../../lib/knowledge", () => ({ processSource: vi.fn(), KNOWLEDGE_BUCKET: "knowledge" }));

let owner: ReturnType<typeof fakeClient>;
let service: ReturnType<typeof fakeClient>;
let storage: ReturnType<typeof withStorage>;

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ userId: USER });
  vi.mocked(after).mockReset();
  vi.mocked(processSource).mockReset().mockResolvedValue({ status: "ready", chunkCount: 1 });
  owner = fakeClient();
  service = fakeClient();
  storage = withStorage(service);
  vi.mocked(createOwnerClient).mockReturnValue(owner.client as unknown as ReturnType<typeof createOwnerClient>);
  vi.mocked(createServiceClient).mockReturnValue(service.client as unknown as ReturnType<typeof createServiceClient>);
});

const BODY = { title: "Shipping FAQ", text: "We ship worldwide within 3 days." };
const paste = (body: unknown = BODY, id = PROJECT_ID) =>
  POST(jsonRequest(`/api/projects/${id}/knowledge`, body), context(id));

/** The owner owns the project and is on `plan`. */
function owned(plan = "free") {
  owner.queue("projects", ok(projectRow));
  owner.queue("accounts", ok({ plan }));
}

/** Run what the route scheduled with after(). */
async function runAfter() {
  for (const [task] of vi.mocked(after).mock.calls) await (task as () => Promise<unknown>)();
}

describe("POST /api/projects/:id/knowledge (paste)", () => {
  it("401 when signed out, without touching the database", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await paste();
    expect(res.status).toBe(401);
    expect(createOwnerClient).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it.each([
    ["no title", { text: "x" }],
    ["blank text", { title: "T", text: "   " }],
    ["text over the limit", { title: "T", text: "x".repeat(50_001) }],
    ["an extra field", { ...BODY, projectId: "x" }],
    ["a null body", null],
  ])("400 validation_error for %s", async (_name, body) => {
    const res = await paste(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("400 validation_error with no body at all", async () => {
    const res = await POST(new Request(`https://askwell.test/api/projects/${PROJECT_ID}/knowledge`, { method: "POST" }), context(PROJECT_ID));
    expect(res.status).toBe(400);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("400 for an invalid project id", async () => {
    const res = await paste(BODY, "not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("404 for another owner's project (RLS returns no row), with no service-client write", async () => {
    owner.queue("projects", ok(null));
    const res = await paste();
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("reserves as text/processing with the Free limit, returns 201, then processes in after()", async () => {
    owned("free");
    service.queue("rpc:reserve_knowledge_source", ok([{ ...sourceRow(), reclaimed_storage_keys: [] }]));

    const res = await paste();

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      source: {
        id: SOURCE_ID,
        projectId: PROJECT_ID,
        title: "FAQ",
        type: "text",
        status: "processing",
        createdAt: "2026-11-19T00:00:00Z",
      },
    });
    expect(service.client.rpc).toHaveBeenCalledWith("reserve_knowledge_source", {
      p_project_id: PROJECT_ID,
      p_title: BODY.title,
      p_type: "text",
      p_storage_key: null,
      p_status: "processing",
      p_max_sources: PLAN_LIMITS.free.knowledgeSources,
    });
    // Nothing processed before the response; after() runs it.
    expect(processSource).not.toHaveBeenCalled();
    await runAfter();
    expect(processSource).toHaveBeenCalledWith({
      sourceId: SOURCE_ID,
      projectId: PROJECT_ID,
      type: "text",
      text: BODY.text,
    });
  });

  it("uses the Pro limit for a Pro owner", async () => {
    owned("pro");
    service.queue("rpc:reserve_knowledge_source", ok([{ ...sourceRow(), reclaimed_storage_keys: [] }]));
    await paste();
    expect(service.client.rpc.mock.calls[0]?.[1]).toMatchObject({ p_max_sources: PLAN_LIMITS.pro.knowledgeSources });
  });

  it("403 plan_limit with an upgrade message at the limit, and nothing processed", async () => {
    owned("free");
    service.queue("rpc:reserve_knowledge_source", fail("P0001", "knowledge_limit"));

    const res = await paste();

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: "plan_limit", message: "Your plan allows 3 knowledge sources per project. Upgrade to add more." },
    });
    expect(after).not.toHaveBeenCalled();
  });

  it("removes the files of reclaimed stale reservations (in after())", async () => {
    owned();
    service.queue(
      "rpc:reserve_knowledge_source",
      ok([{ ...sourceRow(), reclaimed_storage_keys: [`${PROJECT_ID}/old.pdf`] }]),
    );
    await paste();
    await runAfter();
    expect(storage.bucket.remove).toHaveBeenCalledWith([`${PROJECT_ID}/old.pdf`]);
  });

  it("500 internal on an unexpected error, logging no document text", async () => {
    owned();
    service.queue("rpc:reserve_knowledge_source", fail("XX000", "boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await paste();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong" } });
    expect(JSON.stringify(log.mock.calls)).not.toContain(BODY.text);
    log.mockRestore();
  });
});
