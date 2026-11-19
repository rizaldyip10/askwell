import { describe, expect, it, vi } from "vitest";
import {
  GENERIC_ERROR,
  NETWORK_ERROR,
  SIGNED_OUT_ERROR,
  requestJson,
  toApiFailure,
  validateProjectName,
} from "./api";

describe("toApiFailure", () => {
  it("keeps the API's code and message", () => {
    expect(toApiFailure(403, { error: { code: "plan_limit", message: "Your plan allows 1 project. Upgrade to add more." } })).toEqual({
      ok: false,
      status: 403,
      code: "plan_limit",
      message: "Your plan allows 1 project. Upgrade to add more.",
    });
  });

  it("401 always says the session ended", () => {
    expect(toApiFailure(401, { error: { code: "unauthorized", message: "Sign in required." } })).toMatchObject({
      code: "unauthorized",
      message: SIGNED_OUT_ERROR,
    });
    expect(toApiFailure(401, "<html>")).toMatchObject({ code: "unauthorized" });
  });

  it("falls back to a generic message for unknown or malformed bodies", () => {
    expect(toApiFailure(500, "<html>")).toEqual({ ok: false, status: 500, code: "internal", message: GENERIC_ERROR });
    expect(toApiFailure(404, null)).toMatchObject({ code: "not_found", message: GENERIC_ERROR });
    expect(toApiFailure(500, { error: { code: "made_up", message: "x" } })).toMatchObject({ code: "internal" });
    expect(toApiFailure(400, { error: { code: "validation_error", message: "" } })).toMatchObject({
      code: "validation_error",
      message: GENERIC_ERROR,
    });
  });
});

describe("requestJson", () => {
  it("sends JSON and returns the data on success", async () => {
    const fetchMock = vi.fn(async () => Response.json({ project: { id: "p1" } }, { status: 201 }));
    const result = await requestJson("POST", "/api/projects", { name: "Site" }, fetchMock as typeof fetch);

    expect(result).toEqual({ ok: true, data: { project: { id: "p1" } } });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"name":"Site"}',
    });
  });

  it("sends no body or content type without a body", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    await requestJson("DELETE", "/api/projects/p1", undefined, fetchMock as typeof fetch);
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1", { method: "DELETE", headers: undefined, body: undefined });
  });

  it("maps an error response", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: { code: "plan_limit", message: "Upgrade" } }, { status: 403 }),
    );
    expect(await requestJson("POST", "/api/projects", {}, fetchMock as typeof fetch)).toMatchObject({
      ok: false,
      code: "plan_limit",
      message: "Upgrade",
    });
  });

  it("never throws: network failure and non-JSON bodies become failures", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await requestJson("GET", "/x", undefined, offline as typeof fetch)).toMatchObject({
      ok: false,
      status: 0,
      message: NETWORK_ERROR,
    });

    const html = vi.fn(async () => new Response("<html>", { status: 502 }));
    expect(await requestJson("GET", "/x", undefined, html as typeof fetch)).toMatchObject({ ok: false, status: 502, code: "internal" });
  });

  it("a 2xx with an unreadable body is a failure, not a success", async () => {
    const html200 = vi.fn(async () => new Response("<html>login page</html>", { status: 200 }));
    expect(await requestJson("POST", "/api/projects", { name: "x" }, html200 as typeof fetch)).toEqual({
      ok: false,
      status: 200,
      code: "internal",
      message: GENERIC_ERROR,
    });
  });
});

describe("validateProjectName", () => {
  it("trims a valid name", () => {
    expect(validateProjectName("  My site ")).toEqual({ ok: true, name: "My site" });
  });

  it("rejects empty and too-long names with a readable message", () => {
    expect(validateProjectName("   ")).toEqual({ ok: false, message: "Enter a name." });
    expect(validateProjectName("x".repeat(61))).toEqual({ ok: false, message: "Use at most 60 characters." });
    expect(validateProjectName("x".repeat(60))).toMatchObject({ ok: true });
  });
});
