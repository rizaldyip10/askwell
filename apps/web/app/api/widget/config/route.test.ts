import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { protectWidgetConfig } from "../../../../lib/security";
import { getWidgetConfigByKey } from "../../../../lib/widget/config";
import { GET, OPTIONS } from "./route";

vi.mock("../../../../lib/widget/config", () => ({ getWidgetConfigByKey: vi.fn() }));
vi.mock("../../../../lib/security", () => ({ protectWidgetConfig: vi.fn() }));

const KEY = "pk_a1b2c3d4e5f6a7b8c9d0e1f2";
const lookup = vi.mocked(getWidgetConfigByKey);
const protect = vi.mocked(protectWidgetConfig);

const get = (query: string) => GET(new NextRequest(`https://askwell.test/api/widget/config${query}`));

function expectCors(res: Response) {
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(res.headers.get("access-control-allow-credentials")).toBeNull();
}

beforeEach(() => {
  lookup.mockReset();
  protect.mockReset();
  protect.mockResolvedValue({ allowed: true });
});

describe("GET /api/widget/config", () => {
  it("200 with only the plan-applied config, cacheable, with CORS", async () => {
    lookup.mockResolvedValue({ ...DEFAULT_WIDGET_CONFIG });
    const res = await get(`?key=${KEY}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ config: DEFAULT_WIDGET_CONFIG });
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(lookup).toHaveBeenCalledWith(KEY);
    expectCors(res);
  });

  it("400 validation_error for a bad or missing key, without a lookup", async () => {
    for (const query of ["?key=bad", "", "?key="]) {
      const res = await get(query);
      expect(res.status, query).toBe(400);
      expect((await res.json()).error.code).toBe("validation_error");
      expectCors(res);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("404 not_found for an unknown key, not cached", async () => {
    lookup.mockResolvedValue(null);
    const res = await get("?key=pk_doesnotexist000000");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: expect.any(String) } });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expectCors(res);
  });

  it("429 rate_limited when Arcjet blocks, with CORS, without a lookup", async () => {
    protect.mockResolvedValue({ allowed: false, reason: "rate_limit" });
    const res = await get(`?key=${KEY}`);

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: { code: "rate_limited", message: expect.any(String) } });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(protect).toHaveBeenCalledWith(expect.any(Request), { publicKey: KEY });
    expect(lookup).not.toHaveBeenCalled();
    expectCors(res);
  });

  it("500 internal when the lookup fails, without leaking the error", async () => {
    lookup.mockRejectedValue(new Error("db password is hunter2"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get(`?key=${KEY}`);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("internal");
    expect(JSON.stringify(body)).not.toMatch(/hunter2/);
    expectCors(res);
    log.mockRestore();
  });
});

describe("OPTIONS /api/widget/config", () => {
  it("204 with the CORS preflight headers", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expectCors(res);
    expect(res.headers.get("access-control-allow-methods")).toMatch(/GET/);
  });
});
