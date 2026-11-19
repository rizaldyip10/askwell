import { describe, expect, it } from "vitest";
import { readJsonBody, WIDGET_CORS_HEADERS, widgetError, widgetJson, widgetPreflight } from "./http";

describe("widget http helpers", () => {
  it("widgetJson sends CORS headers and merges extra headers", async () => {
    const res = widgetJson({ ok: true }, { headers: { "Cache-Control": "public, max-age=60" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("widgetError uses the API error shape, never cached", async () => {
    const res = widgetError(404, "not_found", "nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "nope" } });
  });

  it("widgetPreflight is a 204 with every CORS header and no credentials", () => {
    const res = widgetPreflight();
    expect(res.status).toBe(204);
    for (const [name, value] of Object.entries(WIDGET_CORS_HEADERS)) expect(res.headers.get(name)).toBe(value);
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });
});

describe("readJsonBody", () => {
  const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
    new Request("https://askwell.test/x", { method: "POST", body, headers, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);

  /** A streamed body with no Content-Length, sent in chunks. */
  function stream(chunks: string[], onPull?: () => void) {
    const enc = new TextEncoder();
    let i = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        onPull?.();
        if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
        else controller.close();
      },
    });
  }

  it("parses JSON within the limit, counting UTF-8 bytes", async () => {
    expect(await readJsonBody(post(JSON.stringify({ a: "é" })), 100)).toEqual({ ok: true, value: { a: "é" } });
    // 3 × "誕" = 9 bytes in UTF-8, plus 2 quotes: 11 bytes, though only 5 characters.
    expect(await readJsonBody(post(JSON.stringify("誕誕誕")), 10)).toEqual({ ok: false, reason: "too_large" });
    expect(await readJsonBody(post(JSON.stringify("誕誕誕")), 11)).toEqual({ ok: true, value: "誕誕誕" });
  });

  it("rejects invalid JSON and a missing body", async () => {
    expect(await readJsonBody(post("not json"), 100)).toEqual({ ok: false, reason: "invalid_json" });
    expect(await readJsonBody(post(null), 100)).toEqual({ ok: false, reason: "invalid_json" });
  });

  it("rejects early on a Content-Length over the limit", async () => {
    const req = post(stream(["{}"]), { "content-length": "101" });
    expect(await readJsonBody(req, 100)).toEqual({ ok: false, reason: "too_large" });
    expect(req.bodyUsed).toBe(false); // never read (the stream pre-pulls once on its own)
  });

  it("stops reading a streamed body (no Content-Length) once it passes the limit", async () => {
    let pulls = 0;
    const chunks = Array.from({ length: 1000 }, () => "x".repeat(50));
    const req = post(stream(chunks, () => pulls++));
    expect(await readJsonBody(req, 120)).toEqual({ ok: false, reason: "too_large" });
    expect(pulls).toBeLessThan(10);
  });

  it("doesn't trust a Content-Length that understates the body", async () => {
    const req = post(stream(["x".repeat(80), "x".repeat(80)]), { "content-length": "10" });
    expect(await readJsonBody(req, 100)).toEqual({ ok: false, reason: "too_large" });
  });
});
