import type { Transaction } from "@electric-sql/pglite";
import { pageinspect } from "@electric-sql/pglite/contrib/pageinspect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "../../shared/src/plans";
import { createTestDb, type TestDb } from "../supabase-pglite";

const OWNER = "user_chat";
const PROJECT = "00000000-0000-4000-8000-00000000d001";
const OTHER_PROJECT = "00000000-0000-4000-8000-00000000d002";
const MISSING_PROJECT = "00000000-0000-4000-8000-00000000dfff";
const FREE_MAX = PLAN_LIMITS.free.messagesPerMonth;
const PRO_MAX = PLAN_LIMITS.pro.messagesPerMonth;

const CONSUME = "select public.consume_message(p_project_id => $1, p_max_messages => $2) as used";
const BELONGS = "select public.conversation_belongs(p_project_id => $1, p_conversation_id => $2) as belongs";
const SAVE = /* sql */ `
  select public.save_chat_turn(
    p_project_id => $1, p_conversation_id => $2, p_visitor_id => $3, p_visitor_message => $4, p_bot_reply => $5
  ) as id`;

type Usage = { messages_used: number; period_start: string };

const consume = async (tx: Transaction, max: number, project = PROJECT) =>
  (await tx.query<{ used: number }>(CONSUME, [project, max])).rows[0]?.used;

const belongs = async (tx: Transaction, conversation: string | null, project = PROJECT) =>
  (await tx.query<{ belongs: boolean }>(BELONGS, [project, conversation])).rows[0]?.belongs;

const save = async (
  tx: Transaction,
  conversation: string | null,
  { project = PROJECT, visitor = "visitor_1", message = "Hi?", reply = "Hello!" } = {},
) => (await tx.query<{ id: string }>(SAVE, [project, conversation, visitor, message, reply])).rows[0]?.id;

const usage = async (tx: Transaction, project = PROJECT) =>
  (
    await tx.query<Usage>("select messages_used, period_start from public.projects where id = $1", [project])
  ).rows[0];

/** Set the project's counter and period start, `ago` before now() (the transaction time). */
const setUsage = (tx: Transaction, used: number, ago = "0", project = PROJECT) =>
  tx.query("update public.projects set messages_used = $2, period_start = now() - $3::interval where id = $1", [
    project,
    used,
    ago,
  ]);

/** Run `fn` inside a savepoint, roll back to it, and return the error it threw (or null). */
async function caught(tx: Transaction, fn: () => Promise<unknown>): Promise<{ code?: string; message: string } | null> {
  await tx.exec("savepoint attempt");
  try {
    await fn();
    await tx.exec("release savepoint attempt");
    return null;
  } catch (err) {
    await tx.exec("rollback to savepoint attempt");
    return err as { code?: string; message: string };
  }
}

const asService = <T>(fn: (tx: Transaction) => Promise<T>) => db.as("service_role", { role: "service_role" }, fn);

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pg.exec(`
    insert into public.accounts (clerk_user_id) values ('${OWNER}');
    insert into public.projects (id, owner_id, name, public_key) values
      ('${PROJECT}', '${OWNER}', 'Mine', 'pk_chat_mine'),
      ('${OTHER_PROJECT}', '${OWNER}', 'Other', 'pk_chat_other');
  `);
});

afterAll(async () => {
  await db?.close();
});

