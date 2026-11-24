// P6H-T05: catalog-wide check of project.md §9 "Database API" (and §7's role table).
//
// Other test files check each table or function as it was added. This one reads the
// catalog after every migration, so a new table, function or grant that breaks a rule
// fails here even if its own tests forgot the check.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../supabase-pglite";

const API_ROLES = ["anon", "authenticated", "service_role"] as const;
const TABLE_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;

/**
 * What `authenticated` may do, per §7: SELECT every table (RLS scopes the rows), UPDATE
 * `projects.name` only, DELETE `projects`. Anything else is a finding.
 */
const AUTHENTICATED_TABLE_PRIVILEGES: Record<string, string[]> = {
  accounts: ["SELECT"],
  conversations: ["SELECT"],
  knowledge_chunks: ["SELECT"],
  knowledge_sources: ["SELECT"],
  messages: ["SELECT"],
  projects: ["SELECT", "DELETE"],
  widget_configs: ["SELECT"],
};

/**
 * Every function in `public` and `private`, with who may execute it (§7). A new function
 * must be added here on purpose. SECURITY DEFINER is allowed only for the RLS helpers.
 */
const FUNCTIONS: Record<string, { definer: boolean; execute: (typeof API_ROLES)[number][] }> = {
  "private.owned_conversation_ids": { definer: true, execute: ["authenticated"] },
  "private.owned_project_ids": { definer: true, execute: ["authenticated"] },
  "public.consume_message": { definer: false, execute: ["service_role"] },
  "public.conversation_belongs": { definer: false, execute: ["service_role"] },
  "public.create_project": { definer: false, execute: ["service_role"] },
  "public.match_chunks": { definer: false, execute: ["service_role"] },
  "public.message_period_start": { definer: false, execute: ["service_role"] },
  "public.owner_activity": { definer: false, execute: ["authenticated", "service_role"] },
  "public.reserve_knowledge_source": { definer: false, execute: ["service_role"] },
  "public.save_chat_turn": { definer: false, execute: ["service_role"] },
};

type FunctionRow = {
  name: string;
  signature: string;
  prosecdef: boolean;
  proconfig: string[] | null;
  public_execute: boolean;
};

let db: TestDb;
let tables: string[];
let functions: FunctionRow[];

beforeAll(async () => {
  db = await createTestDb();
  tables = (
    await db.pg.query<{ relname: string }>(
      `select relname from pg_class
       where relnamespace = 'public'::regnamespace and relkind in ('r', 'p', 'v', 'm', 'f')
       order by relname`,
    )
  ).rows.map((r) => r.relname);
  // Functions an extension installed (none in these schemas today) aren't ours to audit.
  functions = (
    await db.pg.query<FunctionRow>(
      `select n.nspname || '.' || p.proname as name,
              p.oid::regprocedure::text as signature,
              p.prosecdef,
              p.proconfig,
              coalesce(exists (
                select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE'
              ), false) as public_execute
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private')
         and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       order by 1`,
    )
  ).rows;
});

afterAll(async () => {
  await db?.close();
});

const tablePrivileges = async (role: string, table: string) => {
  const { rows } = await db.pg.query<{ privilege: string; has: boolean }>(
    `select p as privilege, has_table_privilege($1, $2, p) as has from unnest($3::text[]) p`,
    [role, `public.${table}`, TABLE_PRIVILEGES],
  );
  return rows.filter((r) => r.has).map((r) => r.privilege);
};

