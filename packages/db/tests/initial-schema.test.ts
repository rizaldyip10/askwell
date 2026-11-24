import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  MESSAGE_ROLES,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
} from "../../shared/src/enums";
import { PLANS } from "../../shared/src/plans";
import { createTestDb, type TestDb } from "../supabase-pglite";

const TABLES = [
  "accounts",
  "projects",
  "widget_configs",
  "knowledge_sources",
  "knowledge_chunks",
  "conversations",
  "messages",
] as const;

const OWNER_A = "user_a";
const OWNER_B = "user_b";

// Fixed IDs so assertions can name rows. Suffix a = owner A, b = owner B.
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

// Seeds both owners' data as the superuser (like the service would).
const SEED = /* sql */ `
  insert into public.accounts (clerk_user_id) values ('${OWNER_A}'), ('${OWNER_B}');
  insert into public.projects (id, owner_id, name, public_key) values
    ('${ID.projectA}', '${OWNER_A}', 'A site', 'pk_a'),
    ('${ID.projectB}', '${OWNER_B}', 'B site', 'pk_b');
  insert into public.widget_configs (project_id, button_color, position, label, animation, header_text) values
    ('${ID.projectA}', '#000000', 'bottom-right', 'Help', 'fade', 'Hi A'),
    ('${ID.projectB}', '#ffffff', 'bottom-left', 'Help', 'slide', 'Hi B');
  insert into public.knowledge_sources (id, project_id, title, type, storage_key, status) values
    ('${ID.sourceA}', '${ID.projectA}', 'FAQ A', 'text', null, 'ready'),
    ('${ID.sourceB}', '${ID.projectB}', 'FAQ B', 'pdf', 'b/faq.pdf', 'ready');
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

// One valid row per table, used to prove inserts are refused for API roles.
const INSERTS: Record<(typeof TABLES)[number], string> = {
  accounts: `insert into public.accounts (clerk_user_id) values ('user_new')`,
  projects: `insert into public.projects (owner_id, name, public_key) values ('${OWNER_A}', 'x', 'pk_new')`,
  widget_configs: `insert into public.widget_configs (project_id, button_color, position, label, animation, header_text)
    select id, '#000', 'top-left', 'l', 'fade', 'h' from public.projects where false`,
  knowledge_sources: `insert into public.knowledge_sources (project_id, title, type, status)
    values ('${ID.projectA}', 't', 'text', 'ready')`,
  knowledge_chunks: `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
    values ('${ID.projectA}', '${ID.sourceA}', 'c', ${EMBEDDING})`,
  conversations: `insert into public.conversations (project_id, visitor_id) values ('${ID.projectA}', 'v')`,
  messages: `insert into public.messages (conversation_id, role, body) values ('${ID.convA}', 'bot', 'b')`,
};

const PERMISSION_DENIED = /permission denied/;

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pg.exec(SEED);
});

afterAll(async () => {
  await db?.close();
});

describe("migration", () => {
  it("applies cleanly and creates all 7 tables with RLS enabled", async () => {
    const { rows } = await db.pg.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by c.relname`,
    );
    expect(rows.map((r) => r.relname)).toEqual([...TABLES].sort());
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it("installs pgvector in the extensions schema", async () => {
    const { rows } = await db.pg.query<{ schema: string }>(
      `select n.nspname as schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace
       where e.extname = 'vector'`,
    );
    expect(rows).toEqual([{ schema: "extensions" }]);
  });

  it("has an HNSW cosine index on knowledge_chunks.embedding", async () => {
    const { rows } = await db.pg.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where tablename = 'knowledge_chunks' and indexdef ilike '%hnsw%'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toMatch(/vector_cosine_ops/);
  });

  it("indexes every foreign key column", async () => {
    // For each FK, some index must start with the FK's column.
    const { rows } = await db.pg.query<{ fk: string }>(
      `select c.conrelid::regclass || '.' || a.attname as fk
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f' and c.connamespace = 'public'::regnamespace
         and not exists (
           select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
         )`,
    );
    expect(rows).toEqual([]);
  });

  it("makes the RLS helpers SECURITY DEFINER, stable, with an empty search_path", async () => {
    const { rows } = await db.pg.query<{ proname: string; prosecdef: boolean; provolatile: string; proconfig: string[] }>(
      `select proname, prosecdef, provolatile, proconfig from pg_proc
       where pronamespace = 'private'::regnamespace
         and proname in ('owned_conversation_ids', 'owned_project_ids') order by proname`,
    );
    expect(rows.map((r) => r.proname)).toEqual(["owned_conversation_ids", "owned_project_ids"]);
    for (const r of rows) {
      expect(r.prosecdef).toBe(true);
      expect(r.provolatile).toBe("s");
      expect(r.proconfig).toEqual(['search_path=""']);
    }
  });
});