describe("function settings and grants", () => {
  it("all three are SECURITY INVOKER with an empty search_path", async () => {
    const { rows } = await db.pg.query<{ proname: string; prosecdef: boolean; provolatile: string; proconfig: string[] }>(
      `select proname, prosecdef, provolatile, proconfig from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname in ('consume_message', 'conversation_belongs', 'save_chat_turn')
       order by proname`,
    );
    expect(rows).toEqual([
      { proname: "consume_message", prosecdef: false, provolatile: "v", proconfig: ['search_path=""'] },
      { proname: "conversation_belongs", prosecdef: false, provolatile: "s", proconfig: ['search_path=""'] },
      { proname: "save_chat_turn", prosecdef: false, provolatile: "v", proconfig: ['search_path=""'] },
    ]);
  });

  it.each([
    ["public.consume_message(uuid, integer)"],
    ["public.conversation_belongs(uuid, uuid)"],
    ["public.save_chat_turn(uuid, uuid, text, text, text)"],
  ])("grants EXECUTE on %s to service_role only", async (fn) => {
    const { rows } = await db.pg.query<{ role: string; can: boolean }>(
      `select r as role, has_function_privilege(r, $1, 'execute') as can
       from unnest(array['anon', 'authenticated', 'service_role']) r order by r`,
      [fn],
    );
    expect(rows).toEqual([
      { role: "anon", can: false },
      { role: "authenticated", can: false },
      { role: "service_role", can: true },
    ]);
  });

  it("anon and authenticated get permission denied", async () => {
    for (const [role, claims] of [
      ["anon", {}],
      ["authenticated", { sub: OWNER, role: "authenticated" }],
    ] as const) {
      const errors = await db.as(role, claims, async (tx) => ({
        consume: await caught(tx, () => consume(tx, FREE_MAX)),
        belongs: await caught(tx, () => belongs(tx, null)),
        save: await caught(tx, () => save(tx, null)),
      }));
      expect(errors.consume?.message, role).toMatch(/permission denied for function consume_message/);
      expect(errors.belongs?.message, role).toMatch(/permission denied for function conversation_belongs/);
      expect(errors.save?.message, role).toMatch(/permission denied for function save_chat_turn/);
    }
  });
});

describe("consume_message", () => {
  it("counts each message and returns the new count", async () => {
    const result = await asService(async (tx) => {
      const counts = [await consume(tx, FREE_MAX), await consume(tx, FREE_MAX), await consume(tx, FREE_MAX)];
      return { counts, after: await usage(tx) };
    });
    expect(result.counts).toEqual([1, 2, 3]);
    expect(result.after?.messages_used).toBe(3);
  });

  it("passes at limit - 1, then raises P0001 quota_exceeded at the limit and writes nothing", async () => {
    const result = await asService(async (tx) => {
      await setUsage(tx, FREE_MAX - 1);
      const last = await consume(tx, FREE_MAX);
      const before = await usage(tx);
      const err = await caught(tx, () => consume(tx, FREE_MAX));
      const again = await caught(tx, () => consume(tx, FREE_MAX));
      return { last, err, again, before, after: await usage(tx) };
    });
    expect(result.last).toBe(FREE_MAX);
    expect(result.err).toMatchObject({ code: "P0001", message: "quota_exceeded" });
    expect(result.again).toMatchObject({ code: "P0001", message: "quota_exceeded" });
    expect(result.after).toEqual(result.before);
    expect(result.after?.messages_used).toBe(FREE_MAX);
  });

  it("uses the limit it is given (Pro) and counts only this project", async () => {
    const result = await asService(async (tx) => {
      await setUsage(tx, FREE_MAX);
      await setUsage(tx, PRO_MAX, "0", OTHER_PROJECT);
      return {
        pro: await consume(tx, PRO_MAX),
        other: await caught(tx, () => consume(tx, PRO_MAX, OTHER_PROJECT)),
      };
    });
    expect(result.pro).toBe(FREE_MAX + 1);
    expect(result.other).toMatchObject({ code: "P0001", message: "quota_exceeded" });
  });

  it("a limit of 0 refuses every message", async () => {
    const result = await asService((tx) => caught(tx, () => consume(tx, 0)));
    expect(result).toMatchObject({ code: "P0001", message: "quota_exceeded" });
  });

  it("fails with P0002 for an unknown project", async () => {
    const result = await asService((tx) => caught(tx, () => consume(tx, FREE_MAX, MISSING_PROJECT)));
    expect(result).toMatchObject({ code: "P0002", message: "project_not_found" });
  });

  it("rejects a null or negative limit", async () => {
    for (const max of [null, -1]) {
      const result = await asService((tx) => caught(tx, () => consume(tx, max as unknown as number)));
      expect(result, String(max)).toMatchObject({ code: "22023" });
    }
  });
});

