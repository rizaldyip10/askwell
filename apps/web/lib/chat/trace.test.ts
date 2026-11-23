import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const captureServer = vi.fn();
vi.mock("../analytics/server", () => ({ captureServer: (...args: unknown[]) => captureServer(...args) }));

const isFirstConversation = vi.fn<(projectId: string, conversationId: string) => Promise<boolean>>();
vi.mock("./db", () => ({ isFirstConversation: (p: string, c: string) => isFirstConversation(p, c) }));

const afterTasks: (() => unknown)[] = [];
const afterMock = vi.fn((task: () => unknown) => void afterTasks.push(task));
vi.mock("next/server", () => ({ after: (task: () => unknown) => afterMock(task) }));

const { AI_PROVIDER, onChatTrace, onConversationStarted } = await import("./trace");

const PROJECT = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const OWNER = "user_owner";
const CONVO = "7a2b3c4d-1e2f-4a5b-8c9d-0e1f2a3b4c5d";
const USAGE = { model: "gpt-5.4-mini", inputTokens: 100, outputTokens: 20, totalTokens: 120 };
const trace = (extra = {}) => ({ projectId: PROJECT, ownerId: OWNER, conversationId: CONVO, usage: USAGE, latencyMs: 850, chunkCount: 3, ...extra });

async function runAfterTasks() {
  while (afterTasks.length) await afterTasks.shift()!();
}

beforeEach(() => {
  captureServer.mockReset();
  isFirstConversation.mockReset();
  afterMock.mockClear();
  afterTasks.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("onChatTrace", () => {
  it("sends one $ai_generation for the owner with model, tokens, latency, project and conversation", () => {
    onChatTrace(trace());
    expect(captureServer).toHaveBeenCalledOnce();
    const [event, distinctId, props] = captureServer.mock.calls[0]!;
    expect(event).toBe("$ai_generation");
    expect(distinctId).toBe(OWNER);
    expect(props).toEqual({
      $ai_trace_id: CONVO,
      $ai_session_id: CONVO,
      $ai_span_id: expect.any(String),
      $ai_span_name: "widget_answer",
      $ai_provider: AI_PROVIDER,
      $ai_model: "gpt-5.4-mini",
      $ai_input_tokens: 100,
      $ai_output_tokens: 20,
      $ai_latency: 0.85,
      project_id: PROJECT,
      chunk_count: 3,
    });
  });

  it("sends no prompt, chunk or reply text (privacy mode)", () => {
    onChatTrace(trace());
    const props = captureServer.mock.calls[0]![2] as Record<string, unknown>;
    expect(Object.keys(props)).not.toEqual(expect.arrayContaining(["$ai_input"]));
    expect(props).not.toHaveProperty("$ai_input");
    expect(props).not.toHaveProperty("$ai_output_choices");
    for (const value of Object.values(props)) expect(typeof value === "string" ? value.length : 0).toBeLessThan(64);
  });

  it("puts two replies of one conversation in the same trace", () => {
    onChatTrace(trace());
    onChatTrace(trace({ latencyMs: 400 }));
    const [a, b] = captureServer.mock.calls.map((call) => call[2] as Record<string, unknown>);
    expect(a!.$ai_trace_id).toBe(CONVO);
    expect(b!.$ai_trace_id).toBe(CONVO);
    expect(a!.$ai_span_id).not.toBe(b!.$ai_span_id);
  });

  it("sends nothing when no model call was made", () => {
    onChatTrace(trace({ usage: null, chunkCount: 0 }));
    expect(captureServer).not.toHaveBeenCalled();
  });

  it("never throws, even if the capture does", () => {
    captureServer.mockImplementation(() => {
      throw new Error("posthog down");
    });
    expect(() => onChatTrace(trace())).not.toThrow();
  });
});

describe("onConversationStarted", () => {
  const started = { projectId: PROJECT, ownerId: OWNER, conversationId: CONVO };

  it("checks after the response and sends first_chat for the project's first conversation", async () => {
    isFirstConversation.mockResolvedValue(true);
    onConversationStarted(started);
    expect(isFirstConversation).not.toHaveBeenCalled(); // nothing during the request
    await runAfterTasks();
    expect(isFirstConversation).toHaveBeenCalledWith(PROJECT, CONVO);
    expect(captureServer).toHaveBeenCalledWith("first_chat", OWNER, { project_id: PROJECT });
  });

  it("fires once per project, not once per conversation", async () => {
    // The project's conversations, oldest first: only the oldest is "first".
    const conversations = [CONVO, "8b3c4d5e-2f3a-4b6c-9d0e-1f2a3b4c5d6e", "9c4d5e6f-3a4b-4c7d-8e1f-2a3b4c5d6e7f"];
    isFirstConversation.mockImplementation(async (_p, id) => id === conversations[0]);
    for (const conversationId of conversations) onConversationStarted({ ...started, conversationId });
    await runAfterTasks();
    expect(captureServer.mock.calls.filter(([event]) => event === "first_chat")).toHaveLength(1);
  });

  it("sends nothing when the lookup fails, and never throws", async () => {
    isFirstConversation.mockRejectedValue(new Error("db down"));
    expect(() => onConversationStarted(started)).not.toThrow();
    await expect(runAfterTasks()).resolves.toBeUndefined();
    expect(captureServer).not.toHaveBeenCalled();
  });

  it("runs right away outside a request scope", async () => {
    afterMock.mockImplementationOnce(() => {
      throw new Error("`after` was called outside a request scope");
    });
    isFirstConversation.mockResolvedValue(true);
    onConversationStarted(started);
    await vi.waitFor(() => expect(captureServer).toHaveBeenCalledWith("first_chat", OWNER, { project_id: PROJECT }));
  });
});
