import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const captureServer = vi.fn();
vi.mock("./server", () => ({ captureServer: (...args: unknown[]) => captureServer(...args) }));

const { trackKnowledgeAdded, trackProjectCreated, trackSignedUp, trackUpgraded } = await import("./owner-events");

const USER = "user_owner";
const PROJECT = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";

beforeEach(() => {
  captureServer.mockReset();
});

describe("owner funnel events", () => {
  it("signed_up: the owner's Clerk ID, no props", () => {
    trackSignedUp(USER);
    expect(captureServer.mock.calls).toEqual([["signed_up", USER]]);
  });

  it("project_created: project_id and plan", () => {
    trackProjectCreated(USER, PROJECT, "free");
    expect(captureServer.mock.calls).toEqual([["project_created", USER, { project_id: PROJECT, plan: "free" }]]);
  });

  it("knowledge_added: project_id and source_type", () => {
    trackKnowledgeAdded(USER, PROJECT, "pdf");
    expect(captureServer.mock.calls).toEqual([["knowledge_added", USER, { project_id: PROJECT, source_type: "pdf" }]]);
  });

  it("upgraded: the owner's Clerk ID and the new plan (ready for the Phase 5 webhook)", () => {
    trackUpgraded(USER);
    expect(captureServer.mock.calls).toEqual([["upgraded", USER, { plan: "pro" }]]);
  });
});

it("never throws into the caller, even if captureServer does", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  captureServer.mockImplementation(() => {
    throw new Error("posthog down");
  });
  expect(() => trackSignedUp(USER)).not.toThrow();
  expect(() => trackProjectCreated(USER, PROJECT, "pro")).not.toThrow();
  expect(() => trackKnowledgeAdded(USER, PROJECT, "text")).not.toThrow();
  expect(() => trackUpgraded(USER)).not.toThrow();
});
