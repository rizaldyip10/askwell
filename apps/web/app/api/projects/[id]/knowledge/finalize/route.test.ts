import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import { after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackKnowledgeAdded } from "../../../../../../lib/analytics/owner-events";
import { processSource } from "../../../../../../lib/knowledge";
import {
  PROJECT_ID,
  SOURCE_ID,
  USER,
  blob,
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
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../../../../../../lib/supabase/owner", () => ({ createOwnerClient: vi.fn() }));
vi.mock("../../../../../../lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("../../../../../../lib/knowledge", () => ({ processSource: vi.fn(), KNOWLEDGE_BUCKET: "knowledge" }));
vi.mock("../../../../../../lib/analytics/owner-events", () => ({ trackKnowledgeAdded: vi.fn() }));

const KEY = `${PROJECT_ID}/0b0b0b0b-0000-4000-8000-000000000001.pdf`;

let owner: ReturnType<typeof fakeClient>;
let service: ReturnType<typeof fakeClient>;
let storage: ReturnType<typeof withStorage>;

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ userId: USER });
  vi.mocked(after).mockReset();
  vi.mocked(processSource).mockReset().mockResolvedValue({ status: "ready", chunkCount: 1 });
  vi.mocked(trackKnowledgeAdded).mockReset();
  owner = fakeClient();
  service = fakeClient();
  storage = withStorage(service);
  vi.mocked(createOwnerClient).mockReturnValue(owner.client as unknown as ReturnType<typeof createOwnerClient>);
  vi.mocked(createServiceClient).mockReturnValue(service.client as unknown as ReturnType<typeof createServiceClient>);
});

const finalize = (body: unknown = { sourceId: SOURCE_ID }, id = PROJECT_ID) =>
  POST(jsonRequest(`/api/projects/${id}/knowledge/finalize`, body), context(id));

const owned = () => owner.queue("projects", ok(projectRow));

/** The claim wins: the update returns the source, now processing. */
const claimWins = (type = "pdf", key = KEY) =>
  service.queue("knowledge_sources", ok(sourceRow({ type, storage_key: key, status: "processing", title: "a.pdf" })));

const PDF = "%PDF-1.4\n%fake but with the right signature\n";

async function runAfter() {
  for (const [task] of vi.mocked(after).mock.calls) await (task as () => Promise<unknown>)();
}

