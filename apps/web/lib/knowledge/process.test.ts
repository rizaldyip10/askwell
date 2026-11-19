import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tinyPdf } from "./test-pdf";

vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Fakes: an in-memory Supabase (only the calls processSource makes) and embeddings.
// ---------------------------------------------------------------------------

type Source = { id: string; project_id: string; type: string; storage_key: string | null; status: string };
type Chunk = { id?: string; project_id: string; source_id: string; content: string; embedding: string };
type DbError = { name: string; code: string; message: string };

const db = {
  sources: [] as Source[],
  chunks: [] as Chunk[],
  files: new Map<string, Uint8Array>(),
  /** Make the n-th chunk insert request (1-based) fail. */
  failInsertOn: 0,
  inserts: 0,
  downloads: [] as string[],
  nextChunkId: 0,
  /** Make deleting chunks by id (an attempt's own chunks) fail. */
  failDeleteByIds: false,
  /** Called after each knowledge_sources update, with the patch. */
  afterUpdate: undefined as ((patch: Partial<Source>) => void) | undefined,
};

const error = (message: string): DbError => ({ name: "PostgrestError", code: "XX000", message });

type Filter = (row: Record<string, unknown>) => boolean;
const matches = (row: Record<string, unknown>, filters: Filter[]) => filters.every((f) => f(row));

