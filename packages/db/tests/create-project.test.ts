import type { Transaction } from "@electric-sql/pglite";
import { pageinspect } from "@electric-sql/pglite/contrib/pageinspect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "../../shared/src/plans";
import { DEFAULT_WIDGET_CONFIG } from "../../shared/src/widget";
import { createTestDb, type TestDb } from "../supabase-pglite";

const OWNER = "user_create";
const OTHER = "user_other";
const FREE_MAX = PLAN_LIMITS.free.projects;
const PRO_MAX = PLAN_LIMITS.pro.projects;

const CALL = /* sql */ `
  select * from public.create_project(
    p_owner_id => $1, p_name => $2, p_public_key => $3, p_max_projects => $4,
    p_button_color => $5, p_position => $6, p_label => $7, p_animation => $8,
    p_header_text => $9, p_show_badge => $10
  )`;

type ProjectRow = { id: string; owner_id: string; name: string; public_key: string; messages_used: number };

let keySeq = 0;
const nextKey = () => `pk_test${String(++keySeq).padStart(16, "0")}`;

function params(owner: string, max: number, key = nextKey(), name = "My site"): unknown[] {
  const c = DEFAULT_WIDGET_CONFIG;
  return [owner, name, key, max, c.buttonColor, c.position, c.label, c.animation, c.headerText, c.showBadge];
}

const create = async (tx: Transaction, owner: string, max: number, key?: string) =>
  (await tx.query<ProjectRow>(CALL, params(owner, max, key))).rows[0];

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
  await db.pg.exec(`insert into public.accounts (clerk_user_id) values ('${OWNER}'), ('${OTHER}')`);
});

afterAll(async () => {
  await db?.close();
});

describe("create_project", () => {
  it("is SECURITY INVOKER, volatile, with an empty search_path", async () => {
    const { rows } = await db.pg.query<{ prosecdef: boolean; provolatile: string; proconfig: string[] }>(
      `select prosecdef, provolatile, proconfig from pg_proc
       where pronamespace = 'public'::regnamespace and proname = 'create_project'`,
    );
    expect(rows).toEqual([{ prosecdef: false, provolatile: "v", proconfig: ['search_path=""'] }]);
  });

  it("creates the project and its widget config, and returns the project row", async () => {
    const result = await asService(async (tx) => {
      const project = await create(tx, OWNER, FREE_MAX, "pk_createdfirst0000000");
      const config = await tx.query(
        `select button_color, position, label, animation, header_text, show_badge
         from public.widget_configs where project_id = $1`,
        [project?.id],
      );
      return { project, config: config.rows };
    });
    expect(result.project).toMatchObject({
      owner_id: OWNER,
      name: "My site",
      public_key: "pk_createdfirst0000000",
      messages_used: 0,
    });
    expect(result.project?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.config).toEqual([
      {
        button_color: DEFAULT_WIDGET_CONFIG.buttonColor,
        position: DEFAULT_WIDGET_CONFIG.position,
        label: DEFAULT_WIDGET_CONFIG.label,
        animation: DEFAULT_WIDGET_CONFIG.animation,
        header_text: DEFAULT_WIDGET_CONFIG.headerText,
        show_badge: DEFAULT_WIDGET_CONFIG.showBadge,
      },
    ]);
  });

  it("refuses at the limit with P0001 plan_limit and writes nothing", async () => {
    const result = await asService(async (tx) => {
      for (let i = 0; i < PRO_MAX; i++) await create(tx, OWNER, PRO_MAX);
      const err = await caught(tx, () => create(tx, OWNER, PRO_MAX));
      const counts = await tx.query<{ projects: number; configs: number }>(
        `select (select count(*)::int from public.projects where owner_id = $1) as projects,
                (select count(*)::int from public.widget_configs w
                   join public.projects p on p.id = w.project_id where p.owner_id = $1) as configs`,
        [OWNER],
      );
      return { err, counts: counts.rows[0] };
    });
    expect(result.err).toMatchObject({ code: "P0001", message: "plan_limit" });
    expect(result.counts).toEqual({ projects: PRO_MAX, configs: PRO_MAX });
  });

  it("uses the limit it is given (Free) and counts only the owner's projects", async () => {
    const result = await asService(async (tx) => {
      await create(tx, OTHER, PRO_MAX); // another owner's project doesn't count
      await create(tx, OWNER, FREE_MAX);
      return caught(tx, () => create(tx, OWNER, FREE_MAX));
    });
    expect(result).toMatchObject({ code: "P0001", message: "plan_limit" });
  });

  it("works again after a project is deleted", async () => {
    const result = await asService(async (tx) => {
      const first = await create(tx, OWNER, FREE_MAX);
      const blocked = await caught(tx, () => create(tx, OWNER, FREE_MAX));
      await tx.query("delete from public.projects where id = $1", [first?.id]);
      const again = await create(tx, OWNER, FREE_MAX);
      return { blocked, again };
    });
    expect(result.blocked).toMatchObject({ code: "P0001" });
    expect(result.again).toMatchObject({ owner_id: OWNER });
  });

  it("fails on a duplicate public_key", async () => {
    const result = await asService(async (tx) => {
      await create(tx, OWNER, PRO_MAX, "pk_duplicatekey0000000");
      return caught(tx, () => create(tx, OTHER, PRO_MAX, "pk_duplicatekey0000000"));
    });
    expect(result).toMatchObject({ code: "23505" });
  });

  it("fails with P0002 when the owner has no account", async () => {
    const result = await asService((tx) => caught(tx, () => create(tx, "user_missing", FREE_MAX)));
    expect(result).toMatchObject({ code: "P0002", message: "account_not_found" });
  });

  it("rejects a null or negative limit", async () => {
    for (const max of [null, -1]) {
      const result = await asService((tx) =>
        caught(tx, () => tx.query(CALL, params(OWNER, max as unknown as number))),
      );
      expect(result, String(max)).toMatchObject({ code: "22023" });
    }
  });

  it("anon and authenticated can't execute it", async () => {
    const anon = await db.as("anon", {}, (tx) => caught(tx, () => create(tx, OWNER, PRO_MAX)));
    const owner = await db.as("authenticated", { sub: OWNER, role: "authenticated" }, (tx) =>
      caught(tx, () => create(tx, OWNER, PRO_MAX)),
    );
    expect(anon?.message).toMatch(/permission denied for function create_project/);
    expect(owner?.message).toMatch(/permission denied for function create_project/);
  });

  it("grants EXECUTE to service_role only", async () => {
    const { rows } = await db.pg.query<{ role: string; can: boolean }>(
      `select r as role, has_function_privilege(r,
         'public.create_project(text, text, text, integer, text, text, text, text, text, boolean)', 'execute') as can
       from unnest(array['anon', 'authenticated', 'service_role']) r order by r`,
    );
    expect(rows).toEqual([
      { role: "anon", can: false },
      { role: "authenticated", can: false },
      { role: "service_role", can: true },
    ]);
  });
});

