// P6H-T05: project.md §9 "Tenant leak". Owner reads use the owner client (RLS); the service
// client is never used with a manual owner filter, and owner routes use it only after the
// ownership check. This is the inventory of every service-client call site: a new one fails
// the first test until it is added here with its check.

import { beforeAll, describe, expect, it } from "vitest";
import { type SourceFile, webSources } from "./source";

type CallSite = {
  /** Why the service client is allowed here. */
  why: string;
  /** For owner routes: the ownership check that must come before the first createServiceClient(). */
  guard?: RegExp;
};

const CALL_SITES: Record<string, CallSite> = {
  // Owner routes: ownership is proven through the owner client (RLS) first.
  "app/api/projects/[id]/knowledge/route.ts": {
    why: "paste: reserve the source + process (owners can't write knowledge_sources)",
    guard: /checkOwnedProjectRequest\(request, context, pasteKnowledgeRequestSchema\)[\s\S]*?if \(checked instanceof Response\) return checked;/,
  },
  "app/api/projects/[id]/knowledge/upload-url/route.ts": {
    why: "reserve the source + one-time signed upload URL",
    guard: /checkOwnedProjectRequest\(request, context, knowledgeUploadUrlRequestSchema\)[\s\S]*?if \(checked instanceof Response\) return checked;/,
  },
  "app/api/projects/[id]/knowledge/finalize/route.ts": {
    why: "claim the uploading source of this project, download, process",
    guard: /checkOwnedProjectRequest\(request, context, finalizeKnowledgeRequestSchema\)[\s\S]*?if \(checked instanceof Response\) return checked;/,
  },
  "app/api/knowledge/[id]/route.ts": {
    why: "remove the file and the source row",
    guard: /createOwnerClient\(\)\s*\.from\("knowledge_sources"\)[\s\S]*?if \(!source\) return sourceNotFound\(\);/,
  },
  "app/api/projects/[id]/route.ts": {
    why: "remove the deleted project's files from Storage",
    guard: /owner\.from\("projects"\)\.delete\(\)\.eq\("id", id\)[\s\S]*?if \(data\.length === 0\) return notFound\(\);/,
  },
  "app/api/projects/[id]/config/route.ts": {
    why: "write widget_configs (owners have no write grant)",
    guard: /owner\.from\("projects"\)\.select\("id"\)\.eq\("id", projectId\)[\s\S]*?if \(!project\) return notFound\(\);/,
  },
  // Server helpers, called with the session's user ID or after a route's checks.
  "lib/projects/create-project.ts": { why: "create_project RPC, owner_id = the session's user ID (POST /api/projects)" },
  "lib/accounts/ensure-account.ts": { why: "insert the session user's accounts row (owners have no write grant)" },
  "lib/billing/sync-plan.ts": { why: "set accounts.plan from Clerk, after the webhook signature check" },
  "lib/knowledge/process.ts": { why: "chunks + status for a source the calling route already checked" },
  // Public widget routes: the project comes from its public key only (§9 "Public key abuse").
  "lib/widget/config.ts": { why: "plan-applied config by public key (GET /api/widget/config, /embed)" },
  "lib/chat/db.ts": { why: "project by public key, quota, chunk search, save turn (POST /api/widget/chat)" },
};

let sources: SourceFile[];
let callers: SourceFile[];

beforeAll(async () => {
  sources = await webSources();
  callers = sources.filter((f) => f.path !== "lib/supabase/service.ts" && /createServiceClient\(\)/.test(f.code));
});

