// Test helper: an in-memory Postgres (PGlite) that looks enough like Supabase to test
// migrations, RLS policies, grants and functions. Never a local Supabase stack or Docker.
//
// It stubs what Supabase provides before our migrations run:
//   - the `anon`, `authenticated` and `service_role` roles (service_role bypasses RLS)
//   - the `extensions` schema, with pgvector available
//   - `auth.jwt()`, reading the `request.jwt.claims` setting like PostgREST does
//   - Supabase's default privileges: new objects in `public` are granted to the API roles,
//     so migrations must revoke what those roles shouldn't have.
// Then it applies every file in `supabase/migrations` in name (timestamp) order.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite, type Extensions, type Results, type Transaction } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));

const SUPABASE_STUB = /* sql */ `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema extensions;
  grant usage on schema extensions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create function auth.jwt() returns jsonb
  language sql stable
  as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export type Role = "anon" | "authenticated" | "service_role";

export type TestDb = {
  /** The raw PGlite instance, connected as the superuser `postgres` (like a migration). */
  pg: PGlite;
  /** Run `fn` in a transaction as `role`, with `claims` as the JWT. Rolled back afterwards. */
  as<T>(role: Role, claims: Record<string, unknown>, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Run SQL as anon (no JWT). Rolled back afterwards. */
  asAnon<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Results<T>>;
  /** Run SQL as an owner: role authenticated with the given Clerk user ID as `sub`. Rolled back afterwards. */
  asOwner<T = Record<string, unknown>>(sub: string, sql: string, params?: unknown[]): Promise<Results<T>>;
  /** Run SQL as service_role. Rolled back afterwards. */
  asService<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Results<T>>;
  close(): Promise<void>;
};

/** Apply every `.sql` file in `dir` in name order. */
export async function applyMigrations(pg: PGlite, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(join(dir, file), "utf8");
    try {
      await pg.exec(sql);
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`, {
        cause: err,
      });
    }
  }
  return files;
}

/**
 * Boot a fresh Supabase-like PGlite and apply all migrations.
 * `extensions` adds PGlite extensions (e.g. a contrib module for a test) next to pgvector.
 */
export async function createTestDb(
  options: { migrationsDir?: string; extensions?: Extensions } = {},
): Promise<TestDb> {
  const pg = await PGlite.create({ extensions: { ...options.extensions, vector } });
  await pg.exec(SUPABASE_STUB);
  await applyMigrations(pg, options.migrationsDir);

  // Each call runs in its own transaction and always rolls back, so tests leave no trace.
  // `set local` scopes the role and claims to that transaction.
  const as: TestDb["as"] = (role, claims, fn) =>
    pg.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      await tx.exec(`set local role ${role}`);
      const result = await fn(tx);
      await tx.rollback();
      return result;
    });

  return {
    pg,
    as,
    asAnon: (sql, params) => as("anon", {}, (tx) => tx.query(sql, params)),
    asOwner: (sub, sql, params) => as("authenticated", { sub, role: "authenticated" }, (tx) => tx.query(sql, params)),
    asService: (sql, params) => as("service_role", { role: "service_role" }, (tx) => tx.query(sql, params)),
    close: () => pg.close(),
  };
}
