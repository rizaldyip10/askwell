import { describe, expect, it, vi } from "vitest";
import type { OwnerClient } from "../supabase/owner";
import { getOwnedProject } from "./owned-project";
import { fail, fakeClient, ok } from "./test-utils";

vi.mock("server-only", () => ({}));
vi.mock("../supabase/owner", () => ({ createOwnerClient: vi.fn() }));

const ROW = { id: "p1", owner_id: "user_a", name: "S", public_key: "pk_x", messages_used: 0, period_start: "t", created_at: "t" };

describe("getOwnedProject", () => {
  it("reads by id through the owner client, with no owner filter (RLS scopes it)", async () => {
    const fake = fakeClient();
    fake.queue("projects", ok(ROW));
    await expect(getOwnedProject("p1", fake.client as unknown as OwnerClient)).resolves.toEqual(ROW);

    const [calls] = fake.callsTo("projects");
    expect(calls).toContainEqual({ method: "eq", args: ["id", "p1"] });
    expect(calls?.some((c) => c.args[0] === "owner_id")).toBe(false);
  });

  it("returns null when RLS hides it or it doesn't exist", async () => {
    const fake = fakeClient();
    fake.queue("projects", ok(null));
    await expect(getOwnedProject("p2", fake.client as unknown as OwnerClient)).resolves.toBeNull();
  });

  it("throws on a database error", async () => {
    const fake = fakeClient();
    fake.queue("projects", fail("XX000", "boom"));
    await expect(getOwnedProject("p1", fake.client as unknown as OwnerClient)).rejects.toThrow(/boom/);
  });
});
