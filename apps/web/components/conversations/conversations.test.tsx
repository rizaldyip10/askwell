import type { ConversationSummary, ListConversationsResponse, Message } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { appendPage, fetchConversationsPage } from "./api";
import { ConversationsView } from "./conversations-view";
import { formatFullTime, formatShortTime, messageCountLabel } from "./format";
import { conversationPath, conversationsPath } from "./paths";
import { Thread } from "./thread";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const PROJECT = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const XSS = "<b>hi</b><script>alert(1)</script>";

const summary = (n: number, over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  projectId: PROJECT,
  visitorId: `v${n}`,
  createdAt: `2026-11-${String(10 + n).padStart(2, "0")}T14:05:00Z`,
  firstMessagePreview: `Question ${n}`,
  messageCount: n,
  ...over,
});

const message = (n: number, role: Message["role"], body: string): Message => ({
  id: `m${n}`,
  conversationId: "c",
  role,
  body,
  createdAt: `2026-11-19T10:0${n}:00Z`,
});

const view = (initial: ListConversationsResponse) =>
  renderToStaticMarkup(<ConversationsView projectId={PROJECT} initial={initial} />);

describe("ConversationsView", () => {
  it("lists rows in the given order with preview, count, time and a link to the thread", () => {
    const html = view({ conversations: [summary(2), summary(1)], nextCursor: null });
    expect(html.indexOf("Question 2")).toBeLessThan(html.indexOf("Question 1"));
    expect(html).toContain(`href="${conversationPath(PROJECT, summary(2).id)}"`);
    expect(html).toContain("2 messages");
    expect(html).toContain("1 message<");
    expect(html).toContain('<time dateTime="2026-11-12T14:05:00Z" title="Nov 12, 2026, 2:05 PM UTC">Nov 12, 14:05</time>');
    expect(html).toContain(">Refresh<");
  });

  it("shows Load more only when there is a next page", () => {
    expect(view({ conversations: [summary(1)], nextCursor: "abc" })).toContain(">Load more<");
    expect(view({ conversations: [summary(1)], nextCursor: null })).not.toContain("Load more");
  });

  it("shows the empty state, linking to Install, with Refresh", () => {
    const html = view({ conversations: [], nextCursor: null });
    expect(html).toContain("No conversations yet");
    expect(html).toContain(`href="/dashboard/projects/${PROJECT}/install"`);
    expect(html).toContain(">Refresh<");
    expect(html).not.toContain("Load more");
  });

  it("renders a preview as text, never HTML (§9 XSS)", () => {
    const html = view({ conversations: [summary(1, { firstMessagePreview: XSS })], nextCursor: null });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("Load more", () => {
  it("fetches the page after the cursor from the owner route", async () => {
    const page: ListConversationsResponse = { conversations: [summary(1)], nextCursor: null };
    const fetchImpl = vi.fn(async () => Response.json(page));
    const result = await fetchConversationsPage(PROJECT, "a1b2", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, data: page });
    expect(fetchImpl).toHaveBeenCalledWith(`/api/projects/${PROJECT}/conversations?before=a1b2`, {
      method: "GET",
      headers: undefined,
      body: undefined,
    });
  });

  it("returns the route's error message on failure", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: { code: "validation_error", message: "Bad cursor" } }, { status: 400 }),
    );
    const result = await fetchConversationsPage(PROJECT, "zz", fetchImpl as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: false, status: 400, message: "Bad cursor" });
  });

  it("appends the next page under the shown rows, without duplicates", () => {
    const state = { conversations: [summary(3), summary(2)], nextCursor: "c2" };
    const next = appendPage(state, { conversations: [summary(2), summary(1)], nextCursor: null });
    expect(next.conversations.map((c) => c.visitorId)).toEqual(["v3", "v2", "v1"]);
    expect(next.nextCursor).toBeNull();
  });
});

describe("Thread", () => {
  it("labels visitor and bot and keeps the given order", () => {
    const html = renderToStaticMarkup(
      <Thread messages={[message(1, "visitor", "Hello"), message(2, "bot", "Hi there")]} />,
    );
    expect(html.indexOf("Hello")).toBeLessThan(html.indexOf("Hi there"));
    expect(html).toMatch(/data-role="visitor"[^]*>Visitor<[^]*Hello/);
    expect(html).toMatch(/data-role="bot"[^]*>Bot<[^]*Hi there/);
    // Side differs, not only color.
    expect(html).toMatch(/class="[^"]*items-start[^"]*" data-role="visitor"/);
    expect(html).toMatch(/class="[^"]*items-end[^"]*" data-role="bot"/);
    expect(html).toContain('<time dateTime="2026-11-19T10:01:00Z"');
  });

  it("renders a <script> body as text, never HTML, and keeps line breaks (§9 XSS)", () => {
    const html = renderToStaticMarkup(<Thread messages={[message(1, "visitor", `${XSS}\nline two`)]} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;&lt;script&gt;alert(1)&lt;/script&gt;\nline two");
    expect(html).toContain("whitespace-pre-wrap");
  });

  it("says so when there are no messages", () => {
    expect(renderToStaticMarkup(<Thread messages={[]} />)).toContain("This conversation has no messages.");
  });
});

describe("format and paths", () => {
  it("formats short and full times in UTC", () => {
    expect(formatShortTime("2026-11-19T03:58:28Z")).toBe("Nov 19, 03:58");
    expect(formatFullTime("2026-11-19T03:58:28Z")).toBe("Nov 19, 2026, 3:58 AM UTC");
    expect(formatShortTime("nope")).toBe("");
    expect(formatFullTime("nope")).toBe("");
  });

  it("counts messages", () => {
    expect(messageCountLabel(0)).toBe("0 messages");
    expect(messageCountLabel(1)).toBe("1 message");
    expect(messageCountLabel(1234)).toBe("1,234 messages");
  });

  it("builds the list and thread paths", () => {
    expect(conversationsPath("p")).toBe("/dashboard/projects/p/conversations");
    expect(conversationPath("p", "c")).toBe("/dashboard/projects/p/conversations/c");
  });
});
