import { DEFAULT_WIDGET_CONFIG, PLAN_LIMITS, type Plan } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAccount } from "../../../lib/accounts/ensure-account";
import { fakeClient, fail, ok, type QueryResult } from "../../../lib/projects/test-utils";
import { createOwnerClient } from "../../../lib/supabase/owner";
import { createServiceClient } from "../../../lib/supabase/service";
import { GET, POST } from "./route";

vi.mock("server-only", () => ({}));
const authMock = vi.fn<() => Promise<{ userId: string | null }>>();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
vi.mock("../../../lib/supabase/owner", () => ({ createOwnerClient: vi.fn() }));
vi.mock("../../../lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("../../../lib/accounts/ensure-account", () => ({ ensureAccount: vi.fn() }));

const USER = "user_owner";
const row = (n: number, key = `pk_${String(n).padStart(32, "0")}`) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  owner_id: USER,
  name: `Site ${n}`,
  public_key: key,
  messages_used: 0,
  period_start: "2026-11-19T00:00:00Z",
  created_at: "2026-11-19T00:00:00Z",
});

let owner: ReturnType<typeof fakeClient>;
let service: ReturnType<typeof fakeClient>;

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ userId: USER });
  vi.mocked(ensureAccount).mockReset().mockResolvedValue(undefined);
  owner = fakeClient();
  service = fakeClient();
  vi.mocked(createOwnerClient).mockReturnValue(owner.client as unknown as ReturnType<typeof createOwnerClient>);
  vi.mocked(createServiceClient).mockReturnValue(service.client as unknown as ReturnType<typeof createServiceClient>);
});

const post = (body: unknown) =>
  POST(new Request("https://askwell.test/api/projects", { method: "POST", body: JSON.stringify(body) }));

/** create_project as the database runs it: refuses once the owner has p_max_projects. */
function emulateCreateProject(existing = 0) {
  let count = existing;
  const keys: string[] = [];
  service.client.rpc.mockImplementation(((_fn: string, args: Record<string, unknown>) => {
    keys.push(String(args.p_public_key));
    const result: QueryResult =
      count >= Number(args.p_max_projects) ? fail("P0001", "plan_limit") : ok(row(++count, String(args.p_public_key)));
    return { single: () => Promise.resolve(result) };
  }) as never);
  return { keys };
}