describe("consume_message monthly reset", () => {
  /**
   * At the limit with period_start `ago` before now(), call once. `months` is how many whole
   * months period_start should move. Returns the error (or null), the new count, and whether
   * period_start = old + `months` months with now() inside that new period.
   * (Expectations use now() - ago in SQL, since "now() - 1 month" is clamped near month-ends.)
   */
  const atLimit = (ago: string, months: number) =>
    asService(async (tx) => {
      await setUsage(tx, FREE_MAX, ago);
      const err = await caught(tx, () => consume(tx, FREE_MAX));
      const { rows } = await tx.query<{ used: number; stepped: boolean; current: boolean }>(
        `select p.messages_used as used,
                p.period_start = (now() - $2::interval) + make_interval(months => $3) as stepped,
                p.period_start <= now() and now() < p.period_start + interval '1 month' as current
         from public.projects p where p.id = $1`,
        [PROJECT, ago, months],
      );
      return { err, ...rows[0] };
    });

  it("keeps counting inside the month (27 days in)", async () => {
    const result = await atLimit("27 days", 0);
    expect(result).toMatchObject({ used: FREE_MAX, stepped: true, current: true });
    expect(result.err).toMatchObject({ code: "P0001", message: "quota_exceeded" });
  });

  it("resets to 1 and moves period_start one month on, once a month has passed", async () => {
    const result = await atLimit("1 month", 1);
    expect(result).toEqual({ err: null, used: 1, stepped: true, current: true });
  });

  it("steps period_start by whole months after a long idle time, so it doesn't drift", async () => {
    const result = await atLimit("7 months 3 days 4 hours", 7);
    expect(result).toEqual({ err: null, used: 1, stepped: true, current: true });
  });

  it("then counts normally in the new period", async () => {
    const result = await asService(async (tx) => {
      await setUsage(tx, FREE_MAX, "2 months 1 day");
      return [await consume(tx, FREE_MAX), await consume(tx, FREE_MAX)];
    });
    expect(result).toEqual([1, 2]);
  });

  it("does not reset when the call raises: a failed call rolls back with nothing written", async () => {
    const result = await asService(async (tx) => {
      await setUsage(tx, FREE_MAX, "2 months");
      const before = await usage(tx);
      const err = await caught(tx, () => consume(tx, 0));
      return { err, before, after: await usage(tx) };
    });
    expect(result.err).toMatchObject({ code: "P0001", message: "quota_exceeded" });
    expect(result.after).toEqual(result.before);
  });
});

// pglite is a single connection, so two calls can't run at once. Instead, check the lock the
// call leaves on the project row. SELECT ... FOR UPDATE marks the tuple with HEAP_KEYS_UPDATED,
// and the UPDATE that follows in the same transaction keeps that flag on the old row version.
// A read-then-update without the lock (or a plain UPDATE) only takes a no-key update lock, so
// two transactions at limit - 1 could both read the old count and both pass.
describe("consume_message row lock", () => {
  let lockDb: TestDb;

  beforeAll(async () => {
    lockDb = await createTestDb({ extensions: { pageinspect } });
    await lockDb.pg.exec(`
      create extension pageinspect;
      insert into public.accounts (clerk_user_id) values ('${OWNER}');
      insert into public.projects (id, owner_id, name, public_key) values ('${PROJECT}', '${OWNER}', 'Mine', 'pk_chat_lock');
    `);
  });

  afterAll(async () => {
    await lockDb?.close();
  });

  /** Run `change`, then return the lock flags on the project's row version from before it. */
  const oldVersionFlags = (tx: Transaction, change: () => Promise<unknown>) =>
    (async () => {
      const { rows: before } = await tx.query<{ ctid: string }>("select ctid::text from public.projects where id = $1", [
        PROJECT,
      ]);
      await change();
      await tx.exec("reset role");
      const { rows } = await tx.query<{ flags: string[]; mine: boolean }>(
        `with t as (select $1::tid as ctid)
         select f.raw_flags as flags, h.t_xmax = pg_current_xact_id()::xid as mine
         from t,
           heap_page_items(get_raw_page('public.projects', (t.ctid::text::point)[0]::int)) h,
           heap_tuple_infomask_flags(h.t_infomask, h.t_infomask2) f
         where h.lp = (t.ctid::text::point)[1]::int`,
        [before[0]?.ctid],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.mine).toBe(true);
      return rows[0]?.flags ?? [];
    })();

  it("reads the count under FOR UPDATE on the project row", async () => {
    const flags = await lockDb.as("service_role", { role: "service_role" }, (tx) =>
      oldVersionFlags(tx, () => consume(tx, FREE_MAX)),
    );
    expect(flags).toContain("HEAP_KEYS_UPDATED");
  });

  it("control: a plain counter update doesn't take that lock", async () => {
    const flags = await lockDb.pg.transaction(async (tx) => {
      const result = await oldVersionFlags(tx, () =>
        tx.query("update public.projects set messages_used = messages_used + 1 where id = $1", [PROJECT]),
      );
      await tx.rollback();
      return result;
    });
    expect(flags).not.toContain("HEAP_KEYS_UPDATED");
  });
});

