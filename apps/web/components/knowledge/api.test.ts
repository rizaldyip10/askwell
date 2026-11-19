import { describe, expect, it, vi } from "vitest";
import { uploadKnowledgeFile, type UploadStep } from "./api";

const PROJECT = "00000000-0000-4000-8000-0000000000a1";
const SOURCE = "00000000-0000-4000-8000-0000000000b1";
const SIGNED = "https://storage.test/object/upload/sign/knowledge/p/x.md?token=t";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const source = (status: string) => ({ id: SOURCE, projectId: PROJECT, title: "notes.md", type: "md", status, createdAt: "t" });

/** A fetch that answers each URL from `routes` (a function of the call) and records calls. */
function fakeFetch(routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    return routes[key]!(init);
  });
}

const file = new File(["# Notes"], "notes.md", { type: "" });

describe("uploadKnowledgeFile", () => {
  it("upload-url → PUT to the signed URL (bucket MIME type, no key) → finalize", async () => {
    const fetchImpl = fakeFetch({
      "/upload-url": () => json({ source: source("uploading"), upload: { signedUrl: SIGNED, token: "t", path: "p/x.md" } }, 201),
      "storage.test": () => new Response("{}", { status: 200 }),
      "/finalize": () => json({ source: source("processing") }),
    });
    const steps: UploadStep[] = [];

    const result = await uploadKnowledgeFile(PROJECT, file, "md", (s) => steps.push(s), fetchImpl);

    expect(result).toEqual({ ok: true, data: { source: source("processing") } });
    expect(steps).toEqual(["reserving", "uploading", "finalizing"]);
    const [reserve, put, finalize] = fetchImpl.mock.calls;
    expect(String(reserve![0])).toBe(`/api/projects/${PROJECT}/knowledge/upload-url`);
    expect(JSON.parse(String(reserve![1]!.body))).toEqual({ fileName: "notes.md", size: file.size });
    expect(String(put![0])).toBe(SIGNED);
    expect(put![1]).toMatchObject({ method: "PUT", headers: { "Content-Type": "text/markdown" }, body: file });
    expect(JSON.stringify(put![1]!.headers)).not.toMatch(/authorization|apikey/i);
    expect(JSON.parse(String(finalize![1]!.body))).toEqual({ sourceId: SOURCE });
  });

  it("returns the plan_limit failure from upload-url, with no upload", async () => {
    const fetchImpl = fakeFetch({
      "/upload-url": () => json({ error: { code: "plan_limit", message: "Your plan allows 3 knowledge sources per project." } }, 403),
    });
    const result = await uploadKnowledgeFile(PROJECT, file, "md", undefined, fetchImpl);
    expect(result).toMatchObject({ ok: false, code: "plan_limit", status: 403 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("a failed PUT deletes the reservation (frees the slot) and doesn't finalize", async () => {
    const fetchImpl = fakeFetch({
      "/upload-url": () => json({ source: source("uploading"), upload: { signedUrl: SIGNED, token: "t", path: "p/x.md" } }, 201),
      "storage.test": () => new Response("bad", { status: 400 }),
      [`/api/knowledge/${SOURCE}`]: () => json({ ok: true }),
    });

    const result = await uploadKnowledgeFile(PROJECT, file, "md", undefined, fetchImpl);

    expect(result).toMatchObject({ ok: false, status: 400 });
    const urls = fetchImpl.mock.calls.map(([u, init]) => `${init?.method} ${String(u)}`);
    expect(urls).toEqual([
      `POST /api/projects/${PROJECT}/knowledge/upload-url`,
      `PUT ${SIGNED}`,
      `DELETE /api/knowledge/${SOURCE}`,
    ]);
  });

  it("returns finalize's refusal (e.g. not a real PDF); the follow-up delete is a harmless 404", async () => {
    const fetchImpl = fakeFetch({
      "/upload-url": () => json({ source: source("uploading"), upload: { signedUrl: SIGNED, token: "t", path: "p/x.pdf" } }, 201),
      "storage.test": () => new Response("{}"),
      "/finalize": () => json({ error: { code: "validation_error", message: "File is not a valid PDF" } }, 400),
      [`/api/knowledge/${SOURCE}`]: () => json({ error: { code: "not_found", message: "Knowledge source not found" } }, 404),
    });
    const result = await uploadKnowledgeFile(PROJECT, file, "pdf", undefined, fetchImpl);
    expect(result).toMatchObject({ ok: false, code: "validation_error", message: "File is not a valid PDF" });
  });

  it("finalize 'not uploaded yet' (source back to uploading): deletes the reservation so it can't linger", async () => {
    const notUploaded = "The file hasn't been uploaded yet. Upload it, then try again.";
    const fetchImpl = fakeFetch({
      "/upload-url": () => json({ source: source("uploading"), upload: { signedUrl: SIGNED, token: "t", path: "p/x.md" } }, 201),
      "storage.test": () => new Response("{}"),
      "/finalize": () => json({ error: { code: "validation_error", message: notUploaded } }, 400),
      [`/api/knowledge/${SOURCE}`]: () => json({ ok: true }),
    });

    const result = await uploadKnowledgeFile(PROJECT, file, "md", undefined, fetchImpl);

    expect(result).toMatchObject({ ok: false, code: "validation_error", message: notUploaded });
    expect(fetchImpl.mock.calls.map(([u, init]) => `${init?.method} ${String(u)}`).at(-1)).toBe(
      `DELETE /api/knowledge/${SOURCE}`,
    );
  });

  it("a successful finalize deletes nothing", async () => {
    const fetchImpl = fakeFetch({
      "/upload-url": () => json({ source: source("uploading"), upload: { signedUrl: SIGNED, token: "t", path: "p/x.md" } }, 201),
      "storage.test": () => new Response("{}"),
      "/finalize": () => json({ source: source("processing") }),
    });
    await uploadKnowledgeFile(PROJECT, file, "md", undefined, fetchImpl);
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });
});