function table(name: "knowledge_sources" | "knowledge_chunks") {
  const rows = (): Record<string, unknown>[] => (name === "knowledge_sources" ? db.sources : db.chunks);
  /** A filter builder: .eq/.in add filters; awaiting it (or .maybeSingle/.select) runs `run`. */
  const query = (run: (filters: Filter[], usedIn: boolean) => { data?: unknown; error: DbError | null }) => {
    const filters: Filter[] = [];
    let usedIn = false;
    const builder = {
      eq(column: string, value: unknown) {
        filters.push((r) => r[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((r) => values.includes(r[column]));
        usedIn = true;
        return builder;
      },
      maybeSingle: () => Promise.resolve(run(filters, usedIn)),
      select: () => Promise.resolve(run(filters, usedIn)),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run(filters, usedIn)).then(resolve, reject),
    };
    return builder;
  };

  return {
    select: () =>
      query((filters) => {
        const found = rows().filter((r) => matches(r, filters));
        return { data: found[0] ? { ...found[0] } : null, error: null };
      }),
    insert: (newRows: Chunk[]) => ({
      select: async () => {
        db.inserts += 1;
        if (db.inserts === db.failInsertOn) return { data: null, error: error(`bad row ${newRows[0]?.content}`) };
        const withIds = newRows.map((r) => ({ ...r, id: `c${++db.nextChunkId}` }));
        db.chunks.push(...withIds);
        return { data: withIds.map((r) => ({ id: r.id })), error: null };
      },
    }),
    delete: () =>
      query((filters, usedIn) => {
        if (usedIn && db.failDeleteByIds) return { error: error("delete by ids failed") };
        db.chunks = db.chunks.filter((r) => !matches(r, filters));
        return { error: null };
      }),
    update: (patch: Partial<Source>) =>
      query((filters) => {
        const changed = db.sources.filter((r) => matches(r, filters));
        for (const r of changed) Object.assign(r, patch);
        if (changed.length > 0) db.afterUpdate?.(patch);
        return { data: changed.map((r) => ({ id: r.id })), error: null };
      }),
  };
}

const fakeSupabase = {
  from: table,
  storage: {
    from: (bucket: string) => ({
      download: async (key: string) => {
        db.downloads.push(`${bucket}/${key}`);
        const bytes = db.files.get(key);
        return bytes
          ? { data: new Blob([bytes.slice()]), error: null }
          : { data: null, error: { name: "StorageApiError", status: 404, message: `Object not found: ${key}` } };
      },
    }),
  },
};

vi.mock("../supabase/service", () => ({ createServiceClient: () => fakeSupabase }));

const embedTexts = vi.fn<(texts: string[]) => Promise<number[][]>>();
vi.mock("../ai", () => ({ embedTexts: (texts: string[]) => embedTexts(texts) }));

const { processSource, CHUNK_INSERT_BATCH } = await import("./process");
const { chunkText } = await import("./chunk");
const { MAX_EXTRACTED_TEXT_CHARS } = await import("./extract");

// ---------------------------------------------------------------------------

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT = "22222222-2222-4222-8222-222222222222";
const SECRET = "the vault code is 4417";

const addSource = (source: Partial<Source> & { id: string }): Source => {
  const row = { project_id: PROJECT, type: "text", storage_key: null, status: "processing", ...source };
  db.sources.push(row);
  return row;
};

const status = (id: string) => db.sources.find((s) => s.id === id)?.status;
const chunksOf = (id: string) => db.chunks.filter((c) => c.source_id === id);

/** A long text with many sentences, enough for several chunks. */
const longText = (sentences: number) =>
  Array.from({ length: sentences }, (_, i) => `Fact ${i}: our shop ${SECRET} sells item ${i} for ${i} euros.`).join(" ");

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  db.sources = [];
  db.chunks = [];
  db.files.clear();
  db.failInsertOn = 0;
  db.inserts = 0;
  db.downloads = [];
  db.nextChunkId = 0;
  db.failDeleteByIds = false;
  db.afterUpdate = undefined;
  embedTexts.mockReset();
  embedTexts.mockImplementation(async (texts) => texts.map((_, i) => [i, 0.5]));
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

/** Every console.error call, as one string, to check that no document text was logged. */
const logged = () => JSON.stringify(consoleError.mock.calls);

describe("processSource: success", () => {
  it("pasted text → chunks with embeddings, source ready", async () => {
    addSource({ id: "s-text" });
    const text = longText(60);

    const result = await processSource({ sourceId: "s-text", projectId: PROJECT, type: "text", text });

    const expected = chunkText(text);
    expect(expected.length).toBeGreaterThan(3);
    expect(result).toEqual({ status: "ready", chunkCount: expected.length });
    expect(status("s-text")).toBe("ready");
    expect(chunksOf("s-text").map((c) => c.content)).toEqual(expected);
    expect(chunksOf("s-text").map((c) => c.embedding)).toEqual(expected.map((_, i) => JSON.stringify([i, 0.5])));
    expect(embedTexts).toHaveBeenCalledTimes(1);
    expect(embedTexts).toHaveBeenCalledWith(expected);
  });

  it("a PDF file → downloaded from the knowledge bucket, extracted, chunked, ready", async () => {
    addSource({ id: "s-pdf", type: "pdf", storage_key: `${PROJECT}/s-pdf.pdf`, status: "processing" });
    db.files.set(`${PROJECT}/s-pdf.pdf`, tinyPdf(["Returns are free within 30 days."]));

    const result = await processSource({
      sourceId: "s-pdf",
      projectId: PROJECT,
      type: "pdf",
      storageKey: `${PROJECT}/s-pdf.pdf`,
    });

    expect(result).toEqual({ status: "ready", chunkCount: 1 });
    expect(db.downloads).toEqual([`knowledge/${PROJECT}/s-pdf.pdf`]);
    expect(chunksOf("s-pdf").map((c) => c.content)).toEqual(["Returns are free within 30 days."]);
    expect(status("s-pdf")).toBe("ready");
  });

  it("a Markdown file → ready", async () => {
    addSource({ id: "s-md", type: "md", storage_key: "k/s-md.md" });
    db.files.set("k/s-md.md", new TextEncoder().encode("# FAQ\n\nWe ship worldwide."));
    const result = await processSource({ sourceId: "s-md", projectId: PROJECT, type: "md", storageKey: "k/s-md.md" });
    expect(result).toEqual({ status: "ready", chunkCount: 1 });
    expect(chunksOf("s-md")[0]?.content).toBe("# FAQ\n\nWe ship worldwide.");
  });

  it("inserts chunks in batches of CHUNK_INSERT_BATCH", async () => {
    addSource({ id: "s-big" });
    const text = longText(1000);
    const count = chunkText(text).length;
    expect(count).toBeGreaterThan(CHUNK_INSERT_BATCH);

    const result = await processSource({ sourceId: "s-big", projectId: PROJECT, type: "text", text });

    expect(result).toEqual({ status: "ready", chunkCount: count });
    expect(db.inserts).toBe(Math.ceil(count / CHUNK_INSERT_BATCH));
    expect(chunksOf("s-big")).toHaveLength(count);
  });

  it("re-running a claimed source replaces its chunks and leaves other sources' chunks alone", async () => {
    addSource({ id: "s-rerun", status: "processing" }); // the route moved it ready → processing
    db.chunks.push(
      { project_id: PROJECT, source_id: "s-rerun", content: "old 1", embedding: "[]" },
      { project_id: PROJECT, source_id: "s-rerun", content: "old 2", embedding: "[]" },
      { project_id: PROJECT, source_id: "s-other", content: "keep me", embedding: "[]" },
    );

    await processSource({ sourceId: "s-rerun", projectId: PROJECT, type: "text", text: "New answer." });

    expect(chunksOf("s-rerun").map((c) => c.content)).toEqual(["New answer."]);
    expect(chunksOf("s-other").map((c) => c.content)).toEqual(["keep me"]);
  });
});

describe("processSource: project_id", () => {
  it("inserts every chunk with the source row's project_id", async () => {
    addSource({ id: "s-proj", project_id: PROJECT });
    await processSource({ sourceId: "s-proj", projectId: PROJECT, type: "text", text: longText(30) });
    expect(chunksOf("s-proj").length).toBeGreaterThan(1);
    expect(new Set(chunksOf("s-proj").map((c) => c.project_id))).toEqual(new Set([PROJECT]));
  });

  it("refuses a source of another project: source_not_found, nothing written, nothing embedded", async () => {
    addSource({ id: "s-theirs", project_id: OTHER_PROJECT, status: "processing" });

    const result = await processSource({ sourceId: "s-theirs", projectId: PROJECT, type: "text", text: "Hi." });

    expect(result).toEqual({ status: "failed", reason: "source_not_found" });
    expect(status("s-theirs")).toBe("processing");
    expect(db.chunks).toEqual([]);
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it("refuses an input whose type or storage key doesn't match the source", async () => {
    addSource({ id: "s-file", type: "pdf", storage_key: "k/a.pdf" });
    const wrongKey = await processSource({ sourceId: "s-file", projectId: PROJECT, type: "pdf", storageKey: "k/b.pdf" });
    const wrongType = await processSource({ sourceId: "s-file", projectId: PROJECT, type: "text", text: "x" });
    expect(wrongKey).toEqual({ status: "failed", reason: "source_not_found" });
    expect(wrongType).toEqual({ status: "failed", reason: "source_not_found" });
    expect(db.downloads).toEqual([]);
    expect(status("s-file")).toBe("processing");
  });
});

describe("processSource: one attempt per source", () => {
  it("refuses a source that isn't processing (not claimed): not_processing, nothing written", async () => {
    for (const state of ["uploading", "ready", "failed"]) {
      addSource({ id: `s-${state}`, status: state });
      db.chunks.push({ id: `old-${state}`, project_id: PROJECT, source_id: `s-${state}`, content: "old", embedding: "[]" });
      const result = await processSource({ sourceId: `s-${state}`, projectId: PROJECT, type: "text", text: "Hi." });
      expect(result, state).toEqual({ status: "failed", reason: "not_processing" });
      expect(status(`s-${state}`), state).toBe(state);
      expect(chunksOf(`s-${state}`).map((c) => c.content), state).toEqual(["old"]);
    }
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it("a stale attempt that fails after a newer one finished leaves the newer chunks and status alone", async () => {
    addSource({ id: "s-race" });
    // While this (older) attempt waits on OpenAI, a newer attempt finishes: ready + its chunks.
    embedTexts.mockImplementation(async () => {
      const source = db.sources.find((s) => s.id === "s-race")!;
      source.status = "ready";
      db.chunks.push({ id: "newer-1", project_id: PROJECT, source_id: "s-race", content: "newer", embedding: "[]" });
      throw new Error("timeout");
    });

    const result = await processSource({ sourceId: "s-race", projectId: PROJECT, type: "text", text: "Old text." });

    expect(result).toEqual({ status: "failed", reason: "embedding_failed" });
    expect(status("s-race")).toBe("ready");
    expect(chunksOf("s-race").map((c) => c.content)).toEqual(["newer"]);
  });

  it("a stale attempt that fails part-way deletes only the chunks it inserted", async () => {
    addSource({ id: "s-race2" });
    db.failInsertOn = 2;
    let calls = 0;
    embedTexts.mockImplementation(async (texts) => texts.map(() => [++calls]));
    const text = longText(1000);
    // After this attempt's first batch, a newer attempt takes over: ready + its own chunk.
    const realFrom = fakeSupabase.from;
    const spy = vi.spyOn(fakeSupabase, "from").mockImplementation((name) => {
      if (name === "knowledge_chunks" && db.inserts === 1 && !db.chunks.some((c) => c.id === "newer-1")) {
        db.sources.find((s) => s.id === "s-race2")!.status = "ready";
        db.chunks.push({ id: "newer-1", project_id: PROJECT, source_id: "s-race2", content: "newer", embedding: "[]" });
      }
      return realFrom(name);
    });

    const result = await processSource({ sourceId: "s-race2", projectId: PROJECT, type: "text", text });
    spy.mockRestore();

    expect(result).toEqual({ status: "failed", reason: "database_failed" });
    expect(status("s-race2")).toBe("ready");
    expect(chunksOf("s-race2").map((c) => c.id)).toEqual(["newer-1"]);
  });

  it("still sets failed (and clears the chunks) when deleting its own chunks fails", async () => {
    addSource({ id: "s-cleanup" });
    db.chunks.push({ id: "old-1", project_id: PROJECT, source_id: "s-cleanup", content: "old", embedding: "[]" });
    db.failInsertOn = 2; // first batch inserted, second fails
    db.failDeleteByIds = true; // and removing that first batch by id fails too

    const result = await processSource({ sourceId: "s-cleanup", projectId: PROJECT, type: "text", text: longText(1000) });

    expect(result).toEqual({ status: "failed", reason: "database_failed" });
    expect(status("s-cleanup")).toBe("failed");
    // Step 2 (all chunks, while still processing) removed what step 1 couldn't.
    expect(chunksOf("s-cleanup")).toEqual([]);
    expect(logged()).toContain("cleanup: delete own chunks failed");
  });

  it("releases the claim (failed) last, so a retry that claims right away keeps its chunks", async () => {
    addSource({ id: "s-retry" });
    db.chunks.push({ id: "old-1", project_id: PROJECT, source_id: "s-retry", content: "old", embedding: "[]" });
    embedTexts.mockRejectedValue(new Error("timeout"));
    let chunksWhenFailed: number | undefined;
    db.afterUpdate = (patch) => {
      if (patch.status !== "failed") return;
      chunksWhenFailed = chunksOf("s-retry").length;
      // A retry claims the source the moment it is failed and writes its chunk.
      db.sources.find((s) => s.id === "s-retry")!.status = "processing";
      db.chunks.push({ id: "retry-1", project_id: PROJECT, source_id: "s-retry", content: "retry", embedding: "[]" });
    };

    const result = await processSource({ sourceId: "s-retry", projectId: PROJECT, type: "text", text: "Hi." });

    expect(result).toEqual({ status: "failed", reason: "embedding_failed" });
    expect(chunksWhenFailed).toBe(0); // all cleanup ran before the claim was released
    expect(chunksOf("s-retry").map((c) => c.id)).toEqual(["retry-1"]);
  });

  it("an attempt whose source stopped processing before it finished removes its own chunks", async () => {
    addSource({ id: "s-late" });
    embedTexts.mockImplementation(async (texts) => {
      db.sources.find((s) => s.id === "s-late")!.status = "failed"; // e.g. another attempt gave up
      return texts.map(() => [1]);
    });

    const result = await processSource({ sourceId: "s-late", projectId: PROJECT, type: "text", text: longText(20) });

    expect(result).toEqual({ status: "failed", reason: "not_processing" });
    expect(status("s-late")).toBe("failed");
    expect(chunksOf("s-late")).toEqual([]);
  });
});

describe("processSource: failure → failed, no chunks left", () => {
  /** Seed a source with old chunks, so a failure must remove them too. */
  const seeded = (source: Partial<Source> & { id: string }) => {
    addSource(source);
    db.chunks.push({ project_id: PROJECT, source_id: source.id, content: "old", embedding: "[]" });
  };

  it("embedding error", async () => {
    seeded({ id: "s-embed" });
    embedTexts.mockRejectedValue(Object.assign(new Error(`OpenAI said no to: ${SECRET}`), { status: 500 }));

    const result = await processSource({ sourceId: "s-embed", projectId: PROJECT, type: "text", text: longText(20) });

    expect(result).toEqual({ status: "failed", reason: "embedding_failed" });
    expect(status("s-embed")).toBe("failed");
    expect(chunksOf("s-embed")).toEqual([]);
  });

  it("a chunk insert fails part-way: the batches already inserted are deleted", async () => {
    seeded({ id: "s-partial" });
    db.failInsertOn = 2;

    const result = await processSource({ sourceId: "s-partial", projectId: PROJECT, type: "text", text: longText(1000) });

    expect(result).toEqual({ status: "failed", reason: "database_failed" });
    expect(db.inserts).toBe(2);
    expect(chunksOf("s-partial")).toEqual([]);
    expect(status("s-partial")).toBe("failed");
  });

  it("text over the cap: text_too_long, nothing embedded", async () => {
    seeded({ id: "s-long" });
    const text = "word ".repeat(MAX_EXTRACTED_TEXT_CHARS / 5 + 1);

    const result = await processSource({ sourceId: "s-long", projectId: PROJECT, type: "text", text });

    expect(result).toEqual({ status: "failed", reason: "text_too_long" });
    expect(embedTexts).not.toHaveBeenCalled();
    expect(chunksOf("s-long")).toEqual([]);
    expect(status("s-long")).toBe("failed");
  });

  it("a PDF whose text is over the cap: text_too_long", async () => {
    seeded({ id: "s-bigpdf", type: "pdf", storage_key: "k/big.pdf" });
    // 60-character lines over ~120 pages: about 1 MB of PDF, over 300,000 characters of text.
    const line = "The quick brown fox jumps over the lazy dog again and again.";
    db.files.set("k/big.pdf", tinyPdf(Array.from({ length: MAX_EXTRACTED_TEXT_CHARS / 55 }, () => line)));

    const result = await processSource({ sourceId: "s-bigpdf", projectId: PROJECT, type: "pdf", storageKey: "k/big.pdf" });

    expect(result).toEqual({ status: "failed", reason: "text_too_long" });
    expect(embedTexts).not.toHaveBeenCalled();
    expect(status("s-bigpdf")).toBe("failed");
  });

  it("file missing from Storage: download_failed", async () => {
    seeded({ id: "s-gone", type: "txt", storage_key: "k/gone.txt" });
    const result = await processSource({ sourceId: "s-gone", projectId: PROJECT, type: "txt", storageKey: "k/gone.txt" });
    expect(result).toEqual({ status: "failed", reason: "download_failed" });
    expect(chunksOf("s-gone")).toEqual([]);
    expect(status("s-gone")).toBe("failed");
  });

  it("broken PDF: unreadable", async () => {
    seeded({ id: "s-broken", type: "pdf", storage_key: "k/broken.pdf" });
    db.files.set("k/broken.pdf", new TextEncoder().encode("%PDF-1.7 garbage"));
    const result = await processSource({
      sourceId: "s-broken",
      projectId: PROJECT,
      type: "pdf",
      storageKey: "k/broken.pdf",
    });
    expect(result).toEqual({ status: "failed", reason: "unreadable" });
    expect(chunksOf("s-broken")).toEqual([]);
  });

  it("PDF with no text layer: no_text", async () => {
    seeded({ id: "s-scan", type: "pdf", storage_key: "k/scan.pdf" });
    db.files.set("k/scan.pdf", tinyPdf([]));
    const result = await processSource({ sourceId: "s-scan", projectId: PROJECT, type: "pdf", storageKey: "k/scan.pdf" });
    expect(result).toEqual({ status: "failed", reason: "no_text" });
    expect(status("s-scan")).toBe("failed");
  });

  it("logs the reason and ids, never the document text", async () => {
    seeded({ id: "s-log" });
    db.failInsertOn = 1; // the fake's error message echoes the row's content
    embedTexts.mockImplementation(async (texts) => texts.map(() => [1]));

    await processSource({ sourceId: "s-log", projectId: PROJECT, type: "text", text: longText(5) });

    expect(consoleError).toHaveBeenCalled();
    expect(logged()).toContain("s-log");
    expect(logged()).toContain("database_failed");
    expect(logged()).not.toContain(SECRET);
    expect(logged()).not.toContain("Fact 0");
  });

  it("never logs OpenAI's error message either", async () => {
    seeded({ id: "s-log2" });
    embedTexts.mockRejectedValue(Object.assign(new Error(`bad input: ${SECRET}`), { status: 400, code: "invalid" }));
    await processSource({ sourceId: "s-log2", projectId: PROJECT, type: "text", text: longText(5) });
    expect(logged()).toContain("embedding_failed");
    expect(logged()).not.toContain(SECRET);
  });
});