describe("tables and views in public", () => {
  it("are exactly the 7 tables of §7 (a new one must be added here, with its rules)", () => {
    expect(tables).toEqual(Object.keys(AUTHENTICATED_TABLE_PRIVILEGES).sort());
  });

  it("all have RLS enabled", async () => {
    const { rows } = await db.pg.query<{ relname: string }>(
      `select relname from pg_class
       where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') and not relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("every table authenticated can read has an RLS policy for it", async () => {
    const { rows } = await db.pg.query<{ tablename: string }>(
      `select distinct tablename from pg_policies
       where schemaname = 'public' and ('authenticated' = any(roles) or 'public' = any(roles))
       order by tablename`,
    );
    expect(rows.map((r) => r.tablename)).toEqual(tables);
  });

  it("anon has no privilege on any of them", async () => {
    for (const table of tables) expect(await tablePrivileges("anon", table), table).toEqual([]);
  });

  it("anon and authenticated can't TRUNCATE any of them", async () => {
    for (const table of tables) {
      for (const role of ["anon", "authenticated"]) {
        expect((await tablePrivileges(role, table)).includes("TRUNCATE"), `${role} ${table}`).toBe(false);
      }
    }
  });

  it("authenticated has exactly the privileges of §7", async () => {
    for (const table of tables) {
      expect(await tablePrivileges("authenticated", table), table).toEqual(AUTHENTICATED_TABLE_PRIVILEGES[table]);
    }
  });

  it("authenticated may update projects.name and no other column, and insert no column anywhere", async () => {
    const { rows } = await db.pg.query<{ table_name: string; column_name: string; privilege: string }>(
      `select c.table_name, c.column_name, p as privilege
       from information_schema.columns c, unnest(array['INSERT', 'UPDATE', 'REFERENCES']) p
       where c.table_schema = 'public'
         and has_column_privilege('authenticated', format('public.%I', c.table_name), c.column_name, p)
       order by 1, 2, 3`,
    );
    expect(rows).toEqual([{ table_name: "projects", column_name: "name", privilege: "UPDATE" }]);
  });

  it("anon has no column privilege anywhere", async () => {
    const { rows } = await db.pg.query(
      `select c.table_name, c.column_name from information_schema.columns c,
         unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p
       where c.table_schema = 'public'
         and has_column_privilege('anon', format('public.%I', c.table_name), c.column_name, p)`,
    );
    expect(rows).toEqual([]);
  });

  it("no sequence in public is usable by anon or authenticated", async () => {
    const { rows } = await db.pg.query(
      `select c.relname, r from pg_class c, unnest(array['anon', 'authenticated']) r
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
         and (has_sequence_privilege(r, c.oid, 'usage') or has_sequence_privilege(r, c.oid, 'update'))`,
    );
    expect(rows).toEqual([]);
  });
});

describe("functions in public and private", () => {
  it("are exactly the ones listed here (a new one must be added on purpose)", () => {
    expect(functions.map((f) => f.name)).toEqual(Object.keys(FUNCTIONS).sort());
  });

  it("all have search_path = ''", () => {
    for (const fn of functions) expect(fn.proconfig, fn.name).toContain('search_path=""');
  });

  it("are SECURITY INVOKER, except the private RLS helpers", () => {
    for (const fn of functions) expect(fn.prosecdef, fn.name).toBe(FUNCTIONS[fn.name]?.definer);
    const definers = functions.filter((f) => f.prosecdef).map((f) => f.name);
    expect(definers.every((name) => name.startsWith("private."))).toBe(true);
  });

  it("none is executable by PUBLIC", () => {
    expect(functions.filter((f) => f.public_execute).map((f) => f.name)).toEqual([]);
  });

  it("EXECUTE is held by exactly the roles that need it, never anon", async () => {
    for (const fn of functions) {
      const { rows } = await db.pg.query<{ role: string }>(
        `select r as role from unnest($1::text[]) r where has_function_privilege(r, $2, 'execute') order by r`,
        [API_ROLES, fn.signature],
      );
      expect(rows.map((r) => r.role), fn.name).toEqual(FUNCTIONS[fn.name]?.execute);
    }
  });
});

describe("schemas", () => {
  it("anon can't use the private schema; only authenticated can", async () => {
    const { rows } = await db.pg.query<{ role: string }>(
      `select r as role from unnest($1::text[]) r where has_schema_privilege(r, 'private', 'usage') order by r`,
      [API_ROLES],
    );
    expect(rows.map((r) => r.role)).toEqual(["authenticated"]);
  });

  it("no API role can create objects in public or private", async () => {
    const { rows } = await db.pg.query(
      `select r, s from unnest($1::text[]) r, unnest(array['public', 'private']) s
       where has_schema_privilege(r, s, 'create')`,
      [API_ROLES],
    );
    expect(rows).toEqual([]);
  });
});
