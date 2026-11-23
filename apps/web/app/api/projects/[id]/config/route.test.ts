import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeClient, fail, ok } from "../../../../../lib/projects/test-utils";
import { createOwnerClient } from "../../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../../lib/supabase/service";
import { PATCH } from "./route";

vi.mock("server-only", () => ({}));
const authMock = vi.fn<() => Promise<{ userId: string | null }>>();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
vi.mock("../../../../../lib/supabase/owner", () => ({ createOwnerClient: vi.fn() }));
vi.mock("../../../../../lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const SAVED_ROW = {
  button_color: "#ff5500",
  position: DEFAULT_WIDGET_CONFIG.position,
  label: DEFAULT_WIDGET_CONFIG.label,
  animation: DEFAULT_WIDGET_CONFIG.animation,
  header_text: DEFAULT_WIDGET_CONFIG.headerText,
  show_badge: false,
};

let owner: ReturnType<typeof fakeClient>;
let service: ReturnType<typeof fakeClient>;

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ userId: "user_a" });
  owner = fakeClient();
  service = fakeClient();
  vi.mocked(createOwnerClient).mockReturnValue(owner.client as unknown as ReturnType<typeof createOwnerClient>);
  vi.mocked(createServiceClient).mockReset().mockReturnValue(service.client as unknown as ReturnType<typeof createServiceClient>);
});

const patch = (id: string, body: unknown) =>
  PATCH(
    new Request(`https://askwell.test/api/projects/${id}/config`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );

/** The project is the owner's (RLS returned it), on `plan`. */
function ownedProjectOn(plan: "free" | "pro") {
  owner.queue("projects", ok({ id: ID }));
  owner.queue("accounts", ok({ plan }));
}

describe("PATCH /api/projects/:id/config", () => {
  it("401 when signed out, before anything else", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await patch(ID, { buttonColor: "#ff5500" });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
    expect(owner.client.from).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("400 for a bad id or body, without touching the database", async () => {
    expect((await patch("not-a-uuid", { buttonColor: "#ff5500" })).status).toBe(400);
    for (const body of [
      {},
      { buttonColor: "red" },
      { position: "middle" },
      { label: "" },
      { buttonColor: "#ff5500", plan: "pro" },
      "not an object",
    ]) {
      const res = await patch(ID, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error.code).toBe("validation_error");
    }
    expect(owner.client.from).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("404 for another owner's (or a missing) project, before the plan or any write", async () => {
    owner.queue("projects", ok(null));
    const res = await patch(ID, { buttonColor: "#ff5500" });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(owner.callsTo("accounts")).toHaveLength(0);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("Free → 402 payment_required, nothing written", async () => {
    ownedProjectOn("free");
    const res = await patch(ID, { buttonColor: "#ff5500" });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: { code: "payment_required", message: expect.any(String) } });
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(service.client.from).not.toHaveBeenCalled();
  });

  it("reads the plan on the server, for the signed-in owner (owner client)", async () => {
    ownedProjectOn("free");
    await patch(ID, { buttonColor: "#ff5500", showBadge: false });
    const [projectCalls] = owner.callsTo("projects");
    expect(projectCalls).toContainEqual({ method: "eq", args: ["id", ID] });
    const [accountCalls] = owner.callsTo("accounts");
    expect(accountCalls).toContainEqual({ method: "eq", args: ["clerk_user_id", "user_a"] });
  });

  it("Pro → writes only the sent fields with the service client and returns the config", async () => {
    ownedProjectOn("pro");
    service.queue("widget_configs", ok(SAVED_ROW));
    const res = await patch(ID, { buttonColor: "#ff5500", showBadge: false });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ config: { ...DEFAULT_WIDGET_CONFIG, buttonColor: "#ff5500", showBadge: false } });
    const [calls] = service.callsTo("widget_configs");
    expect(calls).toContainEqual({ method: "update", args: [{ button_color: "#ff5500", show_badge: false }] });
    expect(calls).toContainEqual({ method: "eq", args: ["project_id", ID] });
  });

  it("Pro → trims text fields before saving", async () => {
    ownedProjectOn("pro");
    service.queue("widget_configs", ok({ ...SAVED_ROW, label: "Help" }));
    await patch(ID, { label: "  Help  " });
    const [calls] = service.callsTo("widget_configs");
    expect(calls).toContainEqual({ method: "update", args: [{ label: "Help" }] });
  });

  it("500 on a database error, with nothing leaked", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    ownedProjectOn("pro");
    service.queue("widget_configs", fail("XX000", "boom"));
    const res = await patch(ID, { buttonColor: "#ff5500" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong" } });
    log.mockRestore();
  });

  it("500 when the ownership query fails, nothing written", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    owner.queue("projects", fail("XX000", "boom"));
    expect((await patch(ID, { buttonColor: "#ff5500" })).status).toBe(500);
    expect(createServiceClient).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
