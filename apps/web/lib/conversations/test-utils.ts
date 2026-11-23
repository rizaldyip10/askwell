// In-memory stand-in for the PostgREST `conversations` list query that listConversations
// builds: it applies the `project_id` filter, the `before` cursor (`or` filter), the order and
// the limit to a fixed set of rows, so paging tests check real gaps and repeats.
// Only the calls listConversations makes are supported; anything else throws.
import { vi } from "vitest";
import type { Call } from "../projects/test-utils";

export type FakeConversation = {
  id: string;
  project_id: string;
  visitor_id: string;
  created_at: string;
  preview: { body: string }[];
  stats: { count: number }[];
};

const OR_PATTERN = /^created_at\.lt\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.lt\.([0-9a-f-]+)\)$/;

export function fakeConversationsDb(rows: FakeConversation[]) {
  const queries: Call[][] = [];

  const from = vi.fn((table: string) => {
    if (table !== "conversations") throw new Error(`fakeConversationsDb: unexpected table ${table}`);
    const calls: Call[] = [{ method: "from", args: [table] }];
    queries.push(calls);
    const builder: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown) => Promise.resolve(run(calls)).then(resolve);
          }
          return (...args: unknown[]) => {
            calls.push({ method: String(prop), args });
            return builder;
          };
        },
      },
    );
    return builder;
  });

  function run(calls: Call[]) {
    let result = [...rows];
    let limit = Infinity;
    const order: [string, boolean][] = [];
    for (const { method, args } of calls) {
      const opts = (args[1] ?? {}) as { referencedTable?: string; ascending?: boolean };
      if (opts.referencedTable) continue; // embed options: the fixture rows are already shaped
      if (method === "from" || method === "select") continue;
      if (method === "eq") {
        const [column, value] = args as [string, string];
        if (column.includes(".")) continue; // embed filter (preview.role)
        result = result.filter((r) => r[column as keyof FakeConversation] === value);
      } else if (method === "or") {
        const match = OR_PATTERN.exec(String(args[0]));
        if (!match) throw new Error(`fakeConversationsDb: unsupported or filter ${String(args[0])}`);
        const [, lt, eq, id] = match as unknown as [string, string, string, string];
        result = result.filter((r) => r.created_at < lt || (r.created_at === eq && r.id < id));
      } else if (method === "order") {
        order.push([String(args[0]), opts.ascending !== false]);
      } else if (method === "limit") {
        limit = Number(args[0]);
      } else {
        throw new Error(`fakeConversationsDb: unsupported call ${method}`);
      }
    }
    result.sort((a, b) => {
      for (const [column, ascending] of order) {
        const x = String(a[column as keyof FakeConversation]);
        const y = String(b[column as keyof FakeConversation]);
        if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    return { data: result.slice(0, limit), error: null };
  }

  return { client: { from }, queries };
}

/** `n` conversations of one project, several sharing a created_at (ties broken by id). */
export function conversationRows(projectId: string, n: number): FakeConversation[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    project_id: projectId,
    visitor_id: `visitor_${i}`,
    // Every 3 conversations share a timestamp, and the fixture order is not the sort order.
    created_at: `2026-11-${String(10 + Math.floor(i / 30)).padStart(2, "0")}T00:00:${String(Math.floor(i / 3) % 10).padStart(2, "0")}.123456+00:00`,
    preview: [{ body: `Question ${i}` }],
    stats: [{ count: 2 }],
  }));
}