describe("POST /api/projects/:id/knowledge/finalize", () => {
  it("401 when signed out", async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await finalize()).status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it.each([
    ["no sourceId", {}],
    ["a sourceId that isn't a uuid", { sourceId: "abc" }],
  ])("400 validation_error for %s", async (_name, body) => {
    const res = await finalize(body);
    expect(res.status).toBe(400);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("404 for another owner's project, with no claim", async () => {
    owner.queue("projects", ok(null));
    expect((await finalize()).status).toBe(404);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("claims with one conditional update uploading → processing, scoped to the source and project", async () => {
    owned();
    claimWins();
    storage.bucket.download.mockResolvedValueOnce({ data: blob(PDF), error: null });

    const res = await finalize();

    expect(res.status).toBe(200);
    const [claim] = service.callsTo("knowledge_sources");
    expect(claim).toEqual([
      { method: "from", args: ["knowledge_sources"] },
      { method: "update", args: [{ status: "processing" }] },
      { method: "eq", args: ["id", SOURCE_ID] },
      { method: "eq", args: ["project_id", PROJECT_ID] },
      { method: "eq", args: ["status", "uploading"] },
      { method: "select", args: ["*"] },
      { method: "maybeSingle", args: [] },
    ]);
    expect((await res.json()).source).toMatchObject({ id: SOURCE_ID, status: "processing", type: "pdf" });
    expect(storage.bucket.download).toHaveBeenCalledWith(KEY);
    expect(processSource).not.toHaveBeenCalled();
    await runAfter();
    expect(processSource).toHaveBeenCalledWith({ sourceId: SOURCE_ID, projectId: PROJECT_ID, type: "pdf", storageKey: KEY });
  });

  it("sends knowledge_added once the file is ready, with project_id and the file type only", async () => {
    owned();
    claimWins();
    storage.bucket.download.mockResolvedValueOnce({ data: blob(PDF), error: null });
    await finalize();
    expect(trackKnowledgeAdded).not.toHaveBeenCalled();
    await runAfter();
    expect(vi.mocked(trackKnowledgeAdded).mock.calls).toEqual([[USER, PROJECT_ID, "pdf"]]);
    expect(JSON.stringify(vi.mocked(trackKnowledgeAdded).mock.calls)).not.toContain(KEY); // no file name
  });

  it("doesn't send knowledge_added for a failed or refused file", async () => {
    owned();
    claimWins();
    storage.bucket.download.mockResolvedValueOnce({ data: blob(PDF), error: null });
    vi.mocked(processSource).mockResolvedValue({ status: "failed", reason: "no_text" });
    await finalize();
    await runAfter();

    vi.mocked(after).mockReset();
    owned();
    claimWins();
    storage.bucket.download.mockResolvedValueOnce({ data: blob("<html>not a pdf</html>"), error: null });
    service.queue("knowledge_sources", ok(null));
    expect((await finalize()).status).toBe(400);
    await runAfter();
    expect(trackKnowledgeAdded).not.toHaveBeenCalled();
  });

  it("finalizing twice: the second claim matches no row → 404, and processing starts once", async () => {
    owned();
    claimWins();
    storage.bucket.download.mockResolvedValueOnce({ data: blob(PDF), error: null });
    owned();
    service.queue("knowledge_sources", ok(null)); // already processing: the claim matches nothing

    const first = await finalize();
    const second = await finalize();

    expect(first.status).toBe(200);
    expect(second.status).toBe(404);
    expect((await second.json()).error.code).toBe("not_found");
    expect(storage.bucket.download).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("a source of another project (or unknown) → the scoped claim matches nothing → 404", async () => {
    owned();
    service.queue("knowledge_sources", ok(null));
    expect((await finalize()).status).toBe(404);
    expect(storage.bucket.download).not.toHaveBeenCalled();
  });

  it("refuses a .pdf whose bytes aren't a PDF: deletes the object and the source → 400", async () => {
    owned();
    claimWins();
    storage.bucket.download.mockResolvedValueOnce({ data: blob("<html>not a pdf</html>"), error: null });
    service.queue("knowledge_sources", ok(null)); // the delete

    const res = await finalize();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "validation_error", message: "File is not a valid PDF" } });
    expect(storage.bucket.remove).toHaveBeenCalledWith([KEY]);
    const [, del] = service.callsTo("knowledge_sources");
    expect(del).toContainEqual({ method: "delete", args: [] });
    expect(del).toContainEqual({ method: "eq", args: ["id", SOURCE_ID] });
    expect(del).toContainEqual({ method: "eq", args: ["project_id", PROJECT_ID] });
    expect(after).not.toHaveBeenCalled();
  });

  it("refuses a real file over 10 MB the same way", async () => {
    owned();
    claimWins("txt", `${PROJECT_ID}/big.txt`);
    storage.bucket.download.mockResolvedValueOnce({
      data: blob(new Uint8Array(MAX_KNOWLEDGE_FILE_BYTES + 1)),
      error: null,
    });
    service.queue("knowledge_sources", ok(null));

    const res = await finalize();

    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("File is larger than 10 MB");
    expect(storage.bucket.remove).toHaveBeenCalledWith([`${PROJECT_ID}/big.txt`]);
    expect(after).not.toHaveBeenCalled();
  });

  it("doesn't check the PDF signature of Markdown or TXT", async () => {
    owned();
    claimWins("md", `${PROJECT_ID}/notes.md`);
    storage.bucket.download.mockResolvedValueOnce({ data: blob("# Notes"), error: null });
    expect((await finalize()).status).toBe(200);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("no uploaded file yet: undoes the claim (back to uploading) → 400, nothing deleted", async () => {
    owned();
    claimWins();
    // download fails (default fake): no object yet
    service.queue("knowledge_sources", ok(null)); // the undo

    const res = await finalize();

    expect(res.status).toBe(400);
    const [, undo] = service.callsTo("knowledge_sources");
    expect(undo).toContainEqual({ method: "update", args: [{ status: "uploading" }] });
    expect(undo).toContainEqual({ method: "eq", args: ["status", "processing"] });
    expect(storage.bucket.remove).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("500 internal on a database error", async () => {
    owned();
    service.queue("knowledge_sources", fail("XX000", "boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await finalize();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
    log.mockRestore();
  });
});
