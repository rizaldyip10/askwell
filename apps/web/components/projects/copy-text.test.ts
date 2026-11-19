import { describe, expect, it, vi } from "vitest";
import { copyText } from "./copy-text";

function fakeDocument(execResult: boolean | "throw") {
  const textarea = {
    value: "",
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    select: vi.fn(),
    remove: vi.fn(),
  };
  const focused = { focus: vi.fn() };
  const doc = {
    body: { appendChild: vi.fn() },
    activeElement: focused,
    createElement: vi.fn(() => textarea),
    execCommand: vi.fn(() => {
      if (execResult === "throw") throw new Error("nope");
      return execResult;
    }),
  };
  return { doc: doc as unknown as Document, textarea, focused };
}

describe("copyText", () => {
  it("uses the Clipboard API when it works", async () => {
    const writeText = vi.fn(async () => {});
    const { doc } = fakeDocument(true);
    expect(await copyText("hello", { clipboard: { writeText }, document: doc })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(doc.execCommand).not.toHaveBeenCalled();
  });

  it("falls back to execCommand when the Clipboard API is blocked, and cleans up", async () => {
    const writeText = vi.fn(async () => {
      throw new DOMException("blocked", "NotAllowedError");
    });
    const { doc, textarea, focused } = fakeDocument(true);
    expect(await copyText("<script></script>", { clipboard: { writeText }, document: doc })).toBe("copied");
    expect(textarea.value).toBe("<script></script>");
    expect(textarea.select).toHaveBeenCalled();
    expect(doc.execCommand).toHaveBeenCalledWith("copy");
    expect(textarea.remove).toHaveBeenCalled();
    expect(focused.focus).toHaveBeenCalled();
  });

  it("falls back when there's no Clipboard API at all", async () => {
    const { doc } = fakeDocument(true);
    expect(await copyText("x", { clipboard: undefined, document: doc })).toBe("copied");
  });

  it("reports failed when every way is blocked, without throwing", async () => {
    const blocked = { writeText: vi.fn(async () => Promise.reject(new Error("no"))) };
    expect(await copyText("x", { clipboard: blocked, document: fakeDocument(false).doc })).toBe("failed");
    const thrown = fakeDocument("throw");
    expect(await copyText("x", { clipboard: blocked, document: thrown.doc })).toBe("failed");
    expect(thrown.textarea.remove).toHaveBeenCalled();
    expect(await copyText("x", { clipboard: undefined, document: undefined })).toBe("failed");
  });
});