describe("GET /api/projects", () => {
  it("401 when signed out, without touching the database", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
    expect(createOwnerClient).not.toHaveBeenCalled();
  });

  it("lists through the owner client, newest first, with no owner filter", async () => {
    owner.queue("projects", ok([row(2), row(1)]));
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects.map((p: { name: string }) => p.name)).toEqual(["Site 2", "Site 1"]);
    expect(body.projects[0]).not.toHaveProperty("ownerId");
    const [calls] = owner.callsTo("projects");
    expect(calls).toContainEqual({ method: "order", args: ["created_at", { ascending: false }] });
    expect(calls?.some((c) => c.args[0] === "owner_id")).toBe(false);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("500 internal on a database error, without details", async () => {
    owner.queue("projects", fail("XX000", "secret detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret detail/);
    log.mockRestore();
  });
});

describe("POST /api/projects", () => {
  it("401 when signed out", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await post({ name: "Site" });
    expect(res.status).toBe(401);
    expect(ensureAccount).not.toHaveBeenCalled();
  });

  it("400 validation_error for a bad body", async () => {
    for (const body of [{}, { name: "" }, { name: "   " }, { name: "x".repeat(61) }, { name: "ok", extra: 1 }, "nope"]) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error.code).toBe("validation_error");
    }
    const malformed = await POST(new Request("https://askwell.test/api/projects", { method: "POST", body: "{" }));
    expect(malformed.status).toBe(400);
    expect(service.client.rpc).not.toHaveBeenCalled();
  });

  it("201: ensures the account, reads the plan via the owner client, calls create_project with PLAN_LIMITS and the defaults", async () => {
    owner.queue("accounts", ok({ plan: "free" }));
    const { keys } = emulateCreateProject();
    const res = await post({ name: "  My site  " });

    expect(res.status).toBe(201);
    const { project } = await res.json();
    expect(project.publicKey).toMatch(/^pk_[0-9A-Za-z]{32}$/);
    expect(project.publicKey).toBe(keys[0]);
    expect(ensureAccount).toHaveBeenCalledWith(USER);
    expect(owner.callsTo("accounts")[0]).toContainEqual({ method: "eq", args: ["clerk_user_id", USER] });
    expect(service.client.rpc).toHaveBeenCalledWith("create_project", {
      p_owner_id: USER,
      p_name: "My site",
      p_public_key: keys[0],
      p_max_projects: PLAN_LIMITS.free.projects,
      p_button_color: DEFAULT_WIDGET_CONFIG.buttonColor,
      p_position: DEFAULT_WIDGET_CONFIG.position,
      p_label: DEFAULT_WIDGET_CONFIG.label,
      p_animation: DEFAULT_WIDGET_CONFIG.animation,
      p_header_text: DEFAULT_WIDGET_CONFIG.headerText,
      p_show_badge: DEFAULT_WIDGET_CONFIG.showBadge,
    });
  });

  it("Free: the second create is 403 plan_limit with an upgrade message", async () => {
    emulateCreateProject();
    owner.queue("accounts", ok({ plan: "free" }), ok({ plan: "free" }));

    expect((await post({ name: "One" })).status).toBe(201);
    const res = await post({ name: "Two" });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("plan_limit");
    expect(body.error.message).toMatch(/upgrade/i);
  });

  it("Pro: allows up to 5, then 403 plan_limit", async () => {
    emulateCreateProject();
    const max = PLAN_LIMITS.pro.projects;
    owner.queue("accounts", ...Array.from({ length: max + 1 }, () => ok({ plan: "pro" as Plan })));

    for (let i = 1; i <= max; i++) expect((await post({ name: `Site ${i}` })).status, `create ${i}`).toBe(201);
    const res = await post({ name: "One too many" });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("plan_limit");
  });

  it("an unknown or missing plan gets the Free limit", async () => {
    owner.queue("accounts", ok({ plan: "enterprise" }), ok(null));
    emulateCreateProject();
    await post({ name: "a" });
    await post({ name: "b" });
    const limits = service.client.rpc.mock.calls.map((c) => (c[1] as { p_max_projects: number }).p_max_projects);
    expect(limits).toEqual([PLAN_LIMITS.free.projects, PLAN_LIMITS.free.projects]);
  });

  it("retries once with a new key when the public key clashes", async () => {
    owner.queue("accounts", ok({ plan: "free" }));
    service.queue("rpc:create_project", fail("23505", "duplicate key value"), ok(row(1)));
    const res = await post({ name: "Site" });

    expect(res.status).toBe(201);
    const [first, second] = service.client.rpc.mock.calls.map((c) => (c[1] as { p_public_key: string }).p_public_key);
    expect(first).not.toBe(second);
  });

  it("500 when the key clashes twice (no third try)", async () => {
    owner.queue("accounts", ok({ plan: "free" }));
    service.queue("rpc:create_project", fail("23505", "dup"), fail("23505", "dup"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ name: "Site" });
    expect(res.status).toBe(500);
    expect(service.client.rpc).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it("500 internal for account_not_found, other errors, or a failed ensureAccount", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    owner.queue("accounts", ok({ plan: "free" }), ok({ plan: "free" }));
    service.queue("rpc:create_project", fail("P0002", "account_not_found"), fail("P0001", "some other raise"));
    for (let i = 0; i < 2; i++) {
      const res = await post({ name: "Site" });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong" } });
    }

    vi.mocked(ensureAccount).mockRejectedValueOnce(new Error("db down"));
    expect((await post({ name: "Site" })).status).toBe(500);
    log.mockRestore();
  });
});
