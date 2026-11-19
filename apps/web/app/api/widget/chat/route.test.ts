import { PLAN_LIMITS } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerFromChunks, embedText, NO_ANSWER_REPLY } from "../../../../lib/ai";
import {
  consumeMessage,
  conversationBelongs,
  getChatProject,
  matchChunks,
  onChatTrace,
  saveChatTurn,
} from "../../../../lib/chat";
import { protectWidgetChat } from "../../../../lib/security";
import { OPTIONS, POST } from "./route";

vi.mock("../../../../lib/security", () => ({ protectWidgetChat: vi.fn() }));
vi.mock("../../../../lib/ai", () => ({
  NO_ANSWER_REPLY: "I don't know the answer to that. Try rephrasing, or contact the team directly.",
  embedText: vi.fn(),
  answerFromChunks: vi.fn(),
}));
vi.mock("../../../../lib/chat", () => ({
  MATCH_COUNT: 5,
  getChatProject: vi.fn(),
  conversationBelongs: vi.fn(),
  consumeMessage: vi.fn(),
  matchChunks: vi.fn(),
  saveChatTurn: vi.fn(),
  onChatTrace: vi.fn(),
}));

const KEY = "pk_a1b2c3d4e5f6a7b8c9d0e1f2";
const PROJECT = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const CONVO = "7a2b3c4d-1e2f-4a5b-8c9d-0e1f2a3b4c5d";
const VISITOR = "0b1c2d3e-4f5a-4b6c-9d7e-8f9a0b1c2d3e";
const MESSAGE = "What are your opening hours?";
const SECRET_TEXT = "my-private-question-text";

const protect = vi.mocked(protectWidgetChat);
const project = vi.mocked(getChatProject);
const belongs = vi.mocked(conversationBelongs);
const consume = vi.mocked(consumeMessage);
const embed = vi.mocked(embedText);
const match = vi.mocked(matchChunks);
const answer = vi.mocked(answerFromChunks);
const save = vi.mocked(saveChatTurn);
const trace = vi.mocked(onChatTrace);

const USAGE = { model: "gpt-5.4-mini", inputTokens: 100, outputTokens: 20, totalTokens: 120 };
const CHUNKS = [{ id: "c1", sourceId: "s1", content: "We open 9 to 5.", similarity: 0.8 }];

const post = (body: unknown) =>
  POST(
    new Request("https://askwell.test/api/widget/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const validBody = (extra: Record<string, unknown> = {}) => ({ key: KEY, visitorId: VISITOR, message: MESSAGE, ...extra });

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(await res.json()).toEqual({ error: { code, message: expect.any(String) } });
  expect(res.headers.get("cache-control")).toBe("no-store");
  expectCors(res);
}
function expectCors(res: Response) {
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(res.headers.get("access-control-allow-credentials")).toBeNull();
}
function expectNotCounted() {
  expect(consume).not.toHaveBeenCalled();
  expect(embed).not.toHaveBeenCalled();
  expect(answer).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
}

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  for (const fn of [protect, project, belongs, consume, embed, match, answer, save, trace]) fn.mockReset();
  protect.mockResolvedValue({ allowed: true });
  project.mockResolvedValue({ id: PROJECT, plan: "free" });
  belongs.mockResolvedValue(true);
  consume.mockResolvedValue({ ok: true, used: 1 });
  embed.mockResolvedValue([0.1, 0.2]);
  match.mockResolvedValue(CHUNKS);
  answer.mockResolvedValue({ reply: "We open 9 to 5.", usage: USAGE });
  save.mockResolvedValue({ ok: true, conversationId: CONVO });
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorLog.mockRestore());

