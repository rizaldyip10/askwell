import { describe, expect, it } from "vitest";
import { WIDGET_CORS_HEADERS, widgetError, widgetJson, widgetPreflight } from "./http";

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
