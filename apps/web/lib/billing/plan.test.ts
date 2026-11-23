import { describe, expect, it } from "vitest";
import { billingEventUser, planFromSubscription, PRO_PLAN_SLUG, type SubscriptionItemLike } from "./plan";

const NOW = Date.UTC(2026, 10, 23, 12);
const DAY = 86_400_000;
const item = (slug: string, status: string, over: Partial<SubscriptionItemLike> = {}): SubscriptionItemLike => ({
  status,
  plan: { slug },
  periodEnd: NOW + 20 * DAY,
  endedAt: null,
  ...over,
});
const sub = (...items: SubscriptionItemLike[]) => ({ subscriptionItems: items });

describe("planFromSubscription", () => {
  it("the Pro slug is pro", () => {
    expect(PRO_PLAN_SLUG).toBe("pro");
  });

  it("active pro → pro", () => {
    expect(planFromSubscription(sub(item("pro", "active")), NOW)).toBe("pro");
  });

  it("active pro already canceled for the period end → still pro", () => {
    // Clerk keeps the item active until the paid period ends.
    expect(planFromSubscription(sub(item("free", "upcoming"), item("pro", "active")), NOW)).toBe("pro");
  });

  it("canceled but not ended (period still running) → pro", () => {
    expect(planFromSubscription(sub(item("pro", "canceled")), NOW)).toBe("pro");
  });

  it("canceled with the period over, or with an end time → free", () => {
    expect(planFromSubscription(sub(item("pro", "canceled", { periodEnd: NOW - 1 })), NOW)).toBe("free");
    expect(planFromSubscription(sub(item("pro", "canceled", { endedAt: NOW - DAY })), NOW)).toBe("free");
    expect(planFromSubscription(sub(item("pro", "canceled", { periodEnd: null })), NOW)).toBe("free");
  });

  it("ended pro → free", () => {
    expect(planFromSubscription(sub(item("pro", "ended", { endedAt: NOW - DAY }), item("free", "active")), NOW)).toBe("free");
  });

  it.each(["expired", "past_due", "abandoned", "incomplete", "upcoming"])("pro item %s → free", (status) => {
    expect(planFromSubscription(sub(item("pro", status)), NOW)).toBe("free");
  });

  it("free only → free", () => {
    expect(planFromSubscription(sub(item("free", "active")), NOW)).toBe("free");
  });

  it("no subscription → free", () => {
    expect(planFromSubscription(null, NOW)).toBe("free");
    expect(planFromSubscription(sub(), NOW)).toBe("free");
  });

  it("another plan, or an item without a plan → free", () => {
    expect(planFromSubscription(sub(item("pro_team", "active")), NOW)).toBe("free");
    expect(planFromSubscription(sub({ ...item("pro", "active"), plan: null }), NOW)).toBe("free");
  });
});

describe("billingEventUser", () => {
  const event = (type: string, slug: string, payer: { user_id?: string; organization_id?: string } | null) => ({
    type,
    data: { plan: { slug }, payer },
  });

  it.each(["subscriptionItem.active", "subscriptionItem.updated", "subscriptionItem.canceled", "subscriptionItem.ended"])(
    "a user's pro %s → that user",
    (type) => {
      expect(billingEventUser(event(type, "pro", { user_id: "user_1" }))).toBe("user_1");
    },
  );

  it("an org payer → ignored", () => {
    expect(billingEventUser(event("subscriptionItem.active", "pro", { organization_id: "org_1" }))).toBeNull();
    expect(billingEventUser(event("subscriptionItem.active", "pro", { user_id: "user_1", organization_id: "org_1" }))).toBeNull();
  });

  it("another plan → ignored", () => {
    expect(billingEventUser(event("subscriptionItem.active", "free", { user_id: "user_1" }))).toBeNull();
    expect(billingEventUser(event("subscriptionItem.active", "team", { user_id: "user_1" }))).toBeNull();
  });

  it("other events, or no payer → ignored", () => {
    expect(billingEventUser({ type: "user.created", data: {} })).toBeNull();
    expect(billingEventUser(event("paymentAttempt.updated", "pro", { user_id: "user_1" }))).toBeNull();
    expect(billingEventUser(event("subscriptionItem.active", "pro", null))).toBeNull();
    expect(billingEventUser(event("subscriptionItem.active", "pro", {}))).toBeNull();
  });
});
