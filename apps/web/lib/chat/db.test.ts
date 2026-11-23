import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceClient } from "../supabase/service";

vi.mock("server-only", () => ({}));
vi.mock("../supabase/service", () => ({ createServiceClient: vi.fn() }));

const { consumeMessage, conversationBelongs, getChatProject, isFirstConversation, matchChunks, saveChatTurn } = await import("./db");

const KEY = "pk_a1b2c3d4e5f6a7b8c9d0e1f2";
const PROJECT = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const CONVO = "7a2b3c4d-1e2f-4a5b-8c9d-0e1f2a3b4c5d";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<Result>>();
const query = { from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() };
let single: Result;

function fakeService(): ServiceClient {
  const chain = {
    select: (...a: unknown[]) => (query.select(...a), chain),
    eq: (...a: unknown[]) => (query.eq(...a), chain),
    order: (...a: unknown[]) => (query.order(...a), chain),
    limit: (...a: unknown[]) => (query.limit(...a), chain),
    maybeSingle: async () => single,
  };
  return {
    from: (t: string) => (query.from(t), chain),
    rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args),
  } as unknown as ServiceClient;
}

let service: ServiceClient;
beforeEach(() => {
  rpc.mockReset();
  for (const fn of Object.values(query)) fn.mockReset();
  service = fakeService();
});

describe("isFirstConversation", () => {
  it("is true only for the project's oldest conversation (created_at, then id)", async () => {
    single = { data: { id: CONVO }, error: null };
    expect(await isFirstConversation(PROJECT, CONVO, service)).toBe(true);
    expect(query.from).toHaveBeenCalledWith("conversations");
    expect(query.eq).toHaveBeenCalledWith("project_id", PROJECT);
    expect(query.order.mock.calls).toEqual([
      ["created_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
    expect(query.limit).toHaveBeenCalledWith(1);

    single = { data: { id: "00000000-0000-4000-8000-000000000001" }, error: null };
    expect(await isFirstConversation(PROJECT, CONVO, service)).toBe(false);
    single = { data: null, error: null };
    expect(await isFirstConversation(PROJECT, CONVO, service)).toBe(false);
  });

  it("throws on a database error", async () => {
    single = { data: null, error: { code: "XX000", message: "boom" } };
    await expect(isFirstConversation(PROJECT, CONVO, service)).rejects.toThrow("isFirstConversation failed: XX000");
  });
});

describe("getChatProject", () => {
  it("looks up by public_key only, returning the id, owner and the owner's plan", async () => {
    single = { data: { id: PROJECT, owner_id: "user_owner", accounts: { plan: "pro" } }, error: null };
    expect(await getChatProject(KEY, service)).toEqual({ id: PROJECT, ownerId: "user_owner", plan: "pro" });
    expect(query.from).toHaveBeenCalledWith("projects");
    expect(query.select).toHaveBeenCalledWith("id, owner_id, accounts(plan)");
    expect(query.eq).toHaveBeenCalledWith("public_key", KEY);
  });

  it("treats an unknown or missing plan as free", async () => {
    single = { data: { id: PROJECT, accounts: { plan: "enterprise" } }, error: null };
    expect((await getChatProject(KEY, service))?.plan).toBe("free");
    single = { data: { id: PROJECT, accounts: null }, error: null };
    expect((await getChatProject(KEY, service))?.plan).toBe("free");
  });

  it("returns null for an unknown key and throws on a database error", async () => {
    single = { data: null, error: null };
    expect(await getChatProject(KEY, service)).toBeNull();
    single = { data: null, error: { code: "XX000", message: "boom" } };
    await expect(getChatProject(KEY, service)).rejects.toThrow("getChatProject failed: XX000");
  });
});

describe("conversationBelongs", () => {
  it("calls conversation_belongs with the project and conversation", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await conversationBelongs(PROJECT, CONVO, service)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("conversation_belongs", { p_project_id: PROJECT, p_conversation_id: CONVO });
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await conversationBelongs(PROJECT, CONVO, service)).toBe(false);
  });
});

describe("consumeMessage", () => {
  it("returns the new count", async () => {
    rpc.mockResolvedValue({ data: 7, error: null });
    expect(await consumeMessage(PROJECT, 100, service)).toEqual({ ok: true, used: 7 });
    expect(rpc).toHaveBeenCalledWith("consume_message", { p_project_id: PROJECT, p_max_messages: 100 });
  });

  it("maps P0001 quota_exceeded", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "quota_exceeded" } });
    expect(await consumeMessage(PROJECT, 100, service)).toEqual({ ok: false, reason: "quota_exceeded" });
  });

  it("throws on other errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "project_not_found" } });
    await expect(consumeMessage(PROJECT, 100, service)).rejects.toThrow("consume_message failed: P0002");
  });
});

describe("matchChunks", () => {
  it("sends the embedding in pgvector's text form and maps rows", async () => {
    rpc.mockResolvedValue({
      data: [{ id: "c1", source_id: "s1", content: "Hello", similarity: 0.9 }],
      error: null,
    });
    expect(await matchChunks(PROJECT, [0.5, -0.25], 5, service)).toEqual([
      { id: "c1", sourceId: "s1", content: "Hello", similarity: 0.9 },
    ]);
    expect(rpc).toHaveBeenCalledWith("match_chunks", {
      p_project_id: PROJECT,
      p_embedding: "[0.5,-0.25]",
      p_match_count: 5,
    });
  });

  it("throws on a database error", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "22000", message: "bad vector" } });
    await expect(matchChunks(PROJECT, [1], 5, service)).rejects.toThrow("match_chunks failed");
  });
});

describe("saveChatTurn", () => {
  const turn = { projectId: PROJECT, visitorId: "v1", message: "Hi?", reply: "Hello." };

  it("passes null for a new conversation and returns the id", async () => {
    rpc.mockResolvedValue({ data: CONVO, error: null });
    expect(await saveChatTurn({ ...turn, conversationId: null }, service)).toEqual({ ok: true, conversationId: CONVO });
    expect(rpc).toHaveBeenCalledWith("save_chat_turn", {
      p_project_id: PROJECT,
      p_conversation_id: null,
      p_visitor_id: "v1",
      p_visitor_message: "Hi?",
      p_bot_reply: "Hello.",
    });
  });

  it("maps P0002 conversation_not_found and throws on other errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "conversation_not_found" } });
    expect(await saveChatTurn({ ...turn, conversationId: CONVO }, service)).toEqual({
      ok: false,
      reason: "conversation_not_found",
    });
    rpc.mockResolvedValue({ data: null, error: { code: "23502", message: "null value" } });
    await expect(saveChatTurn({ ...turn, conversationId: null }, service)).rejects.toThrow("save_chat_turn failed");
  });
});