describe("conversation_belongs", () => {
  it("is true for this project's conversation only", async () => {
    const result = await asService(async (tx) => {
      const mine = await save(tx, null);
      const theirs = await save(tx, null, { project: OTHER_PROJECT });
      return {
        mine: await belongs(tx, mine!),
        theirs: await belongs(tx, theirs!),
        unknown: await belongs(tx, "00000000-0000-4000-8000-0000000000ff"),
        none: await belongs(tx, null),
      };
    });
    expect(result).toEqual({ mine: true, theirs: false, unknown: false, none: false });
  });
});

describe("save_chat_turn", () => {
  it("creates a conversation for this project and visitor on the first message", async () => {
    const result = await asService(async (tx) => {
      const id = await save(tx, null, { visitor: "visitor_new" });
      const { rows } = await tx.query("select project_id, visitor_id from public.conversations where id = $1", [id]);
      return { id, rows };
    });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.rows).toEqual([{ project_id: PROJECT, visitor_id: "visitor_new" }]);
  });

  it("adds to the given conversation and returns its id, without a new conversation", async () => {
    const result = await asService(async (tx) => {
      const first = await save(tx, null);
      const second = await save(tx, first!, { message: "And?", reply: "More." });
      const { rows } = await tx.query<{ conversations: number; messages: number }>(
        `select (select count(*)::int from public.conversations where project_id = $1) as conversations,
                (select count(*)::int from public.messages where conversation_id = $2) as messages`,
        [PROJECT, first],
      );
      return { first, second, ...rows[0] };
    });
    expect(result.second).toBe(result.first);
    expect(result).toMatchObject({ conversations: 1, messages: 4 });
  });

  it("refuses another project's conversation with P0002 conversation_not_found and writes nothing", async () => {
    const result = await asService(async (tx) => {
      const theirs = await save(tx, null, { project: OTHER_PROJECT });
      const err = await caught(tx, () => save(tx, theirs!));
      const unknown = await caught(tx, () => save(tx, "00000000-0000-4000-8000-0000000000ff"));
      const { rows } = await tx.query<{ conversations: number; messages: number }>(
        `select (select count(*)::int from public.conversations) as conversations,
                (select count(*)::int from public.messages) as messages`,
      );
      return { err, unknown, ...rows[0] };
    });
    expect(result.err).toMatchObject({ code: "P0002", message: "conversation_not_found" });
    expect(result.unknown).toMatchObject({ code: "P0002", message: "conversation_not_found" });
    expect(result).toMatchObject({ conversations: 1, messages: 2 });
  });

  it("saves the visitor message before the bot reply, in created_at order, turn after turn", async () => {
    const { rows, distinct } = await asService(async (tx) => {
      const id = await save(tx, null, { message: "Q1", reply: "A1" });
      await save(tx, id!, { message: "Q2", reply: "A2" });
      // Turns in one transaction (and pglite's millisecond clock) would tie without the
      // "after the latest message" rule, so this also checks every time is distinct.
      const ordered = await tx.query<{ role: string; body: string }>(
        "select role, body from public.messages where conversation_id = $1 order by created_at",
        [id],
      );
      const times = await tx.query<{ n: number }>(
        "select count(distinct created_at)::int as n from public.messages where conversation_id = $1",
        [id],
      );
      return { rows: ordered.rows, distinct: times.rows[0]?.n };
    });
    expect(distinct).toBe(4);
    expect(rows).toEqual([
      { role: "visitor", body: "Q1" },
      { role: "bot", body: "A1" },
      { role: "visitor", body: "Q2" },
      { role: "bot", body: "A2" },
    ]);
  });

  it("gives the two messages of a turn distinct times, visitor first", async () => {
    const result = await asService(async (tx) => {
      const id = await save(tx, null);
      const { rows } = await tx.query<{ ordered: boolean }>(
        `select v.created_at < b.created_at as ordered
         from public.messages v, public.messages b
         where v.conversation_id = $1 and b.conversation_id = $1 and v.role = 'visitor' and b.role = 'bot'`,
        [id],
      );
      return rows;
    });
    expect(result).toEqual([{ ordered: true }]);
  });

  it("fails on an unknown project when creating a conversation", async () => {
    const result = await asService((tx) => caught(tx, () => save(tx, null, { project: MISSING_PROJECT })));
    expect(result).toMatchObject({ code: "23503" });
  });
});
