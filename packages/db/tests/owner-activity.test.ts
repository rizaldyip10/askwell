import type { Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../supabase-pglite";

const OWNER = "user_activity";
const OTHER_OWNER = "user_activity_other";
const CURRENT = "00000000-0000-4000-8000-00000000f001";
const STALE = "00000000-0000-4000-8000-00000000f002";
const LONG_IDLE = "00000000-0000-4000-8000-00000000f003";
const OTHERS = "00000000-0000-4000-8000-00000000f101";

type Row = { project_id: string; messages_used: number };
type Checked = Row & { start_ok: boolean; end_ok: boolean };

/**
 * owner_activity() rows, each with its period checked in SQL against `expected_start`
 * (an SQL expression over the project row `p`), so timestamps never round-trip through JS.
 */
const CHECKED = (expectedStart: string) => /* sql */ `
  select a.project_id, a.messages_used,
         a.period_start = (${expectedStart}) as start_ok,
         a.period_end = (${expectedStart}) + interval '1 month' as end_ok
  from public.owner_activity() a
  join public.projects p on p.id = a.project_id
  order by a.project_id`;

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  // Period starts are relative to now(), so the test means the same whenever it runs.
  await db.pg.exec(`
    insert into public.accounts (clerk_user_id) values ('${OWNER}'), ('${OTHER_OWNER}');
    insert into public.projects (id, owner_id, name, public_key, messages_used, period_start) values
      ('${CURRENT}',   '${OWNER}',       'Current',   'pk_act_current', 7,  now() - interval '3 days'),
      ('${STALE}',     '${OWNER}',       'Stale',     'pk_act_stale',   50, now() - interval '40 days'),
      ('${LONG_IDLE}', '${OWNER}',       'Long idle', 'pk_act_idle',    99, now() - interval '200 days'),
      ('${OTHERS}',    '${OTHER_OWNER}', 'Not mine',  'pk_act_others',  3,  now() - interval '1 day');
  `);
});

afterAll(async () => {
  await db?.close();
});

const asOwner = <T>(sub: string, fn: (tx: Transaction) => Promise<T>) =>
  db.as("authenticated", { sub, role: "authenticated" }, fn);

describe("function settings and grants", () => {
  it("is SECURITY INVOKER, stable, with an empty search_path", async () => {
    const { rows } = await db.pg.query(
      `select prosecdef, provolatile, proconfig from pg_proc
       where pronamespace = 'public'::regnamespace and proname = 'owner_activity'`,
    );
    expect(rows).toEqual([{ prosecdef: false, provolatile: "s", proconfig: ['search_path=""'] }]);
  });

  it("grants EXECUTE to authenticated and service_role, not anon or PUBLIC", async () => {
    const { rows } = await db.pg.query(
      `select r as role, has_function_privilege(r, 'public.owner_activity()', 'execute') as can
       from unnest(array['anon', 'authenticated', 'service_role']) r order by r`,
    );
    expect(rows).toEqual([
      { role: "anon", can: false },
      { role: "authenticated", can: true },
      { role: "service_role", can: true },
    ]);
    const { rows: acl } = await db.pg.query<{ public_can: boolean }>(
      `select exists (
         select 1 from pg_proc, aclexplode(proacl) a
         where oid = 'public.owner_activity()'::regprocedure and a.grantee = 0
       ) as public_can`,
    );
    expect(acl[0]?.public_can).toBe(false);
  });

  it("anon gets permission denied", async () => {
    await expect(db.asAnon("select * from public.owner_activity()")).rejects.toMatchObject({ code: "42501" });
  });

  it("leaves message_period_start service_role only", async () => {
    const { rows } = await db.pg.query(
      `select has_function_privilege('authenticated', 'public.message_period_start(timestamptz, timestamptz)', 'execute') as can`,
    );
    expect(rows).toEqual([{ can: false }]);
  });
});

