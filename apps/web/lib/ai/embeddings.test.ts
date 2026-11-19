import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const create = vi.fn();
vi.mock("./client", () => ({ getOpenAI: () => ({ embeddings: { create } }) }));

const { EMBEDDING_MODEL, MAX_CHARS_PER_REQUEST, MAX_INPUTS_PER_REQUEST, batchTexts, embedText, embedTexts } =
  await import("./embeddings");

/** Fake vector whose first value is the text's id (`t<id>`), so order is checkable. Returned reversed. */
function fakeResponse({ input }: { input: string[] }) {
  const data = input.map((text, index) => ({ object: "embedding", index, embedding: [Number(text.slice(1)), index] }));
  return Promise.resolve({ data: data.reverse() });
}

beforeEach(() => {
  create.mockReset();
  create.mockImplementation(fakeResponse);
});

describe("batchTexts", () => {
  it("splits at the input-count limit, in order", () => {
    const texts = Array.from({ length: MAX_INPUTS_PER_REQUEST * 2 + 5 }, (_, i) => `t${i}`);
    const batches = batchTexts(texts);
    expect(batches.map((b) => b.length)).toEqual([MAX_INPUTS_PER_REQUEST, MAX_INPUTS_PER_REQUEST, 5]);
    expect(batches.flat()).toEqual(texts);
  });

  it("splits at the character budget, and an oversized text goes alone", () => {
    const half = "a".repeat(MAX_CHARS_PER_REQUEST / 2);
    const huge = "b".repeat(MAX_CHARS_PER_REQUEST + 1);
    const batches = batchTexts([half, half, "x", huge, "y"]);
    expect(batches).toEqual([[half, half], ["x"], [huge], ["y"]]);
  });

  it("returns no batches for no texts", () => {
    expect(batchTexts([])).toEqual([]);
  });
});

describe("embedTexts", () => {
  it("uses text-embedding-3-small and keeps input order across batches", async () => {
    const texts = Array.from({ length: MAX_INPUTS_PER_REQUEST + 3 }, (_, i) => `t${i}`);
    const vectors = await embedTexts(texts);

    expect(create).toHaveBeenCalledTimes(2);
    for (const [params] of create.mock.calls) expect(params.model).toBe(EMBEDDING_MODEL);
    expect(EMBEDDING_MODEL).toBe("text-embedding-3-small");
    expect(vectors.map((v) => v[0])).toEqual(texts.map((_, i) => i));
  });

  it("makes no request for no texts", async () => {
    expect(await embedTexts([])).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it("throws when the API returns the wrong number of vectors", async () => {
    create.mockResolvedValue({ data: [] });
    await expect(embedTexts(["a"])).rejects.toThrow(/expected 1/);
  });

  it("embedText returns one vector", async () => {
    expect(await embedText("t7")).toEqual([7, 0]);
  });
});