describe("owner isolation (authenticated)", () => {
  const visible = async (sub: string, table: string, idColumn: string) =>
    (await db.asOwner<{ id: string }>(sub, `select ${idColumn}::text as id from public.${table} order by 1`)).rows.map(
      (r) => r.id,
    );

  it.each([
    ["accounts", "clerk_user_id", OWNER_A, OWNER_B],
    ["projects", "id", ID.projectA, ID.projectB],
    ["widget_configs", "project_id", ID.projectA, ID.projectB],
    ["knowledge_sources", "id", ID.sourceA, ID.sourceB],
    ["knowledge_chunks", "id", ID.chunkA, ID.chunkB],
    ["conversations", "id", ID.convA, ID.convB],
    ["messages", "id", ID.msgA, ID.msgB],
  ])("%s: each owner sees only their own rows", async (table, idColumn, idA, idB) => {
    expect(await visible(OWNER_A, table, idColumn)).toEqual([idA]);
    expect(await visible(OWNER_B, table, idColumn)).toEqual([idB]);
  });

  it.each(TABLES)("%s: an unknown user or a token without sub sees nothing", async (table) => {
    expect((await db.asOwner("user_nobody", `select 1 from public.${table}`)).rows).toEqual([]);
    const noSub = await db.as("authenticated", { role: "authenticated" }, (tx) =>
      tx.query(`select 1 from public.${table}`),
    );
    expect(noSub.rows).toEqual([]);
  });

  it("the RLS helpers return only the caller's IDs", async () => {
    expect((await db.asOwner(OWNER_A, "select private.owned_project_ids()::text as id")).rows).toEqual([
      { id: ID.projectA },
    ]);
    expect((await db.asOwner(OWNER_A, "select private.owned_conversation_ids()::text as id")).rows).toEqual([
      { id: ID.convA },
    ]);
  });
});

describe("anon", () => {
  it.each(TABLES)("cannot select from %s", async (table) => {
    await expect(db.asAnon(`select * from public.${table}`)).rejects.toThrow(PERMISSION_DENIED);
  });

  it.each(TABLES)("cannot insert into %s", async (table) => {
    await expect(db.asAnon(INSERTS[table])).rejects.toThrow(PERMISSION_DENIED);
  });

  it.each(["owned_project_ids", "owned_conversation_ids"])("cannot execute %s()", async (fn) => {
    await expect(db.asAnon(`select private.${fn}()`)).rejects.toThrow(PERMISSION_DENIED);
  });
});