describe("owner_activity", () => {
  it("returns only the caller's projects", async () => {
    const mine = await db.asOwner<Row>(OWNER, "select project_id from public.owner_activity() order by project_id");
    expect(mine.rows.map((r) => r.project_id)).toEqual([CURRENT, STALE, LONG_IDLE]);

    const theirs = await db.asOwner<Row>(OTHER_OWNER, "select project_id from public.owner_activity()");
    expect(theirs.rows.map((r) => r.project_id)).toEqual([OTHERS]);

    const nobody = await db.asOwner("user_without_projects", "select * from public.owner_activity()");
    expect(nobody.rows).toEqual([]);
  });

  it("a current period shows the stored count and the stored period", async () => {
    const { rows } = await db.asOwner<Checked>(OWNER, CHECKED("p.period_start"));
    expect(rows.find((r) => r.project_id === CURRENT)).toEqual({
      project_id: CURRENT,
      messages_used: 7,
      start_ok: true,
      end_ok: true,
    });
  });

  it("a stale period shows 0 used with the new period's dates", async () => {
    const { rows } = await db.asOwner<Checked>(OWNER, CHECKED("p.period_start + interval '1 month'"));
    expect(rows.find((r) => r.project_id === STALE)).toEqual({
      project_id: STALE,
      messages_used: 0,
      start_ok: true,
      end_ok: true,
    });
  });

  it("a long-idle project gets 0 used and the period that contains now()", async () => {
    // The exact start (several month steps) is checked against message_period_start below.
    const { rows } = await db.asOwner<{ used: number; contains_now: boolean; moved: boolean }>(
      OWNER,
      `select a.messages_used as used,
              a.period_start <= now() and now() < a.period_end as contains_now,
              a.period_start > p.period_start as moved
       from public.owner_activity() a join public.projects p on p.id = a.project_id
       where a.project_id = $1`,
      [LONG_IDLE],
    );
    expect(rows).toEqual([{ used: 0, contains_now: true, moved: true }]);
  });

  it("never writes: the stored count and period stay as they were", async () => {
    await asOwner(OWNER, (tx) => tx.query("select * from public.owner_activity()"));
    const { rows } = await db.pg.query<{ messages_used: number; stale_kept: boolean }>(
      `select messages_used, period_start < now() - interval '1 month' as stale_kept
       from public.projects where id = $1`,
      [STALE],
    );
    expect(rows).toEqual([{ messages_used: 50, stale_kept: true }]);
  });

  it("matches message_period_start, month-end starts included", async () => {
    // Fixed starts, including the clamping cases message_period_start documents. Each one is
    // checked against now(), the time owner_activity uses.
    const starts = [
      "now() - interval '1 month' - interval '1 second'",
      "now() - interval '1 month'",
      "now() - interval '1 month' + interval '1 second'",
      "now() - interval '400 days'",
      "date_trunc('month', now()) - interval '1 day'", // last day of the previous month
      "date_trunc('month', now()) - interval '1 year' - interval '1 day'", // a Dec 31 / month end a year ago
      "'2024-01-31T12:00:00Z'::timestamptz",
      "'2024-02-29T00:00:00Z'::timestamptz",
      "'2025-03-31T23:59:59Z'::timestamptz",
    ];
    const mismatches = await db.as("service_role", { role: "service_role" }, async (tx) => {
      const bad: string[] = [];
      for (const start of starts) {
        await tx.query(`update public.projects set period_start = ${start} where id = $1`, [CURRENT]);
        const { rows } = await tx.query<{ same: boolean }>(
          `select a.period_start = public.message_period_start(p.period_start, now()) as same
           from public.owner_activity() a join public.projects p on p.id = a.project_id
           where a.project_id = $1`,
          [CURRENT],
        );
        if (rows[0]?.same !== true) bad.push(start);
      }
      return bad;
    });
    expect(mismatches).toEqual([]);
  });

  it("service_role sees every project", async () => {
    const { rows } = await db.asService<Row>("select project_id from public.owner_activity() order by project_id");
    expect(rows.map((r) => r.project_id)).toEqual([CURRENT, STALE, LONG_IDLE, OTHERS]);
  });
});
