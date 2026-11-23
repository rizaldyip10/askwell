import { PLAN_LIMITS } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, fakeClient, ok } from "../projects/test-utils";
import type { OwnerClient } from "../supabase/owner";
import { getUsage } from "./get-usage";

vi.mock("server-only", () => ({}));
vi.mock("../supabase/owner", () => ({ createOwnerClient: vi.fn() }));

const USER = "user_owner";
const row = (project_id: string, messages_used: number) => ({
  project_id,
  messages_used,
  period_start: "2026-11-01T00:00:00+00:00",
  period_end: "2026-12-01T00:00:00+00:00",
});

let fake: ReturnType<typeof fakeClient>;
const run = () => getUsage(USER, fake.client as unknown as OwnerClient);

beforeEach(() => {
  fake = fakeClient();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getUsage", () => {
  it("one owner_activity() call for every project, with the Free limit from PLAN_LIMITS", async () => {
    fake.queue("accounts", ok({ plan: "free" }));
    fake.queue("rpc:owner_activity", ok([row("p1", 42), row("p2", 0)]));

    expect(await run()).toEqual({
      plan: "free",
      projects: {
        p1: { projectId: "p1", used: 42, limit: PLAN_LIMITS.free.messagesPerMonth, periodStart: row("p1", 0).period_start, periodEnd: row("p1", 0).period_end },
        p2: { projectId: "p2", used: 0, limit: PLAN_LIMITS.free.messagesPerMonth, periodStart: row("p2", 0).period_start, periodEnd: row("p2", 0).period_end },
      },
    });
    expect(fake.client.rpc).toHaveBeenCalledTimes(1);
    expect(fake.client.rpc.mock.calls[0]?.[0]).toBe("owner_activity");
    // No per-project reads: projects.messages_used can be stale (lazy reset).
    expect(fake.callsTo("projects")).toEqual([]);
  });

  it("uses the Pro limit for a Pro owner", async () => {
    fake.queue("accounts", ok({ plan: "pro" }));
    fake.queue("rpc:owner_activity", ok([row("p1", 5)]));
    const usage = await run();
    expect(usage?.plan).toBe("pro");
    expect(usage?.projects.p1?.limit).toBe(PLAN_LIMITS.pro.messagesPerMonth);
  });

  it("a stale period: shows owner_activity's 0, not the stored count", async () => {
    // owner_activity returns 0 for an ended period (pglite-tested in packages/db); the
    // stored projects.messages_used (say 97) is never read.
    fake.queue("accounts", ok({ plan: "free" }));
    fake.queue("rpc:owner_activity", ok([{ ...row("p1", 0), period_start: "2026-11-05T00:00:00+00:00", period_end: "2026-12-05T00:00:00+00:00" }]));
    const usage = await run();
    expect(usage?.projects.p1).toMatchObject({ used: 0, periodEnd: "2026-12-05T00:00:00+00:00" });
  });

  it("reads the plan on the server; no account row → the Free limit", async () => {
    fake.queue("accounts", ok(null));
    fake.queue("rpc:owner_activity", ok([row("p1", 1)]));
    const usage = await run();
    expect(usage?.plan).toBe("free");
    const [accounts] = fake.callsTo("accounts");
    expect(accounts).toContainEqual({ method: "eq", args: ["clerk_user_id", USER] });
  });

  it("returns null (logged) when owner_activity fails", async () => {
    fake.queue("accounts", ok({ plan: "free" }));
    fake.queue("rpc:owner_activity", fail("42501", "permission denied"));
    expect(await run()).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("returns null when the plan can't be read", async () => {
    fake.queue("accounts", fail("XX000", "down"));
    fake.queue("rpc:owner_activity", ok([]));
    expect(await run()).toBeNull();
  });
});
