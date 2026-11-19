import { PLAN_LIMITS } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROJECT_ID,
  SOURCE_ID,
  USER,
  context,
  jsonRequest,
  projectRow,
  sourceRow,
  withStorage,
} from "../../../../../../lib/knowledge/route-test-utils";
import { fail, fakeClient, ok } from "../../../../../../lib/projects/test-utils";
import { createOwnerClient } from "../../../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../../../lib/supabase/service";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
const authMock = vi.fn<() => Promise<{ userId: string | null }>>();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
vi.mock("../../../../../../lib/supabase/owner", () => ({ createOwnerClient: vi.fn() }));
vi.mock("../../../../../../lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("../../../../../../lib/knowledge", () => ({ processSource: vi.fn(), KNOWLEDGE_BUCKET: "knowledge" }));

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

const BODY = { fileName: "Price list (2026).PDF", size: 120_000 };
const uploadUrl = (body: unknown = BODY, id = PROJECT_ID) =>
  POST(jsonRequest(`/api/projects/${id}/knowledge/upload-url`, body), context(id));

function owned(plan = "free") {
  owner.queue("projects", ok(projectRow));
  owner.queue("accounts", ok({ plan }));
}

/** reserve_knowledge_source as the database answers it, echoing the key it was given. */
function reserveOk(reclaimed: string[] = []) {
  service.client.rpc.mockImplementationOnce(((_fn: string, args: Record<string, unknown>) =>
    Promise.resolve(
      ok([
        {
          ...sourceRow({
            title: String(args.p_title),
            type: String(args.p_type),
            storage_key: String(args.p_storage_key),
            status: "uploading",
          }),
          reclaimed_storage_keys: reclaimed,
        },
      ]),
    )) as never);
}

describe("POST /api/projects/:id/knowledge/upload-url", () => {
  it("401 when signed out", async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await uploadUrl()).status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it.each([
    ["a disallowed extension", { fileName: "run.exe", size: 10 }],
    ["no extension", { fileName: "pdf", size: 10 }],
    ["a declared size over 10 MB", { fileName: "a.pdf", size: 10 * 1024 * 1024 + 1 }],
    ["a zero size", { fileName: "a.pdf", size: 0 }],
    ["a missing size", { fileName: "a.pdf" }],
  ])("400 validation_error for %s", async (_name, body) => {
    const res = await uploadUrl(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("404 for another owner's project, with no reservation", async () => {
    owner.queue("projects", ok(null));
    const res = await uploadUrl();
    expect(res.status).toBe(404);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("reserves as uploading under a random key (never the file name) and returns a signed upload URL", async () => {
    owned("free");
    reserveOk();

    const res = await uploadUrl();

    expect(res.status).toBe(201);
    const args = service.client.rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args).toMatchObject({
      p_project_id: PROJECT_ID,
      p_title: BODY.fileName,
      p_type: "pdf",
      p_status: "uploading",
      p_max_sources: PLAN_LIMITS.free.knowledgeSources,
    });
    const key = String(args.p_storage_key);
    expect(key).toMatch(new RegExp(`^${PROJECT_ID}/[0-9a-f-]{36}\\.pdf$`));
    expect(key).not.toContain("Price");
    expect(storage.from).toHaveBeenCalledWith("knowledge");
    expect(storage.bucket.createSignedUploadUrl).toHaveBeenCalledWith(key);

    const body = await res.json();
    expect(body.source).toMatchObject({ id: SOURCE_ID, type: "pdf", status: "uploading", title: BODY.fileName });
    expect(body.upload).toEqual({
      signedUrl: `https://storage.test/upload/sign/knowledge/${key}?token=t0k`,
      token: "t0k",
      path: key,
    });
  });

  it.each([
    ["notes.md", "md"],
    ["readme.markdown", "md"],
    ["faq.txt", "txt"],
  ])("takes the type from the name: %s → %s", async (fileName, type) => {
    owned();
    reserveOk();
    await uploadUrl({ fileName, size: 100 });
    const args = service.client.rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args.p_type).toBe(type);
    expect(String(args.p_storage_key).endsWith(`.${type}`)).toBe(true);
  });

  it("403 plan_limit at the limit, with no signed URL", async () => {
    owned("free");
    service.queue("rpc:reserve_knowledge_source", fail("P0001", "knowledge_limit"));
    const res = await uploadUrl();
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("plan_limit");
    expect(storage.bucket.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("removes the files of reclaimed stale reservations", async () => {
    owned();
    reserveOk([`${PROJECT_ID}/stale-1.pdf`, `${PROJECT_ID}/stale-2.txt`]);
    await uploadUrl();
    expect(storage.bucket.remove).toHaveBeenCalledWith([`${PROJECT_ID}/stale-1.pdf`, `${PROJECT_ID}/stale-2.txt`]);
  });

  it("still answers if removing reclaimed files fails (best effort)", async () => {
    owned();
    reserveOk([`${PROJECT_ID}/stale.pdf`]);
    storage.bucket.remove.mockResolvedValueOnce({ data: null, error: { name: "StorageError" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await uploadUrl()).status).toBe(201);
    log.mockRestore();
  });

  it("500 and the reservation removed if the signed URL can't be made", async () => {
    owned();
    reserveOk();
    storage.bucket.createSignedUploadUrl.mockResolvedValueOnce({ data: null, error: { name: "StorageError" } });
    service.queue("knowledge_sources", ok(null));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await uploadUrl();

    expect(res.status).toBe(500);
    const [deleteCalls] = service.callsTo("knowledge_sources");
    expect(deleteCalls).toContainEqual({ method: "delete", args: [] });
    expect(deleteCalls).toContainEqual({ method: "eq", args: ["id", SOURCE_ID] });
    log.mockRestore();
  });

  it("logs a failed rollback, so a stranded reservation is visible", async () => {
    owned();
    reserveOk();
    storage.bucket.createSignedUploadUrl.mockResolvedValueOnce({ data: null, error: { name: "StorageError" } });
    service.queue("knowledge_sources", fail("XX000", "delete failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await uploadUrl();

    expect(res.status).toBe(500);
    expect(log).toHaveBeenCalledWith("[knowledge] upload-url rollback failed", {
      projectId: PROJECT_ID,
      sourceId: SOURCE_ID,
      error: "XX000",
    });
    log.mockRestore();
  });
});