describe("authenticated writes", () => {
  it.each(TABLES)("cannot insert into %s", async (table) => {
    await expect(db.asOwner(OWNER_A, INSERTS[table])).rejects.toThrow(PERMISSION_DENIED);
  });

  it("can rename their own project", async () => {
    const name = await db.as("authenticated", { sub: OWNER_A }, async (tx) => {
      const res = await tx.query(`update public.projects set name = 'Renamed' where id = $1`, [ID.projectA]);
      expect(res.affectedRows).toBe(1);
      return (await tx.query<{ name: string }>(`select name from public.projects where id = $1`, [ID.projectA]))
        .rows[0]?.name;
    });
    expect(name).toBe("Renamed");
  });

  it("cannot rename another owner's project", async () => {
    const res = await db.asOwner(OWNER_A, `update public.projects set name = 'Hijacked' where id = $1`, [
      ID.projectB,
    ]);
    expect(res.affectedRows).toBe(0);
  });

  it.each([
    ["owner_id", `'${OWNER_B}'`],
    ["public_key", "'pk_x'"],
    ["messages_used", "0"],
    ["period_start", "now()"],
    ["created_at", "now()"],
    ["id", "gen_random_uuid()"],
  ])("cannot update projects.%s", async (column, value) => {
    await expect(
      db.asOwner(OWNER_A, `update public.projects set ${column} = ${value} where id = $1`, [ID.projectA]),
    ).rejects.toThrow(PERMISSION_DENIED);
  });

  it.each([
    ["accounts", "plan = 'pro'"],
    ["widget_configs", "label = 'x'"],
    ["knowledge_sources", "title = 'x'"],
    ["knowledge_chunks", "content = 'x'"],
    ["conversations", "visitor_id = 'x'"],
    ["messages", "body = 'x'"],
  ])("cannot update %s", async (table, set) => {
    await expect(db.asOwner(OWNER_A, `update public.${table} set ${set}`)).rejects.toThrow(PERMISSION_DENIED);
  });

  it.each(TABLES.filter((t) => t !== "projects"))("cannot delete from %s", async (table) => {
    await expect(db.asOwner(OWNER_A, `delete from public.${table}`)).rejects.toThrow(PERMISSION_DENIED);
  });

  it("cannot delete another owner's project", async () => {
    const res = await db.asOwner(OWNER_A, `delete from public.projects where id = $1`, [ID.projectB]);
    expect(res.affectedRows).toBe(0);
  });

  it("deleting their own project cascades to all its children, and only its children", async () => {
    const counts = await db.as("authenticated", { sub: OWNER_A }, async (tx) => {
      const res = await tx.query(`delete from public.projects where id = $1`, [ID.projectA]);
      expect(res.affectedRows).toBe(1);
      // Count as the superuser, inside the same (rolled-back) transaction.
      await tx.exec("reset role");
      const { rows } = await tx.query<{ project_id: string; n: number }>(
        `select project_id::text, count(*)::int as n from (
           select project_id from public.widget_configs
           union all select project_id from public.knowledge_sources
           union all select project_id from public.knowledge_chunks
           union all select project_id from public.conversations
           union all select c.project_id from public.messages m join public.conversations c on c.id = m.conversation_id
         ) t group by project_id order by 1`,
      );
      return rows;
    });
    // Project B keeps its config, source, chunk, conversation and message.
    expect(counts).toEqual([{ project_id: ID.projectB, n: 5 }]);
  });

  it("rejects a chunk whose project differs from its source's project", async () => {
    await expect(
      db.asService(
        `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
         values ('${ID.projectA}', '${ID.sourceB}', 'mismatch', ${EMBEDDING})`,
      ),
    ).rejects.toThrow(/violates foreign key constraint/);
  });

  it("deleting a source deletes its chunks", async () => {
    const remaining = await db.as("service_role", {}, async (tx) => {
      await tx.query(`delete from public.knowledge_sources where id = $1`, [ID.sourceA]);
      return (await tx.query(`select 1 from public.knowledge_chunks where source_id = $1`, [ID.sourceA])).rows;
    });
    expect(remaining).toEqual([]);
  });
});

describe("TRUNCATE", () => {
  it.each(TABLES)("is refused for anon and authenticated on %s", async (table) => {
    await expect(db.asAnon(`truncate public.${table} cascade`)).rejects.toThrow(PERMISSION_DENIED);
    await expect(db.asOwner(OWNER_A, `truncate public.${table} cascade`)).rejects.toThrow(PERMISSION_DENIED);
  });
});

