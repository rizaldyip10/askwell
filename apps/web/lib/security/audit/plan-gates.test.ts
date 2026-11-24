// P6H-T05: project.md §9 "Plan bypass": the plan is read on the server in every gated
// action, never taken from the client. This lists every gated action and checks, in its
// source, that the server-side plan read comes before the gate and the write it guards.
// The routes' own tests check the behaviour (402, plan_limit, knowledge_limit, quota).

import * as shared from "@askwell/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type SourceFile, webSources } from "./source";

type Gate = {
  action: string;
  file: string;
  /** In order: the server-side plan read, the check that uses it, the write it guards. */
  steps: RegExp[];
};

const GATES: Gate[] = [
  {
    action: "POST /api/projects: project limit",
    file: "app/api/projects/route.ts",
    steps: [/readOwnerPlan\(createOwnerClient\(\), userId\)/, /createProjectForOwner\(userId, parsed\.data\.name, plan\)/],
  },
  {
    action: "create_project gets the limit for that plan",
    file: "lib/projects/create-project.ts",
    steps: [/PLAN_LIMITS\[plan\]\.projects/, /p_max_projects: limit/],
  },
  {
    action: "POST /api/projects/:id/knowledge: source limit",
    file: "app/api/projects/[id]/knowledge/route.ts",
    steps: [/readOwnerPlan\(createOwnerClient\(\), userId\)/, /knowledgeLimit\(plan\)/, /reserveKnowledgeSource\(/],
  },
  {
    action: "POST /api/projects/:id/knowledge/upload-url: source limit",
    file: "app/api/projects/[id]/knowledge/upload-url/route.ts",
    steps: [/readOwnerPlan\(createOwnerClient\(\), userId\)/, /knowledgeLimit\(plan\)/, /reserveKnowledgeSource\(/],
  },
  {
    action: "PATCH /api/projects/:id/config: Pro only (402)",
    file: "app/api/projects/[id]/config/route.ts",
    steps: [/readOwnerPlan\(owner, userId\)/, /PLAN_LIMITS\[plan\]\.customWidget/, /updateWidgetConfig\(/],
  },
  {
    action: "GET /api/widget/config and /embed: plan-applied config (Free: defaults + badge)",
    file: "lib/widget/config.ts",
    steps: [/toPlan\(data\.accounts\?\.plan\)/, /applyPlanToWidgetConfig\(/],
  },
  {
    action: "POST /api/widget/chat: the owner's plan from the database",
    file: "lib/chat/db.ts",
    steps: [/select\("id, owner_id, accounts\(plan\)"\)/, /plan: toPlan\(data\.accounts\?\.plan\)/],
  },
  {
    action: "POST /api/widget/chat: monthly message quota",
    file: "app/api/widget/chat/route.ts",
    steps: [/getChatProject\(key\)/, /PLAN_LIMITS\[project\.plan\]\.messagesPerMonth/, /consumeMessage\(projectId, maxMessages\)/],
  },
];

let sources: SourceFile[];
const source = (path: string) => {
  const file = sources.find((f) => f.path === path);
  if (!file) throw new Error(`missing ${path}`);
  return file.code;
};

beforeAll(async () => {
  sources = await webSources();
});

describe("every gated action reads the plan on the server first", () => {
  it.each(GATES.map((g) => [g.action, g] as const))("%s", (_action, gate) => {
    const code = source(gate.file);
    const positions = gate.steps.map((step) => code.search(step));
    expect(positions.every((p) => p >= 0), `${gate.file}: ${gate.steps.filter((_, i) => positions[i]! < 0).join(", ")}`).toBe(true);
    expect([...positions].sort((a, b) => a - b), gate.file).toEqual(positions);
  });

  it("readOwnerPlan reads accounts.plan with the owner client and falls back to free", () => {
    const code = source("lib/projects/create-project.ts");
    expect(code).toMatch(/owner\.from\("accounts"\)\.select\("plan"\)/);
    expect(code).toMatch(/\?\? "free"/);
  });

  it("the routes that use the plan for a limit or gate are exactly these (a new one must be added here)", () => {
    const uses = sources
      .filter((f) => f.path.startsWith("app/api/") && /PLAN_LIMITS|readOwnerPlan|knowledgeLimit\(/.test(f.code))
      .map((f) => f.path);
    expect(uses).toEqual(GATES.map((g) => g.file).filter((f) => f.startsWith("app/api/")).sort());
  });
});

describe("the client never supplies the plan", () => {
  it("no request schema in @askwell/shared has a plan field", () => {
    const withPlan = Object.entries(shared)
      .filter(([name]) => /Schema$/.test(name))
      .filter(([, value]) => {
        const shape = (value as { shape?: Record<string, unknown> } | null)?.shape;
        return shape !== undefined && Object.keys(shape).some((key) => /plan/i.test(key));
      })
      .map(([name]) => name);
    expect(withPlan).toEqual([]);
  });

  it("no route or server code reads a plan from the request body, query, headers or cookies", () => {
    const reads = sources
      .filter((f) =>
        /(body|data|params|searchParams|query)\??\.plan\b|searchParams\.get\(["']plan["']\)|headers\.get\(["'][^"']*plan|cookies\(\)[^;]*plan/i.test(f.code),
      )
      .map((f) => f.path);
    // Not the request: create-project.ts reads `data?.plan` from the accounts row, and
    // billing/plan.ts reads a Clerk billing event only after its signature is verified.
    expect(reads).toEqual(["lib/billing/plan.ts", "lib/projects/create-project.ts"]);
  });

  it("nothing gates on Clerk's client-side has({ plan })", () => {
    expect(sources.filter((f) => /\bhas\(\s*\{\s*plan/.test(f.code)).map((f) => f.path)).toEqual([]);
  });
});