// pglite is a single connection, so two calls can't run at once. Instead, check the lock the
// call leaves on the owner's accounts row: FOR UPDATE marks the tuple with an exclusive,
// keys-updated lock. Without it, the projects FK check would only take a KEY SHARE lock,
// which lets a second transaction count the same projects concurrently.
describe("create_project row lock", () => {
  let lockDb: TestDb;

  beforeAll(async () => {
    lockDb = await createTestDb({ extensions: { pageinspect } });
    await lockDb.pg.exec(`
      create extension pageinspect;
      insert into public.accounts (clerk_user_id) values ('${OWNER}');
    `);
  });

  afterAll(async () => {
    await lockDb?.close();
  });

  /** Lock flags on the owner's accounts tuple, held by the current transaction. Superuser only. */
  async function accountLockFlags(tx: Transaction): Promise<string[]> {
    const { rows } = await tx.query<{ flags: string[]; mine: boolean }>(
      `with t as (select ctid from public.accounts where clerk_user_id = $1)
       select f.raw_flags as flags, h.t_xmax = pg_current_xact_id()::xid as mine
       from t,
         heap_page_items(get_raw_page('public.accounts', (t.ctid::text::point)[0]::int)) h,
         heap_tuple_infomask_flags(h.t_infomask, h.t_infomask2) f
       where h.lp = (t.ctid::text::point)[1]::int`,
      [OWNER],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.mine).toBe(true);
    return rows[0]?.flags ?? [];
  }

  it("holds FOR UPDATE on the owner's accounts row until the transaction ends", async () => {
    const flags = await lockDb.as("service_role", { role: "service_role" }, async (tx) => {
      await create(tx, OWNER, PRO_MAX);
      await tx.exec("reset role");
      return accountLockFlags(tx);
    });
    expect(flags).toEqual(
      expect.arrayContaining(["HEAP_XMAX_LOCK_ONLY", "HEAP_XMAX_EXCL_LOCK", "HEAP_KEYS_UPDATED"]),
    );
  });

  it("control: a plain project insert only takes the FK's key-share lock", async () => {
    const flags = await lockDb.pg.transaction(async (tx) => {
      await tx.query(
        "insert into public.projects (owner_id, name, public_key) values ($1, 'x', 'pk_controlinsert0000000')",
        [OWNER],
      );
      const result = await accountLockFlags(tx);
      await tx.rollback();
      return result;
    });
    expect(flags).toContain("HEAP_XMAX_KEYSHR_LOCK");
    expect(flags).not.toContain("HEAP_KEYS_UPDATED");
    expect(flags).not.toContain("HEAP_XMAX_EXCL_LOCK");
  });
});
