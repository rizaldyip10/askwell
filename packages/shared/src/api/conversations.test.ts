import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CONVERSATIONS_PAGE_SIZE,
  decodeConversationCursor,
  encodeConversationCursor,
  listConversationsQuerySchema,
  type ListConversationsResponse,
  PLAN_LIMITS,
  type ProjectUsage,
} from "../index";

const ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
// As supabase-js returns a timestamptz: microseconds and a "+" offset.
const CREATED_AT = "2026-11-19T08:06:09.123456+00:00";

describe("CONVERSATIONS_PAGE_SIZE", () => {
  it("is 50", () => {
    expect(CONVERSATIONS_PAGE_SIZE).toBe(50);
  });
});

describe("conversation cursor", () => {
  it("round-trips createdAt (microseconds kept) and id", () => {
    const encoded = encodeConversationCursor({ createdAt: CREATED_AT, id: ID });
    expect(decodeConversationCursor(encoded)).toEqual({ createdAt: CREATED_AT, id: ID });
  });

  it("is URL safe as is", () => {
    const encoded = encodeConversationCursor({ createdAt: CREATED_AT, id: ID });
    expect(encoded).toMatch(/^[0-9a-f]+$/);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });

  it.each([
    ["empty", ""],
    ["not hex", "abc$def"],
    ["odd length", "abc"],
    ["upper-case hex", encodeConversationCursor({ createdAt: CREATED_AT, id: ID }).toUpperCase()],
    ["too long", "a".repeat(201)],
    ["no separator", encodeConversationCursor({ createdAt: CREATED_AT, id: ID }).slice(0, 10)],
    ["bad uuid", encodeConversationCursor({ createdAt: CREATED_AT, id: "nope" })],
    ["bad timestamp", encodeConversationCursor({ createdAt: "yesterday", id: ID })],
    ["extra part", encodeConversationCursor({ createdAt: CREATED_AT, id: `${ID}|x` })],
  ])("rejects %s", (_, value) => {
    expect(decodeConversationCursor(value)).toBeNull();
  });
});

describe("listConversationsQuerySchema", () => {
  it("accepts no cursor (the newest page)", () => {
    expect(listConversationsQuerySchema.parse({})).toEqual({});
  });

  it("parses `before` into its cursor", () => {
    const before = encodeConversationCursor({ createdAt: CREATED_AT, id: ID });
    expect(listConversationsQuerySchema.parse({ before })).toEqual({ before: { createdAt: CREATED_AT, id: ID } });
  });

  it("rejects an invalid cursor", () => {
    const result = listConversationsQuerySchema.safeParse({ before: "garbage!" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["before"]);
  });

  it("rejects unknown params, including a page size from the client", () => {
    expect(listConversationsQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });
});

describe("Phase 4 types", () => {
  it("ListConversationsResponse has a nullable nextCursor", () => {
    expectTypeOf<ListConversationsResponse["nextCursor"]>().toEqualTypeOf<string | null>();
  });

  it("ProjectUsage takes its limit from PLAN_LIMITS", () => {
    const usage: ProjectUsage = {
      projectId: ID,
      used: 0,
      limit: PLAN_LIMITS.free.messagesPerMonth,
      periodStart: CREATED_AT,
      periodEnd: "2026-12-19T08:06:09.123456+00:00",
    };
    expectTypeOf(usage).toEqualTypeOf<{
      projectId: string;
      used: number;
      limit: number;
      periodStart: string;
      periodEnd: string;
    }>();
    expect(usage.limit).toBe(100);
  });
});
