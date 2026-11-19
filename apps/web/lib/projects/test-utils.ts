// Test fake for supabase-js query chains: every builder method records its call and returns
// the builder; awaiting it (or `.single()` / `.maybeSingle()`) resolves to the queued result.
import { vi } from "vitest";

export type QueryResult = { data: unknown; error: unknown };
export type Call = { method: string; args: unknown[] };

export function fakeQuery(result: QueryResult) {
  const calls: Call[] = [];
  const builder: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return builder;
        };
      },
    },
  );
  return { builder, calls };
}

/**
 * A fake client. `from(table)` and `rpc(fn, args)` take the next queued result for that table
 * or function, in order. Every query's calls are kept for assertions.
 */
export function fakeClient() {
  const queues = new Map<string, QueryResult[]>();
  const queries: { target: string; calls: Call[] }[] = [];

  const next = (target: string, first: Call) => {
    const result = queues.get(target)?.shift();
    if (!result) throw new Error(`fakeClient: no result queued for ${target}`);
    const query = fakeQuery(result);
    query.calls.push(first);
    queries.push({ target, calls: query.calls });
    return query.builder;
  };

  const client = {
    from: vi.fn((table: string) => next(table, { method: "from", args: [table] })),
    rpc: vi.fn((fn: string, args: unknown) => next(`rpc:${fn}`, { method: "rpc", args: [fn, args] })),
  };

  return {
    client,
    queries,
    /** Queue results for a table, or `rpc:<name>` for a function. */
    queue(target: string, ...results: QueryResult[]) {
      queues.set(target, [...(queues.get(target) ?? []), ...results]);
    },
    callsTo(target: string): Call[][] {
      return queries.filter((q) => q.target === target).map((q) => q.calls);
    },
  };
}

export const ok = (data: unknown): QueryResult => ({ data, error: null });
export const fail = (code: string, message: string): QueryResult => ({ data: null, error: { code, message } });
