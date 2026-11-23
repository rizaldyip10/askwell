import { CONVERSATIONS_PAGE_SIZE, encodeConversationCursor, type ListConversationsResponse } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conversationRows, fakeConversationsDb, type FakeConversation } from "../../../../../lib/conversations/test-utils";
import { createOwnerClient } from "../../../../../lib/supabase/owner";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
const authMock = vi.fn<() => Promise<{ userId: string | null }>>();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
vi.mock("../../../../../lib/supabase/owner", () => ({ createOwnerClient: vi.fn() }));
vi.mock("../../../../../lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => {
    throw new Error("the service client must not be used");
  }),
}));

const USER = "user_owner";
const OTHER_USER = "user_other";
const PROJECT = "00000000-0000-4000-8000-0000000000a1";
const OTHER_PROJECT = "00000000-0000-4000-8000-0000000000a2";
const projects = [
  { id: PROJECT, owner_id: USER },
  { id: OTHER_PROJECT, owner_id: OTHER_USER },
];

/**
 * An owner client that behaves like RLS for `user`: `projects` returns only their own row,
 * `conversations` only rows of their own projects (then the in-memory list query runs).
 */
function ownerClientFor(user: string, conversations: FakeConversation[]) {
  const mine = new Set(projects.filter((p) => p.owner_id === user).map((p) => p.id));
  const db = fakeConversationsDb(conversations.filter((c) => mine.has(c.project_id)));
  const from = vi.fn((table: string) => {
    if (table === "conversations") return db.client.from(table);
    if (table !== "projects") throw new Error(`unexpected table ${table}`);
    let id = "";
    const builder = {
      select: () => builder,
      eq: (_column: string, value: string) => ((id = value), builder),
      maybeSingle: async () => ({ data: mine.has(id) ? { id, owner_id: user } : null, error: null }),
    };
    return builder;
  });
  vi.mocked(createOwnerClient).mockReturnValue({ from } as unknown as ReturnType<typeof createOwnerClient>);
  return db;
}

const get = (projectId = PROJECT, query = "") =>
  GET(new Request(`https://askwell.test/api/projects/${projectId}/conversations${query}`), {
    params: Promise.resolve({ id: projectId }),
  });

const body = async (res: Response) => (await res.json()) as ListConversationsResponse;

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReset().mockResolvedValue({ userId: USER });
});

describe("GET /api/projects/:id/conversations", () => {
  it("401 when signed out, before any database call", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await get();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
    expect(createOwnerClient).not.toHaveBeenCalled();
  });

  it("400 for an invalid project id", async () => {
    const res = await get("nope");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
  });

  it.each([["?before=garbage"], ["?before="], ["?limit=500"]])("400 for a bad query: %s", async (query) => {
    ownerClientFor(USER, []);
    const res = await get(PROJECT, query);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({ code: "validation_error" });
    expect(createOwnerClient).not.toHaveBeenCalled();
  });

  it("404 for another owner's project, with no conversation read", async () => {
    const db = ownerClientFor(USER, conversationRows(OTHER_PROJECT, 3));
    const res = await get(OTHER_PROJECT);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(db.queries).toHaveLength(0);
  });

  it("an owner sees their own conversations, newest first, with preview and count", async () => {
    ownerClientFor(USER, [...conversationRows(PROJECT, 4), ...conversationRows(OTHER_PROJECT, 4)]);
    const res = await get();
    expect(res.status).toBe(200);
    const page = await body(res);
    expect(page.nextCursor).toBeNull();
    expect(page.conversations.map((c) => c.projectId)).toEqual([PROJECT, PROJECT, PROJECT, PROJECT]);
    expect(page.conversations[0]).toEqual({
      id: "00000000-0000-4000-8000-000000000003",
      projectId: PROJECT,
      visitorId: "visitor_3",
      createdAt: "2026-11-10T00:00:01.123456+00:00",
      firstMessagePreview: "Question 3",
      messageCount: 2,
    });
  });

  it("an empty project gives [] and nextCursor null", async () => {
    ownerClientFor(USER, []);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ conversations: [], nextCursor: null });
  });

  it("pages through every conversation 50 at a time, with no gap or repeat across tied timestamps", async () => {
    const all = conversationRows(PROJECT, 2 * CONVERSATIONS_PAGE_SIZE + 20);
    ownerClientFor(USER, all);

    const pages: ListConversationsResponse[] = [];
    let query = "";
    for (let i = 0; i < 10; i++) {
      const res = await get(PROJECT, query);
      expect(res.status).toBe(200);
      const page = await body(res);
      pages.push(page);
      if (!page.nextCursor) break;
      query = `?before=${page.nextCursor}`;
    }

    expect(pages.map((p) => p.conversations.length)).toEqual([50, 50, 20]);
    expect(pages.at(-1)?.nextCursor).toBeNull();
    const seen = pages.flatMap((p) => p.conversations.map((c) => `${c.createdAt}|${c.id}`));
    const expected = all
      .map((c) => `${c.created_at}|${c.id}`)
      .sort()
      .reverse();
    expect(seen).toEqual(expected);
  });

  it("a cursor from another project's rows still reads only this project", async () => {
    ownerClientFor(USER, conversationRows(PROJECT, 3));
    const before = encodeConversationCursor({
      createdAt: "2026-12-31T00:00:00.000000+00:00",
      id: "ffffffff-ffff-4fff-bfff-ffffffffffff",
    });
    const page = await body(await get(PROJECT, `?before=${before}`));
    expect(page.conversations.map((c) => c.projectId)).toEqual([PROJECT, PROJECT, PROJECT]);
  });

  it("500 with the error shape when the database fails", async () => {
    const from = vi.fn(() => {
      throw new Error("down");
    });
    vi.mocked(createOwnerClient).mockReturnValue({ from } as unknown as ReturnType<typeof createOwnerClient>);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
  });
});