describe("service-client inventory", () => {
  it("every file that creates a service client is listed here", () => {
    expect(callers.map((f) => f.path).sort()).toEqual(Object.keys(CALL_SITES).sort());
  });

  it("no client component, page or layout creates one directly", () => {
    const offenders = sources
      .filter((f) => /^\s*["']use client["']/.test(f.code) || /\/(page|layout)\.tsx$/.test(f.path))
      .filter((f) => /createServiceClient|supabase\/service/.test(f.code))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it.each(Object.entries(CALL_SITES).filter(([, site]) => site.guard))(
    "%s checks ownership through the owner client before its first service client",
    (path, site) => {
      const code = sources.find((f) => f.path === path)?.code ?? "";
      const guard = site.guard!.exec(code);
      const firstService = code.search(/createServiceClient\(\)/);
      expect(guard, "ownership check not found").not.toBeNull();
      // The whole guard, up to and including its early return, ends before the service client.
      expect(guard!.index + guard![0].length).toBeLessThanOrEqual(firstService);
    },
  );

  it("checkOwnedProjectRequest checks the session, then reads the project with the owner client (RLS)", () => {
    const code = sources.find((f) => f.path === "lib/knowledge/routes.ts")?.code ?? "";
    const body = code.slice(code.indexOf("export async function checkOwnedProjectRequest"));
    expect(body.search(/if \(!userId\) return unauthorized\(\);/)).toBeGreaterThan(0);
    expect(body.search(/getOwnedProject\(params\.data\.id\)/)).toBeGreaterThan(body.search(/unauthorized\(\)/));
    expect(body).toMatch(/if \(!project\) return notFound\(\);/);
    const owned = sources.find((f) => f.path === "lib/projects/owned-project.ts")?.code ?? "";
    expect(owned).toMatch(/const db = client \?\? createOwnerClient\(\);/);
  });
});

/**
 * Every query chain on a service client in these files, `<client>.from(...)...;`. The service
 * clients are named `service`, `db`, `client`, `supabase` or created inline; owner clients
 * are named `owner`, so readOwnerPlan's owner read in create-project.ts isn't one of them.
 */
/**
 * True if a query chain filters on owner_id: `.eq("owner_id", …)` and the other column
 * filters, a PostgREST filter string (`.or("owner_id.eq.…")`), or `.match({ owner_id: … })`.
 */
function hasOwnerFilter(chain: string): boolean {
  return (
    /\.(eq|neq|match|filter|in|is|or|contains|like|ilike)\(\s*["'`][^"'`]*owner_id/.test(chain) ||
    /\.match\(\s*\{[^}]*\bowner_id\b/.test(chain)
  );
}

const serviceChains = (file: SourceFile) =>
  [...file.code.matchAll(/(?:\b(?:service|db|client|supabase)|createServiceClient\(\))\s*\.(?:from|rpc)\([^;]*;/g)].map((m) => m[0]);

describe("no service-client read with a manual owner filter", () => {
  it("finds the service-client chains (so the checks below see real code)", () => {
    expect(callers.flatMap(serviceChains).length).toBeGreaterThan(15);
  });

  it.each([
    'service.from("projects").select("id").eq("owner_id", userId);',
    'service.from("projects").select("id").match({ owner_id: userId });',
    'db.from("projects").select("id").match({ id, "owner_id": userId });',
    'service.from("projects").select("id").or(`owner_id.eq.${userId}`);',
    'service.from("projects").select("id").filter("owner_id", "eq", userId);',
  ])("the owner-filter check catches %s", (chain) => {
    expect(hasOwnerFilter(chain)).toBe(true);
  });

  it.each([
    'service.from("projects").select("id, owner_id, accounts(plan)").eq("public_key", publicKey);',
    'service.from("projects").select("id").match({ public_key: key });',
    'service.rpc("create_project", { p_owner_id: userId });',
  ])("the owner-filter check allows %s", (chain) => {
    expect(hasOwnerFilter(chain)).toBe(false);
  });

  it("no service-client chain filters on owner_id", () => {
    const offenders = callers.flatMap((f) => serviceChains(f).filter(hasOwnerFilter).map(() => f.path));
    expect(offenders).toEqual([]);
  });

  it("the only service-client chain on clerk_user_id is the webhook's plan write, plus ensureAccount's insert (no read)", () => {
    const uses = callers.flatMap((f) => serviceChains(f).filter((chain) => /clerk_user_id/.test(chain)).map((chain) => [f.path, chain] as const));
    expect(uses.map(([path]) => path).sort()).toEqual(["lib/accounts/ensure-account.ts", "lib/billing/sync-plan.ts"]);
    for (const [path, chain] of uses) {
      expect(chain, path).toMatch(/\.(update|upsert)\(/);
      expect(chain, path).not.toMatch(/\.select\("(?!plan"|clerk_user_id")/);
    }
  });

  it("owner reads go through the owner client: the owner pages and read helpers never import the service client", () => {
    const ownerReaders = sources.filter(
      (f) => f.path.startsWith("app/dashboard/") || ["lib/conversations/read.ts", "lib/usage/get-usage.ts", "lib/projects/owned-project.ts"].includes(f.path),
    );
    expect(ownerReaders.length).toBeGreaterThan(5);
    expect(ownerReaders.filter((f) => /supabase\/service|createServiceClient/.test(f.code)).map((f) => f.path)).toEqual([]);
  });

  it("chunk search is scoped to one project (match_chunks gets the project id)", () => {
    const code = callers.find((f) => f.path === "lib/chat/db.ts")?.code ?? "";
    expect(code).toMatch(/rpc\("match_chunks", \{[^}]*p_project_id: projectId/);
  });
});
