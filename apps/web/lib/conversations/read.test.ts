import { CONVERSATIONS_PAGE_SIZE, decodeConversationCursor } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { fail, fakeClient, ok } from "../projects/test-utils";
import type { OwnerClient } from "../supabase/owner";
import { getConversationThread, listConversations } from "./read";
import { conversationRows, fakeConversationsDb } from "./test-utils";

vi.mock("server-only", () => ({}));
vi.mock("../supabase/owner", () => ({ createOwnerClient: vi.fn() }));

const PROJECT = "00000000-0000-4000-8000-0000000000a1";
const CONVERSATION = "00000000-0000-4000-8000-0000000000c1";
const asOwner = (client: unknown) => client as OwnerClient;

describe("listConversations", () => {
  it("is one query, scoped by project id and RLS, with no owner filter", async () => {
    const db = fakeConversationsDb(conversationRows(PROJECT, 3));
    await listConversations(PROJECT, undefined, asOwner(db.client));

    expect(db.queries).toHaveLength(1);
    const [calls] = db.queries;
    expect(calls).toContainEqual({
      method: "select",
      args: ["id, project_id, visitor_id, created_at, preview:messages(body), stats:messages(count)"],
    });
    expect(calls).toContainEqual({ method: "eq", args: ["project_id", PROJECT] });
    expect(calls?.some((c) => String(c.args[0]).includes("owner_id"))).toBe(false);
  });

  it("previews the first visitor message: filtered, oldest first, one row", async () => {
    const db = fakeConversationsDb([]);
    await listConversations(PROJECT, undefined, asOwner(db.client));
    const [calls] = db.queries;
    expect(calls).toContainEqual({ method: "eq", args: ["preview.role", "visitor"] });
    expect(calls).toContainEqual({ method: "order", args: ["created_at", { referencedTable: "preview", ascending: true }] });
    expect(calls).toContainEqual({ method: "order", args: ["id", { referencedTable: "preview", ascending: true }] });
    expect(calls).toContainEqual({ method: "limit", args: [1, { referencedTable: "preview" }] });
  });

  it("asks for one row more than a page, newest first with id as the tie-break", async () => {
    const db = fakeConversationsDb([]);
    await listConversations(PROJECT, undefined, asOwner(db.client));
    const [calls] = db.queries;
    const top = calls?.filter((c) => !(c.args[1] as { referencedTable?: string } | undefined)?.referencedTable);
    expect(top?.filter((c) => c.method === "order" || c.method === "limit")).toEqual([
      { method: "order", args: ["created_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: false }] },
      { method: "limit", args: [CONVERSATIONS_PAGE_SIZE + 1] },
    ]);
  });

  it("filters strictly after the cursor, quoting the timestamp", async () => {
    const db = fakeConversationsDb([]);
    const before = { createdAt: "2026-11-23T01:00:00.123456+00:00", id: CONVERSATION };
    await listConversations(PROJECT, before, asOwner(db.client));
    const [calls] = db.queries;
    expect(calls).toContainEqual({
      method: "or",
      args: [
        `created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${CONVERSATION})`,
      ],
    });
  });

  it("returns no cursor when everything fits on one page", async () => {
    const db = fakeConversationsDb(conversationRows(PROJECT, CONVERSATIONS_PAGE_SIZE));
    const page = await listConversations(PROJECT, undefined, asOwner(db.client));
    expect(page.conversations).toHaveLength(CONVERSATIONS_PAGE_SIZE);
    expect(page.nextCursor).toBeNull();
  });

  it("points nextCursor at the last row shown", async () => {
    const db = fakeConversationsDb(conversationRows(PROJECT, CONVERSATIONS_PAGE_SIZE + 1));
    const page = await listConversations(PROJECT, undefined, asOwner(db.client));
    const last = page.conversations.at(-1);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeConversationCursor(page.nextCursor ?? "")).toEqual({ createdAt: last?.createdAt, id: last?.id });
  });

  it("throws on a database error", async () => {
    const fake = fakeClient();
    fake.queue("conversations", fail("XX000", "boom"));
    await expect(listConversations(PROJECT, undefined, asOwner(fake.client))).rejects.toThrow(/boom/);
  });
});

describe("getConversationThread", () => {
  const row = {
    id: CONVERSATION,
    project_id: PROJECT,
    visitor_id: "v1",
    created_at: "2026-11-23T01:00:00+00:00",
    messages: [
      { id: "m1", conversation_id: CONVERSATION, role: "visitor", body: "Hi?", created_at: "2026-11-23T01:00:01+00:00" },
      { id: "m2", conversation_id: CONVERSATION, role: "bot", body: "Hello!", created_at: "2026-11-23T01:00:02+00:00" },
    ],
  };

  it("reads the conversation and its messages oldest first in one query, by id only", async () => {
    const fake = fakeClient();
    fake.queue("conversations", ok(row));
    const thread = await getConversationThread(CONVERSATION, asOwner(fake.client));

    expect(thread).toEqual({
      conversation: { id: CONVERSATION, projectId: PROJECT, visitorId: "v1", createdAt: row.created_at },
      messages: [
        { id: "m1", conversationId: CONVERSATION, role: "visitor", body: "Hi?", createdAt: row.messages[0]?.created_at },
        { id: "m2", conversationId: CONVERSATION, role: "bot", body: "Hello!", createdAt: row.messages[1]?.created_at },
      ],
    });
    const [calls] = fake.callsTo("conversations");
    expect(calls).toContainEqual({ method: "eq", args: ["id", CONVERSATION] });
    expect(calls).toContainEqual({ method: "order", args: ["created_at", { referencedTable: "messages", ascending: true }] });
    expect(calls).toContainEqual({ method: "order", args: ["id", { referencedTable: "messages", ascending: true }] });
    expect(calls?.some((c) => String(c.args[0]).includes("owner_id"))).toBe(false);
  });

  it("returns null when RLS hides it or it doesn't exist", async () => {
    const fake = fakeClient();
    fake.queue("conversations", ok(null));
    await expect(getConversationThread(CONVERSATION, asOwner(fake.client))).resolves.toBeNull();
  });

  it("throws on a database error", async () => {
    const fake = fakeClient();
    fake.queue("conversations", fail("XX000", "boom"));
    await expect(getConversationThread(CONVERSATION, asOwner(fake.client))).rejects.toThrow(/boom/);
  });
});