describe("service_role", () => {
  it.each(TABLES)("sees every owner's rows in %s", async (table) => {
    expect((await db.asService(`select 1 from public.${table}`)).rows).toHaveLength(2);
  });

  it.each(TABLES)("can insert into %s", async (table) => {
    // widget_configs needs a project without a config: create one first.
    await db.as("service_role", {}, async (tx) => {
      if (table === "widget_configs") {
        await tx.query(
          `insert into public.projects (id, owner_id, name, public_key)
           values ('00000000-0000-4000-8000-0000000000c1', '${OWNER_A}', 'C', 'pk_c')`,
        );
        await tx.query(
          `insert into public.widget_configs (project_id, button_color, position, label, animation, header_text)
           values ('00000000-0000-4000-8000-0000000000c1', '#000', 'top-left', 'l', 'scale', 'h')`,
        );
      } else {
        expect((await tx.query(INSERTS[table])).affectedRows).toBe(1);
      }
    });
  });

  it("can update any column and delete any row", async () => {
    await db.as("service_role", {}, async (tx) => {
      const upd = await tx.query(
        `update public.projects set messages_used = 5, public_key = 'pk_rotated', period_start = now() where id = $1`,
        [ID.projectB],
      );
      expect(upd.affectedRows).toBe(1);
      expect((await tx.query(`update public.accounts set plan = 'pro'`)).affectedRows).toBe(2);
      expect((await tx.query(`delete from public.messages`)).affectedRows).toBe(2);
      expect((await tx.query(`delete from public.projects`)).affectedRows).toBe(2);
    });
  });

  it("can truncate", async () => {
    await db.as("service_role", {}, (tx) => tx.exec(`truncate ${TABLES.map((t) => `public.${t}`).join(", ")}`));
  });

  it("cannot execute the RLS helpers (it doesn't need them)", async () => {
    await expect(db.asService("select private.owned_project_ids()")).rejects.toThrow(PERMISSION_DENIED);
  });
});

describe("enum check constraints", () => {
  const ENUMS = [
    ["accounts", "plan", PLANS],
    ["widget_configs", "position", WIDGET_POSITIONS],
    ["widget_configs", "animation", WIDGET_ANIMATIONS],
    ["knowledge_sources", "type", KNOWLEDGE_SOURCE_TYPES],
    ["knowledge_sources", "status", KNOWLEDGE_SOURCE_STATUSES],
    ["messages", "role", MESSAGE_ROLES],
  ] as const;

  it.each(ENUMS)("%s.%s allows exactly the @askwell/shared values", async (table, column, values) => {
    const { rows } = await db.pg.query<{ def: string }>(
      `select pg_get_constraintdef(c.oid) as def from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'c' and c.conrelid = $1::regclass and a.attname = $2`,
      [`public.${table}`, column],
    );
    expect(rows).toHaveLength(1);
    const allowed = [...(rows[0]?.def ?? "").matchAll(/'([^']*)'/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual([...values].sort());
  });

  it.each([
    ["accounts", "plan", "update public.accounts set plan = 'enterprise'"],
    ["widget_configs", "position", "update public.widget_configs set position = 'center'"],
    ["widget_configs", "animation", "update public.widget_configs set animation = 'spin'"],
    ["knowledge_sources", "type", "update public.knowledge_sources set type = 'docx'"],
    ["knowledge_sources", "status", "update public.knowledge_sources set status = 'done'"],
    ["messages", "role", "update public.messages set role = 'system'"],
  ])("%s.%s rejects a bad value", async (_table, _column, sql) => {
    await expect(db.asService(sql)).rejects.toThrow(/violates check constraint/);
  });

  it("defaults accounts.plan to free, and projects / widget_configs to their spec'd defaults", async () => {
    const { rows } = await db.pg.query<{ plan: string; messages_used: number; show_badge: boolean }>(
      `select a.plan, p.messages_used, w.show_badge from public.accounts a
       join public.projects p on p.owner_id = a.clerk_user_id
       join public.widget_configs w on w.project_id = p.id
       where a.clerk_user_id = $1`,
      [OWNER_A],
    );
    expect(rows).toEqual([{ plan: "free", messages_used: 0, show_badge: true }]);
  });
});
