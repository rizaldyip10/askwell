import { describe, expect, it, vi } from "vitest";
import { saveWidgetConfig } from "./save";

describe("saveWidgetConfig", () => {
  it("PATCHes /api/projects/:id/config with the JSON body", async () => {
    const config = { buttonColor: "#e11d48" };
    const fetchImpl = vi.fn(async () => Response.json({ config }));
    const result = await saveWidgetConfig("p1", { buttonColor: "#e11d48" }, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, data: { config } });
    expect(fetchImpl).toHaveBeenCalledWith("/api/projects/p1/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buttonColor: "#e11d48" }),
    });
  });

  it("returns the server's 402 as a failure", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: { code: "payment_required", message: "Pro only" } }, { status: 402 }),
    );
    expect(await saveWidgetConfig("p1", { label: "x" }, fetchImpl as unknown as typeof fetch)).toEqual({
      ok: false,
      status: 402,
      code: "payment_required",
      message: "Pro only",
    });
  });
});
