// The chat route with the real analytics path (lib/chat/trace → captureServer → posthog-node),
// and PostHog failing: the reply must still come back, without waiting on PostHog.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/security", () => ({ protectWidgetChat: vi.fn(async () => ({ allowed: true })) }));
vi.mock("../../../../lib/ai", () => ({
  NO_ANSWER_REPLY: "I don't know.",
  embedText: vi.fn(async () => [0.1]),
  answerFromChunks: vi.fn(async () => ({
    reply: "We open 9 to 5.",
    usage: { model: "gpt-5.4-mini", inputTokens: 100, outputTokens: 20, totalTokens: 120 },
  })),
}));
vi.mock("../../../../lib/chat/db", () => ({
  getChatProject: vi.fn(async () => ({ id: "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60", ownerId: "user_owner", plan: "free" })),
  conversationBelongs: vi.fn(async () => true),
  consumeMessage: vi.fn(async () => ({ ok: true, used: 1 })),
  matchChunks: vi.fn(async () => [{ id: "c1", sourceId: "s1", content: "We open 9 to 5.", similarity: 0.8 }]),
  saveChatTurn: vi.fn(async () => ({ ok: true, conversationId: "7a2b3c4d-1e2f-4a5b-8c9d-0e1f2a3b4c5d" })),
  isFirstConversation: vi.fn(async () => true),
}));

// after(): collect the tasks, as Next.js runs them once the response is sent.
const afterTasks: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (task: () => unknown) => void afterTasks.push(task) }));

const captureImmediate = vi.fn<(msg: unknown) => Promise<void>>();
vi.mock("posthog-node", () => ({
  PostHog: class {
    captureImmediate = captureImmediate;
    captureExceptionImmediate = vi.fn();
  },
}));

const MESSAGE = "my-private-question-text";
const body = JSON.stringify({ key: "pk_a1b2c3d4e5f6a7b8c9d0e1f2", visitorId: "0b1c2d3e-4f5a-4b6c-9d7e-8f9a0b1c2d3e", message: MESSAGE });

async function chat() {
  vi.resetModules();
  const { POST } = await import("./route");
  return POST(new Request("https://askwell.test/api/widget/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body }));
}

async function drainAfterTasks() {
  while (afterTasks.length) await afterTasks.shift()!();
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
  afterTasks.length = 0;
  captureImmediate.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("chat with PostHog failing", () => {
  it("answers when PostHog rejects, and sends nothing during the request", async () => {
    captureImmediate.mockRejectedValue(new Error("posthog 500"));
    const res = await chat();
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe("We open 9 to 5.");
    expect(captureImmediate).not.toHaveBeenCalled(); // all sends wait for after()

    await expect(drainAfterTasks()).resolves.toBeUndefined();
    const events = captureImmediate.mock.calls.map(([msg]) => (msg as { event: string }).event);
    expect(events).toEqual(expect.arrayContaining(["$ai_generation", "first_chat"]));
    expect(JSON.stringify(captureImmediate.mock.calls)).not.toContain(MESSAGE);
  });

  it("answers when PostHog throws synchronously", async () => {
    captureImmediate.mockImplementation(() => {
      throw new Error("boom");
    });
    const res = await chat();
    expect(res.status).toBe(200);
    await expect(drainAfterTasks()).resolves.toBeUndefined();
  });

  it("answers at once when PostHog hangs; the background send gives up after its timeout", async () => {
    captureImmediate.mockReturnValue(new Promise(() => {}));
    const res = await chat();
    expect(res.status).toBe(200);

    vi.useFakeTimers();
    const drained = drainAfterTasks();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(drained).resolves.toBeUndefined();
  });
});
