import { beforeEach, describe, expect, it } from "vitest";
import { getVisitorId, resetVisitorIdMemory, VISITOR_ID_STORAGE_KEY } from "./visitor-id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

const throwing = (): Storage => {
  throw new DOMException("blocked", "SecurityError");
};

beforeEach(() => resetVisitorIdMemory());

describe("getVisitorId", () => {
  it("creates a UUID and stores it", () => {
    const storage = memoryStorage();
    const id = getVisitorId(() => storage);
    expect(id).toMatch(UUID);
    expect(storage.getItem(VISITOR_ID_STORAGE_KEY)).toBe(id);
  });

  it("reuses the stored ID on a new page load", () => {
    const stored = crypto.randomUUID();
    const storage = memoryStorage({ [VISITOR_ID_STORAGE_KEY]: stored });
    expect(getVisitorId(() => storage)).toBe(stored);
    resetVisitorIdMemory();
    expect(getVisitorId(() => storage)).toBe(stored);
  });

  it("stays stable when storage starts throwing mid-session", () => {
    const storage = memoryStorage({ [VISITOR_ID_STORAGE_KEY]: crypto.randomUUID() });
    const id = getVisitorId(() => storage);
    expect(getVisitorId(throwing)).toBe(id);
  });

  it("stays stable when storage becomes available mid-session", () => {
    const id = getVisitorId(throwing);
    const other = memoryStorage({ [VISITOR_ID_STORAGE_KEY]: crypto.randomUUID() });
    expect(getVisitorId(() => other)).toBe(id);
  });

  it("replaces a stored value that isn't a UUID", () => {
    const storage = memoryStorage({ [VISITOR_ID_STORAGE_KEY]: "<script>" });
    const id = getVisitorId(() => storage);
    expect(id).toMatch(UUID);
    expect(storage.getItem(VISITOR_ID_STORAGE_KEY)).toBe(id);
  });

  it("falls back to one in-memory ID when storage throws", () => {
    const id = getVisitorId(throwing);
    expect(id).toMatch(UUID);
    expect(getVisitorId(throwing)).toBe(id);
  });

  it("falls back when setItem throws", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    const id = getVisitorId(() => storage);
    expect(id).toMatch(UUID);
    expect(getVisitorId(() => storage)).toBe(id);
  });
});
