// P6H-T01: the RLS helpers live in `private` (not exposed by the Data API), the
// policies call them there, and the old `public` functions are gone.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../supabase-pglite";

const OWNER_A = "user_a";
const OWNER_B = "user_b";

const ID = {
  projectA: "00000000-0000-4000-8000-0000000000a1",
  projectB: "00000000-0000-4000-8000-0000000000b1",
  sourceA: "00000000-0000-4000-8000-0000000000a2",
  sourceB: "00000000-0000-4000-8000-0000000000b2",
  chunkA: "00000000-0000-4000-8000-0000000000a3",
  chunkB: "00000000-0000-4000-8000-0000000000b3",
  convA: "00000000-0000-4000-8000-0000000000a4",
  convB: "00000000-0000-4000-8000-0000000000b4",
  msgA: "00000000-0000-4000-8000-0000000000a5",
  msgB: "00000000-0000-4000-8000-0000000000b5",
};

const EMBEDDING = "array_fill(0.1::real, array[1536])::extensions.vector";

// Owner B has data too, so "sees none of A's" is a real check, not an empty table.
const SEED = /* sql */ `
  insert into public.accounts (clerk_user_id) values ('${OWNER_A}'), ('${OWNER_B}');
  insert into public.projects (id, owner_id, name, public_key) values
    ('${ID.projectA}', '${OWNER_A}', 'A site', 'pk_a'),
    ('${ID.projectB}', '${OWNER_B}', 'B site', 'pk_b');
  insert into public.knowledge_sources (id, project_id, title, type, storage_key, status) values
    ('${ID.sourceA}', '${ID.projectA}', 'FAQ A', 'text', null, 'ready'),
    ('${ID.sourceB}', '${ID.projectB}', 'FAQ B', 'text', null, 'ready');
  insert into public.knowledge_chunks (id, project_id, source_id, content, embedding) values
    ('${ID.chunkA}', '${ID.projectA}', '${ID.sourceA}', 'chunk A', ${EMBEDDING}),
    ('${ID.chunkB}', '${ID.projectB}', '${ID.sourceB}', 'chunk B', ${EMBEDDING});
  insert into public.conversations (id, project_id, visitor_id) values
    ('${ID.convA}', '${ID.projectA}', 'visitor_a'),
    ('${ID.convB}', '${ID.projectB}', 'visitor_b');
  insert into public.messages (id, conversation_id, role, body) values
    ('${ID.msgA}', '${ID.convA}', 'visitor', 'hello from A'),
    ('${ID.msgB}', '${ID.convB}', 'visitor', 'hello from B');
`;

const TABLES = [
  ["projects", ID.projectA],
  ["knowledge_sources", ID.sourceA],
  ["knowledge_chunks", ID.chunkA],
  ["conversations", ID.convA],
  ["messages", ID.msgA],
] as const;

const HELPERS = ["owned_project_ids", "owned_conversation_ids"] as const;

const POLICIES = [
  "widget_configs_select_own",
  "knowledge_sources_select_own",
  "knowledge_chunks_select_own",
  "conversations_select_own",
  "messages_select_own",
];

const PERMISSION_DENIED = /permission denied/;

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pg.exec(SEED);
});

afterAll(async () => {
  await db?.close();
});

const ids = async (sub: string, table: string, id: string) =>
  (await db.asOwner<{ id: string }>(sub, `select id::text as id from public.${table} where id = $1`, [id])).rows.map(
    (r) => r.id,
  );

describe("owner reads still go through RLS", () => {
  it.each(TABLES)("%s: the owner sees their own row", async (table, id) => {
    expect(await ids(OWNER_A, table, id)).toEqual([id]);
    const all = await db.asOwner<{ n: number }>(OWNER_A, `select count(*)::int as n from public.${table}`);
    expect(all.rows).toEqual([{ n: 1 }]);
  });

  it.each(TABLES)("%s: another owner sees none of them", async (table, id) => {
    expect(await ids(OWNER_B, table, id)).toEqual([]);
    expect(await ids("user_nobody", table, id)).toEqual([]);
  });

  it.each(TABLES)("%s: anon sees nothing", async (table) => {
    await expect(db.asAnon(`select * from public.${table}`)).rejects.toThrow(PERMISSION_DENIED);
  });
});

describe("private helpers", () => {
  it("live in a `private` schema that only authenticated may use", async () => {
    const { rows } = await db.pg.query<{ role: string; usage: boolean }>(
      `select r as role, has_schema_privilege(r, 'private', 'usage') as usage
       from unnest(array['anon', 'authenticated', 'service_role']) r order by r`,
    );
    expect(rows).toEqual([
      { role: "anon", usage: false },
      { role: "authenticated", usage: true },
      { role: "service_role", usage: false },
    ]);
  });

  it.each(HELPERS)("anon cannot call private.%s()", async (fn) => {
    await expect(db.asAnon(`select private.${fn}()`)).rejects.toThrow(PERMISSION_DENIED);
  });

  it.each(HELPERS)("only authenticated holds EXECUTE on private.%s()", async (fn) => {
    const { rows } = await db.pg.query<{ role: string; exec: boolean }>(
      `select r as role, has_function_privilege(r, 'private.${fn}()', 'execute') as exec
       from unnest(array['anon', 'authenticated', 'service_role']) r order by r`,
    );
    expect(rows).toEqual([
      { role: "anon", exec: false },
      { role: "authenticated", exec: true },
      { role: "service_role", exec: false },
    ]);
  });

  it("an owner calling them gets only their own IDs", async () => {
    expect((await db.asOwner(OWNER_B, "select private.owned_project_ids()::text as id")).rows).toEqual([
      { id: ID.projectB },
    ]);
    expect((await db.asOwner(OWNER_B, "select private.owned_conversation_ids()::text as id")).rows).toEqual([
      { id: ID.convB },
    ]);
  });
});

describe("public helpers are gone", () => {
  it.each(HELPERS)("public.%s does not exist", async (fn) => {
    const { rows } = await db.pg.query(
      `select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = $1`,
      [fn],
    );
    expect(rows).toEqual([]);
    await expect(db.asOwner(OWNER_A, `select public.${fn}()`)).rejects.toThrow(/does not exist/);
  });

  it("every recreated policy calls the private helpers, and no policy mentions the public ones", async () => {
    const { rows } = await db.pg.query<{ policyname: string; qual: string }>(
      `select policyname, qual from pg_policies where schemaname = 'public' order by policyname`,
    );
    for (const name of POLICIES) {
      expect(rows.find((r) => r.policyname === name)?.qual).toMatch(/private\.owned_(project|conversation)_ids\(\)/);
    }
    // Postgres prints functions on the search_path (public) without a schema, so check
    // that every policy naming a helper names the private one.
    const helperPolicies = rows.filter((r) => /owned_(project|conversation)_ids/.test(r.qual ?? ""));
    expect(helperPolicies.map((r) => r.policyname).sort()).toEqual([...POLICIES].sort());
    expect(helperPolicies.filter((r) => !/private\.owned_/.test(r.qual))).toEqual([]);
  });
});
