import { describe, expect, it } from "vitest";
import { toProject } from "./to-project";

describe("toProject", () => {
  it("maps snake_case to the shared Project, without owner_id", () => {
    const project = toProject({
      id: "p1",
      owner_id: "user_a",
      name: "Site",
      public_key: "pk_x",
      messages_used: 3,
      period_start: "2026-11-01T00:00:00Z",
      created_at: "2026-11-02T00:00:00Z",
    });
    expect(project).toEqual({
      id: "p1",
      name: "Site",
      publicKey: "pk_x",
      messagesUsed: 3,
      periodStart: "2026-11-01T00:00:00Z",
      createdAt: "2026-11-02T00:00:00Z",
    });
    expect(project).not.toHaveProperty("ownerId");
  });
});
