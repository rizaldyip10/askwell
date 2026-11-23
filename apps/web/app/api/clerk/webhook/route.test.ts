import { ClerkAPIResponseError } from "@clerk/nextjs/errors";
import { createHmac, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { trackSignedUp, trackUpgraded } from "../../../../lib/analytics/owner-events";
import { createServiceClient } from "../../../../lib/supabase/service";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
const getSubscription = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ billing: { getUserBillingSubscription: getSubscription } }),
}));
vi.mock("../../../../lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("../../../../lib/analytics/owner-events", () => ({ trackUpgraded: vi.fn(), trackSignedUp: vi.fn() }));

// A real Svix signature (what Clerk sends), checked by the real verifyWebhook.
const KEY = randomBytes(24);
const previousSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
process.env.CLERK_WEBHOOK_SIGNING_SECRET = `whsec_${KEY.toString("base64")}`;
afterAll(() => {
  process.env.CLERK_WEBHOOK_SIGNING_SECRET = previousSecret;
});

const USER = "user_payer";
const URL = "https://askwell.test/api/clerk/webhook";
let msg = 0;

function signed(event: unknown, { tamper = false, id = `msg_${++msg}` } = {}) {
  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", KEY).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new NextRequest(URL, {
    method: "POST",
    headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}`, "content-type": "application/json" },
    body: tamper ? body.replace(USER, "user_attacker") : body,
  });
}

const itemEvent = (type: string, slug = "pro", payer: Record<string, string> = { user_id: USER }) => ({
  type,
  object: "event",
  data: { object: "commerce_subscription_item", id: "csi_1", status: "active", plan: { slug }, payer },
});

const DAY = 86_400_000;
const proItem = (status: string, over: Record<string, unknown> = {}) => ({
  status,
  plan: { slug: "pro" },
  periodEnd: Date.now() + 20 * DAY,
  endedAt: null,
  ...over,
});
const subscription = (...items: unknown[]) => ({ subscriptionItems: items });
const notFound = () => new ClerkAPIResponseError("Not found", { data: [], status: 404 });

/** An in-memory `accounts` table that behaves like the two queries the webhook runs. */
function fakeAccounts(initial: Record<string, "free" | "pro"> = {}) {
  const rows = new Map(Object.entries(initial));
  const writes: string[] = [];
  const client = {
    from(table: string) {
      expect(table).toBe("accounts");
      return {
        upsert(row: { clerk_user_id: string; plan: "free" | "pro" }, opts: { ignoreDuplicates?: boolean }) {
          expect(opts.ignoreDuplicates).toBe(true);
          return {
            select: async () => {
              if (rows.has(row.clerk_user_id)) return { data: [], error: null };
              rows.set(row.clerk_user_id, row.plan);
              writes.push(`insert ${row.clerk_user_id} ${row.plan}`);
              return { data: [{ clerk_user_id: row.clerk_user_id }], error: null };
            },
          };
        },
        update({ plan }: { plan: "free" | "pro" }) {
          const filter: Record<string, string> = {};
          const chain = {
            eq: (col: string, value: string) => ((filter[`eq:${col}`] = value), chain),
            neq: (col: string, value: string) => ((filter[`neq:${col}`] = value), chain),
            select: async () => {
              const id = filter["eq:clerk_user_id"]!;
              expect(filter["neq:plan"]).toBe(plan);
              if (!rows.has(id) || rows.get(id) === plan) return { data: [], error: null };
              rows.set(id, plan);
              writes.push(`update ${id} ${plan}`);
              return { data: [{ plan }], error: null };
            },
          };
          return chain;
        },
      };
    },
  };
  vi.mocked(createServiceClient).mockReturnValue(client as never);
  return { rows, writes };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSubscription.mockReset();
});

describe("POST /api/clerk/webhook", () => {
  it("bad or missing signature → 400, nothing read or written", async () => {
    const db = fakeAccounts();
    const tampered = await POST(signed(itemEvent("subscriptionItem.active"), { tamper: true }));
    expect(tampered.status).toBe(400);
    const unsigned = await POST(new NextRequest(URL, { method: "POST", body: JSON.stringify(itemEvent("subscriptionItem.active")) }));
    expect(unsigned.status).toBe(400);
    expect(await unsigned.json()).toEqual({ error: { code: "validation_error", message: "Webhook signature verification failed." } });
    expect(getSubscription).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  it("pro active → plan pro and `upgraded` once; a replay changes nothing", async () => {
    const db = fakeAccounts({ [USER]: "free" });
    getSubscription.mockResolvedValue(subscription(proItem("active")));

    const first = await POST(signed(itemEvent("subscriptionItem.active"), { id: "msg_same" }));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, plan: "pro", changed: true });
    expect(getSubscription).toHaveBeenCalledWith(USER);
    expect(db.rows.get(USER)).toBe("pro");
    expect(trackUpgraded).toHaveBeenCalledTimes(1);
    expect(trackUpgraded).toHaveBeenCalledWith(USER);

    const replay = await POST(signed(itemEvent("subscriptionItem.active"), { id: "msg_same" }));
    expect(await replay.json()).toEqual({ received: true, plan: "pro", changed: false });
    expect(trackUpgraded).toHaveBeenCalledTimes(1);
    expect(db.writes).toEqual([`update ${USER} pro`]);
  });

  it("creates the account row when the webhook beats the first dashboard visit", async () => {
    const db = fakeAccounts();
    getSubscription.mockResolvedValue(subscription(proItem("active")));
    const res = await POST(signed(itemEvent("subscriptionItem.active")));
    expect(res.status).toBe(200);
    expect(db.writes).toEqual([`insert ${USER} free`, `update ${USER} pro`]);
    expect(trackSignedUp).toHaveBeenCalledWith(USER);
    expect(trackUpgraded).toHaveBeenCalledTimes(1);
  });

  it("canceled but not ended → stays pro, no new `upgraded`", async () => {
    const db = fakeAccounts({ [USER]: "pro" });
    getSubscription.mockResolvedValue(subscription(proItem("canceled")));
    const res = await POST(signed(itemEvent("subscriptionItem.canceled")));
    expect(await res.json()).toEqual({ received: true, plan: "pro", changed: false });
    expect(db.rows.get(USER)).toBe("pro");
    expect(trackUpgraded).not.toHaveBeenCalled();
  });

  it("ended → free", async () => {
    const db = fakeAccounts({ [USER]: "pro" });
    getSubscription.mockResolvedValue(subscription(proItem("ended", { endedAt: Date.now() - DAY })));
    const res = await POST(signed(itemEvent("subscriptionItem.ended")));
    expect(await res.json()).toEqual({ received: true, plan: "free", changed: true });
    expect(db.rows.get(USER)).toBe("free");
    expect(trackUpgraded).not.toHaveBeenCalled();
  });

  it("a late `active` after the item ended follows Clerk's current state (free), not the payload", async () => {
    const db = fakeAccounts({ [USER]: "free" });
    getSubscription.mockResolvedValue(subscription(proItem("ended", { endedAt: Date.now() - DAY })));
    const res = await POST(signed(itemEvent("subscriptionItem.active")));
    expect(await res.json()).toEqual({ received: true, plan: "free", changed: false });
    expect(db.rows.get(USER)).toBe("free");
    expect(trackUpgraded).not.toHaveBeenCalled();
  });

  it("no subscription in Clerk (404) → free", async () => {
    const db = fakeAccounts({ [USER]: "pro" });
    getSubscription.mockRejectedValue(notFound());
    const res = await POST(signed(itemEvent("subscriptionItem.ended")));
    expect(await res.json()).toEqual({ received: true, plan: "free", changed: true });
    expect(db.rows.get(USER)).toBe("free");
  });

  it.each([
    ["another plan", itemEvent("subscriptionItem.active", "team")],
    ["the free plan", itemEvent("subscriptionItem.active", "free")],
    ["an org payer", itemEvent("subscriptionItem.active", "pro", { organization_id: "org_1" })],
    ["a non-billing event", { type: "user.created", object: "event", data: { id: USER } }],
  ])("%s → 200, ignored, nothing read or written", async (_label, event) => {
    const db = fakeAccounts({ [USER]: "free" });
    const res = await POST(signed(event));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, ignored: true });
    expect(getSubscription).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });

  it("Clerk API error → 500 (Svix retries), nothing written", async () => {
    const db = fakeAccounts({ [USER]: "free" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    getSubscription.mockRejectedValue(new ClerkAPIResponseError("Boom", { data: [], status: 503 }));
    const res = await POST(signed(itemEvent("subscriptionItem.active")));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
    expect(trackUpgraded).not.toHaveBeenCalled();
  });

  it("database error → 500, no `upgraded`", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getSubscription.mockResolvedValue(subscription(proItem("active")));
    const failing = {
      from: () => ({
        upsert: () => ({ select: async () => ({ data: null, error: { message: "down" } }) }),
      }),
    };
    vi.mocked(createServiceClient).mockReturnValue(failing as never);
    const res = await POST(signed(itemEvent("subscriptionItem.active")));
    expect(res.status).toBe(500);
    expect(trackUpgraded).not.toHaveBeenCalled();
  });
});