describe("POST /api/widget/chat", () => {
  it("200: protect → count → embed → match → answer → save, returns the conversation id", async () => {
    const res = await post(validBody());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversationId: CONVO, reply: "We open 9 to 5." });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expectCors(res);

    expect(protect).toHaveBeenCalledWith(expect.any(Request), { publicKey: KEY, message: MESSAGE });
    expect(project).toHaveBeenCalledWith(KEY);
    expect(belongs).not.toHaveBeenCalled(); // no conversationId given
    expect(consume).toHaveBeenCalledWith(PROJECT, PLAN_LIMITS.free.messagesPerMonth);
    expect(embed).toHaveBeenCalledWith(MESSAGE);
    expect(match).toHaveBeenCalledWith(PROJECT, [0.1, 0.2], 5);
    expect(answer).toHaveBeenCalledWith({ question: MESSAGE, chunks: CHUNKS });
    expect(save).toHaveBeenCalledWith({
      projectId: PROJECT,
      conversationId: null,
      visitorId: VISITOR,
      message: MESSAGE,
      reply: "We open 9 to 5.",
    });

    const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0] ?? Infinity;
    expect(order(protect)).toBeLessThan(order(consume));
    expect(order(consume)).toBeLessThan(order(embed));
    expect(order(embed)).toBeLessThan(order(answer));
    expect(order(answer)).toBeLessThan(order(save));
  });

  it("uses the Pro limit for a Pro owner, read on the server", async () => {
    project.mockResolvedValue({ id: PROJECT, plan: "pro" });
    await post(validBody());
    expect(consume).toHaveBeenCalledWith(PROJECT, PLAN_LIMITS.pro.messagesPerMonth);
  });

  it("continues an existing conversation of this project", async () => {
    const res = await post(validBody({ conversationId: CONVO }));
    expect(res.status).toBe(200);
    expect(belongs).toHaveBeenCalledWith(PROJECT, CONVO);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ conversationId: CONVO }));
  });

  it("passes usage, latency and chunk count to onChatTrace, never the message", async () => {
    await post(validBody());
    expect(trace).toHaveBeenCalledWith({ projectId: PROJECT, usage: USAGE, latencyMs: expect.any(Number), chunkCount: 1 });
    expect(JSON.stringify(trace.mock.calls)).not.toContain(MESSAGE);
  });

  it("400 validation_error for a bad body, before Arcjet and without counting", async () => {
    const bodies = [
      "not json",
      {},
      validBody({ message: "" }),
      validBody({ message: "   " }),
      validBody({ message: "x".repeat(1001) }),
      validBody({ key: "bad" }),
      validBody({ visitorId: "nope" }),
      validBody({ conversationId: "nope" }),
      validBody({ extra: 1 }),
    ];
    for (const body of bodies) await expectError(await post(body), 400, "validation_error");
    expect(protect).not.toHaveBeenCalled();
    expect(project).not.toHaveBeenCalled();
    expectNotCounted();
  });

  it("413 validation_error for an oversized body, before parsing, Arcjet or counting", async () => {
    // Over the cap (1,000 × 6 + 1,024 bytes) but otherwise a valid shape.
    const res = await post(JSON.stringify({ ...validBody(), pad: "x".repeat(8000) }));
    await expectError(res, 413, "validation_error");
    expect(protect).not.toHaveBeenCalled();
    expectNotCounted();
  });

  it("accepts a max-length message even when every character is JSON-escaped", async () => {
    const res = await post(JSON.stringify(validBody({ message: "\u0001".repeat(1000) })));
    expect(res.status).toBe(200);
  });

  it("429 rate_limited when Arcjet rate limits; no lookup, no count, no OpenAI", async () => {
    protect.mockResolvedValue({ allowed: false, reason: "rate_limit" });
    await expectError(await post(validBody()), 429, "rate_limited");
    expect(project).not.toHaveBeenCalled();
    expectNotCounted();
  });

  it("400 validation_error with a friendly message on injection; no count, no OpenAI", async () => {
    protect.mockResolvedValue({ allowed: false, reason: "injection" });
    const res = await post(validBody());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("validation_error");
    expect(body.error.message).toMatch(/rephras/i);
    expectCors(res);
    expect(project).not.toHaveBeenCalled();
    expectNotCounted();
  });

  it("404 not_found for an unknown key; nothing counted", async () => {
    project.mockResolvedValue(null);
    await expectError(await post(validBody()), 404, "not_found");
    expectNotCounted();
  });

  it("404 not_found for another project's (or an unknown) conversation; nothing counted", async () => {
    belongs.mockResolvedValue(false);
    await expectError(await post(validBody({ conversationId: CONVO })), 404, "not_found");
    expect(belongs).toHaveBeenCalledWith(PROJECT, CONVO);
    expectNotCounted();
  });

  it("429 quota_exceeded at the limit; no OpenAI call", async () => {
    consume.mockResolvedValue({ ok: false, reason: "quota_exceeded" });
    await expectError(await post(validBody()), 429, "quota_exceeded");
    expect(consume).toHaveBeenCalledTimes(1);
    expect(embed).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("no chunks: answers NO_ANSWER_REPLY (answerFromChunks short-circuits) and saves it", async () => {
    match.mockResolvedValue([]);
    answer.mockResolvedValue({ reply: NO_ANSWER_REPLY, usage: null });
    const res = await post(validBody());
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe(NO_ANSWER_REPLY);
    expect(answer).toHaveBeenCalledWith({ question: MESSAGE, chunks: [] });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ reply: NO_ANSWER_REPLY }));
    expect(trace).toHaveBeenCalledWith(expect.objectContaining({ usage: null, chunkCount: 0 }));
  });

  it("500 internal on a model error after counting: counted, not saved, message not logged", async () => {
    answer.mockRejectedValue(new Error("OpenAI 503"));
    await expectError(await post(validBody({ message: SECRET_TEXT })), 500, "internal");
    expect(consume).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(SECRET_TEXT);
  });

  it("500 internal on an embedding or save error after counting", async () => {
    embed.mockRejectedValueOnce(new Error("embed failed"));
    await expectError(await post(validBody()), 500, "internal");

    // A Postgres error's details can quote the row; only name and message are logged.
    const pgError = Object.assign(new Error("save_chat_turn failed: 23502"), {
      cause: { details: `Failing row contains (${SECRET_TEXT})` },
    });
    save.mockRejectedValueOnce(pgError);
    await expectError(await post(validBody({ message: SECRET_TEXT })), 500, "internal");
    expect(consume).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(SECRET_TEXT);
  });

  it("404 not_found when the conversation is deleted between the check and the save (already counted)", async () => {
    save.mockResolvedValue({ ok: false, reason: "conversation_not_found" });
    await expectError(await post(validBody({ conversationId: CONVO })), 404, "not_found");
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("500 internal when the project lookup or the count fails; no OpenAI call", async () => {
    project.mockRejectedValueOnce(new Error("db down"));
    await expectError(await post(validBody()), 500, "internal");
    consume.mockRejectedValueOnce(new Error("db down"));
    await expectError(await post(validBody()), 500, "internal");
    expect(embed).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
  });

  it("OPTIONS answers the preflight with CORS", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expectCors(res);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
