import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, fakeClient, ok } from "../../../../lib/projects/test-utils";
import { createOwnerClient } from "../../../../lib/supabase/owner";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
const authMock = vi.fn<() => Promise<{ userId: string | null }>>();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
vi.mock("../../../../lib/supabase/owner", () => ({ createOwnerClient: vi.fn() }));
vi.mock("../../../../lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => {
    throw new Error("the service client must not be used");
  }),
}));

const USER = "user_owner";
const PROJECT = "00000000-0000-4000-8000-0000000000a1";
const CONVERSATION = "00000000-0000-4000-8000-0000000000c1";

const row = {
  id: CONVERSATION,
  project_id: PROJECT,
  visitor_id: "visitor_1",
  created_at: "2026-11-23T01:00:00.123456+00:00",
  messages: [
    { id: "m1", conversation_id: CONVERSATION, role: "visitor", body: "<b>Hi?</b>", created_at: "2026-11-23T01:00:01.000001+00:00" },
    { id: "m2", conversation_id: CONVERSATION, role: "bot", body: "Hello!", created_at: "2026-11-23T01:00:01.000002+00:00" },
  ],
};

let owner: ReturnType<typeof fakeClient>;

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReset().mockResolvedValue({ userId: USER });
  owner = fakeClient();
  vi.mocked(createOwnerClient).mockReturnValue(owner.client as unknown as ReturnType<typeof createOwnerClient>);
});

const get = (id = CONVERSATION) =>
  GET(new Request(`https://askwell.test/api/conversations/${id}`), { params: Promise.resolve({ id }) });

describe("GET /api/conversations/:id", () => {
  it("401 when signed out, before any database call", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await get();
    expect(res.status).toBe(401);
    expect(createOwnerClient).not.toHaveBeenCalled();
  });

  it("400 for an invalid id", async () => {
    const res = await get("nope");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
    expect(createOwnerClient).not.toHaveBeenCalled();
  });

  it("the owner gets the conversation and its messages oldest first, bodies as stored", async () => {
    owner.queue("conversations", ok(row));
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      conversation: { id: CONVERSATION, projectId: PROJECT, visitorId: "visitor_1", createdAt: row.created_at },
      messages: [
        { id: "m1", conversationId: CONVERSATION, role: "visitor", body: "<b>Hi?</b>", createdAt: row.messages[0]?.created_at },
        { id: "m2", conversationId: CONVERSATION, role: "bot", body: "Hello!", createdAt: row.messages[1]?.created_at },
      ],
    });
    expect(createOwnerClient).toHaveBeenCalled();
  });

  it("404 for another owner's conversation (RLS returns no row), same as a missing one", async () => {
    owner.queue("conversations", ok(null));
    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Conversation not found" } });
  });

  it("500 with the error shape when the database fails", async () => {
    owner.queue("conversations", fail("XX000", "boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
  });
});
