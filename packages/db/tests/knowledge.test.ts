import type { Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KNOWLEDGE_ALLOWED_MIME_TYPES, MAX_KNOWLEDGE_FILE_BYTES } from "../../shared/src/limits";
import { PLAN_LIMITS } from "../../shared/src/plans";
import { createTestDb, type TestDb } from "../supabase-pglite";

const OWNER = "user_knowledge";
const PROJECT = "00000000-0000-4000-8000-00000000c001";
const OTHER_PROJECT = "00000000-0000-4000-8000-00000000c002";
const MAX = PLAN_LIMITS.free.knowledgeSources;

const RESERVE = /* sql */ `
  select * from public.reserve_knowledge_source(
    p_project_id => $1, p_title => $2, p_type => $3, p_storage_key => $4, p_status => $5, p_max_sources => $6
  )`;

const MATCH = /* sql */ `
  select * from public.match_chunks(p_project_id => $1, p_embedding => $2::extensions.vector, p_match_count => $3)`;

type Reserved = {
  id: string;
  project_id: string;
  title: string;
  type: string;
  storage_key: string | null;
  status: string;
  created_at: string;
  reclaimed_storage_keys: string[];
};

type Match = { id: string; source_id: string; content: string; similarity: number };

let fileSeq = 0;

const reserveFile = async (tx: Transaction, project = PROJECT, max = MAX, key = `${project}/f${++fileSeq}.pdf`) =>
  (await tx.query<Reserved>(RESERVE, [project, "A file", "pdf", key, "uploading", max])).rows;

const reserveText = async (tx: Transaction, project = PROJECT, max = MAX) =>
  (await tx.query<Reserved>(RESERVE, [project, "Pasted", "text", null, "processing", max])).rows;

/** A 1536-dim vector literal with `weights` on the first dimensions and zeros after. */
function vec(...weights: number[]): string {
  const v = new Array<number>(1536).fill(0);
  weights.forEach((w, i) => (v[i] = w));
  return `[${v.join(",")}]`;
}

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

/** Insert a source (as the superuser's caller, i.e. service_role) and return its id. */
async function addSource(
  tx: Transaction,
  project: string,
  status: string,
  opts: { key?: string | null; age?: string } = {},
): Promise<string> {
  const type = opts.key === null ? "text" : "pdf";
  const { rows } = await tx.query<{ id: string }>(
    `insert into public.knowledge_sources (project_id, title, type, storage_key, status, created_at)
     values ($1, 'seed', $2, $3, $4, now() - $5::interval) returning id`,
    [project, type, opts.key === undefined ? `${project}/seed${++fileSeq}.pdf` : opts.key, status, opts.age ?? "0"],
  );
  return rows[0]!.id;
}

async function addChunk(tx: Transaction, project: string, source: string, content: string, embedding: string) {
  const { rows } = await tx.query<{ id: string }>(
    `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
     values ($1, $2, $3, $4::extensions.vector) returning id`,
    [project, source, content, embedding],
  );
  return rows[0]!.id;
}

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pg.exec(`
    insert into public.accounts (clerk_user_id) values ('${OWNER}');
    insert into public.projects (id, owner_id, name, public_key) values
      ('${PROJECT}', '${OWNER}', 'Mine', 'pk_knowledge_mine'),
      ('${OTHER_PROJECT}', '${OWNER}', 'Other', 'pk_knowledge_other');
  `);
});

afterAll(async () => {
  await db?.close();
});

describe("knowledge bucket", () => {
  it("is private, with the size limit and MIME types from @askwell/shared", async () => {
    const { rows } = await db.pg.query<{
      id: string;
      public: boolean;
      file_size_limit: number;
      allowed_mime_types: string[];
    }>(`select id, public, file_size_limit::int, allowed_mime_types from storage.buckets where id = 'knowledge'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.public).toBe(false);
    expect(rows[0]?.file_size_limit).toBe(MAX_KNOWLEDGE_FILE_BYTES);
    expect([...(rows[0]?.allowed_mime_types ?? [])].sort()).toEqual([...KNOWLEDGE_ALLOWED_MIME_TYPES].sort());
  });
});

describe("function settings and grants", () => {
  it("both are SECURITY INVOKER with an empty search_path", async () => {
    const { rows } = await db.pg.query<{ proname: string; prosecdef: boolean; provolatile: string; proconfig: string[] }>(
      `select proname, prosecdef, provolatile, proconfig from pg_proc
       where pronamespace = 'public'::regnamespace and proname in ('reserve_knowledge_source', 'match_chunks')
       order by proname`,
    );
    expect(rows).toEqual([
      { proname: "match_chunks", prosecdef: false, provolatile: "s", proconfig: ['search_path=""'] },
      { proname: "reserve_knowledge_source", prosecdef: false, provolatile: "v", proconfig: ['search_path=""'] },
    ]);
  });

  it.each([
    ["public.reserve_knowledge_source(uuid, text, text, text, text, integer)"],
    ["public.match_chunks(uuid, extensions.vector, integer)"],
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
        reserve: await caught(tx, () => reserveText(tx)),
        match: await caught(tx, () => tx.query(MATCH, [PROJECT, vec(1), 5])),
      }));
      expect(errors.reserve?.message, role).toMatch(/permission denied for function reserve_knowledge_source/);
      expect(errors.match?.message, role).toMatch(/permission denied for function match_chunks/);
    }
  });
});

describe("reserve_knowledge_source", () => {
  it("reserves a file as uploading with its key, and nothing reclaimed", async () => {
    const rows = await asService((tx) => reserveFile(tx, PROJECT, MAX, "p/key.pdf"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      project_id: PROJECT,
      title: "A file",
      type: "pdf",
      storage_key: "p/key.pdf",
      status: "uploading",
      reclaimed_storage_keys: [],
    });
    expect(rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reserves pasted text as processing with a null key", async () => {
    const rows = await asService((tx) => reserveText(tx));
    expect(rows[0]).toMatchObject({ type: "text", storage_key: null, status: "processing", reclaimed_storage_keys: [] });
  });

  it("counts files and texts together and refuses at the limit with P0001 knowledge_limit", async () => {
    const result = await asService(async (tx) => {
      await reserveFile(tx);
      await reserveText(tx);
      await reserveFile(tx);
      const file = await caught(tx, () => reserveFile(tx));
      const text = await caught(tx, () => reserveText(tx));
      const { rows } = await tx.query<{ n: number }>(
        "select count(*)::int as n from public.knowledge_sources where project_id = $1",
        [PROJECT],
      );
      return { file, text, count: rows[0]?.n };
    });
    expect(MAX).toBe(3);
    expect(result.file).toMatchObject({ code: "P0001", message: "knowledge_limit" });
    expect(result.text).toMatchObject({ code: "P0001", message: "knowledge_limit" });
    expect(result.count).toBe(MAX);
  });

  it("counts every status, and only this project's sources", async () => {
    const result = await asService(async (tx) => {
      for (const status of ["ready", "failed", "processing"]) await addSource(tx, PROJECT, status);
      for (let i = 0; i < 5; i++) await addSource(tx, OTHER_PROJECT, "ready");
      const blocked = await caught(tx, () => reserveText(tx, PROJECT, 3));
      const allowed = await reserveText(tx, PROJECT, 4);
      return { blocked, allowed };
    });
    expect(result.blocked).toMatchObject({ code: "P0001" });
    expect(result.allowed).toHaveLength(1);
  });

  it("uses the limit it is given (Pro)", async () => {
    const PRO = PLAN_LIMITS.pro.knowledgeSources;
    const result = await asService(async (tx) => {
      for (let i = 0; i < PRO; i++) await (i % 2 ? reserveText(tx, PROJECT, PRO) : reserveFile(tx, PROJECT, PRO));
      return caught(tx, () => reserveFile(tx, PROJECT, PRO));
    });
    expect(result).toMatchObject({ code: "P0001", message: "knowledge_limit" });
  });

  it("reclaims this project's uploading rows older than 2 hours and returns their keys", async () => {
    const result = await asService(async (tx) => {
      const staleA = await addSource(tx, PROJECT, "uploading", { key: "p/stale-a.pdf", age: "3 hours" });
      const staleB = await addSource(tx, PROJECT, "uploading", { key: "p/stale-b.pdf", age: "2 hours 1 minute" });
      const fresh = await addSource(tx, PROJECT, "uploading", { key: "p/fresh.pdf", age: "1 hour 59 minutes" });
      const oldReady = await addSource(tx, PROJECT, "ready", { key: "p/old-ready.pdf", age: "30 days" });
      const oldProcessing = await addSource(tx, PROJECT, "processing", { key: null, age: "30 days" });
      const otherStale = await addSource(tx, OTHER_PROJECT, "uploading", { key: "o/stale.pdf", age: "3 hours" });

      const reserved = await reserveText(tx, PROJECT, 10);
      const { rows } = await tx.query<{ id: string }>("select id from public.knowledge_sources");
      const left = new Set(rows.map((r) => r.id));
      return {
        reclaimed: reserved[0]?.reclaimed_storage_keys,
        gone: [staleA, staleB].filter((id) => !left.has(id)).length,
        kept: [fresh, oldReady, oldProcessing, otherStale].every((id) => left.has(id)),
      };
    });
    expect(result.reclaimed).toEqual(["p/stale-a.pdf", "p/stale-b.pdf"]);
    expect(result.gone).toBe(2);
    expect(result.kept).toBe(true);
  });

  it("reclaims before counting, so stale reservations free their slots", async () => {
    const result = await asService(async (tx) => {
      await addSource(tx, PROJECT, "ready");
      await addSource(tx, PROJECT, "ready");
      await addSource(tx, PROJECT, "uploading", { key: "p/abandoned.pdf", age: "5 hours" });
      return reserveFile(tx, PROJECT, 3, "p/new.pdf");
    });
    expect(result[0]).toMatchObject({ storage_key: "p/new.pdf", reclaimed_storage_keys: ["p/abandoned.pdf"] });
  });

  it("fails with P0002 for an unknown project", async () => {
    const result = await asService((tx) =>
      caught(tx, () => reserveText(tx, "00000000-0000-4000-8000-00000000dead")),
    );
    expect(result).toMatchObject({ code: "P0002", message: "project_not_found" });
  });

  it.each([
    ["a null limit", [PROJECT, "t", "text", null, "processing", null]],
    ["a negative limit", [PROJECT, "t", "text", null, "processing", -1]],
    ["text with a key", [PROJECT, "t", "text", "k.txt", "processing", 3]],
    ["text as uploading", [PROJECT, "t", "text", null, "uploading", 3]],
    ["a file without a key", [PROJECT, "t", "pdf", null, "uploading", 3]],
    ["a file as processing", [PROJECT, "t", "md", "k.md", "processing", 3]],
  ])("rejects %s with 22023", async (_name, args) => {
    const result = await asService((tx) => caught(tx, () => tx.query(RESERVE, args)));
    expect(result).toMatchObject({ code: "22023" });
  });

  it("rejects an unknown type through the table's check constraint", async () => {
    const result = await asService((tx) =>
      caught(tx, () => tx.query(RESERVE, [PROJECT, "t", "docx", "k.docx", "uploading", 3])),
    );
    expect(result).toMatchObject({ code: "23514" });
  });
});

describe("match_chunks", () => {
  it("returns this project's ready chunks only, nearest first, limited to p_match_count", async () => {
    const result = await asService(async (tx) => {
      const ready = await addSource(tx, PROJECT, "ready");
      const ready2 = await addSource(tx, PROJECT, "ready", { key: null });
      const near = await addChunk(tx, PROJECT, ready, "near", vec(1, 0.1));
      const mid = await addChunk(tx, PROJECT, ready2, "mid", vec(1, 1));
      const far = await addChunk(tx, PROJECT, ready, "far", vec(0.1, 1));
      const opposite = await addChunk(tx, PROJECT, ready, "opposite", vec(-1));

      // Exact matches for the query that must never come back.
      for (const status of ["uploading", "processing", "failed"]) {
        const src = await addSource(tx, PROJECT, status);
        await addChunk(tx, PROJECT, src, `not ready: ${status}`, vec(1));
      }
      const other = await addSource(tx, OTHER_PROJECT, "ready");
      await addChunk(tx, OTHER_PROJECT, other, "other project", vec(1));

      const all = (await tx.query<Match>(MATCH, [PROJECT, vec(1), 10])).rows;
      const top2 = (await tx.query<Match>(MATCH, [PROJECT, vec(1), 2])).rows;
      return { all, top2, ids: { near, mid, far, opposite, ready, ready2 } };
    });

    expect(result.all.map((m) => m.id)).toEqual([result.ids.near, result.ids.mid, result.ids.far, result.ids.opposite]);
    expect(result.all[0]).toMatchObject({ source_id: result.ids.ready, content: "near" });
    expect(result.all[1]?.source_id).toBe(result.ids.ready2);
    expect(result.all[0]?.similarity).toBeCloseTo(1 / Math.sqrt(1.01), 5);
    expect(result.all[1]?.similarity).toBeCloseTo(1 / Math.sqrt(2), 5);
    expect(result.all[3]?.similarity).toBeCloseTo(-1, 5);
    expect(result.top2.map((m) => m.id)).toEqual([result.ids.near, result.ids.mid]);
  });

  it("still finds a small project's chunks among many closer chunks of another project", async () => {
    const result = await asService(async (tx) => {
      const other = await addSource(tx, OTHER_PROJECT, "ready");
      await tx.query(
        `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
         select $1, $2, 'other ' || i, (
           select array_agg(case when d = 1 then 1 when d = 2 then i * 0.0001 else 0 end order by d)
           from generate_series(1, 1536) d
         )::extensions.vector
         from generate_series(1, 300) i`,
        [OTHER_PROJECT, other],
      );
      const mine = await addSource(tx, PROJECT, "ready");
      const a = await addChunk(tx, PROJECT, mine, "mine a", vec(0.2, 1));
      const b = await addChunk(tx, PROJECT, mine, "mine b", vec(0, 1));
      const rows = (await tx.query<Match>(MATCH, [PROJECT, vec(1), 5])).rows;
      return { rows, a, b };
    });
    expect(result.rows.map((m) => m.id)).toEqual([result.a, result.b]);
  });

  it("returns nothing for a project without ready chunks", async () => {
    const rows = await asService(async (tx) => (await tx.query<Match>(MATCH, [PROJECT, vec(1), 5])).rows);
    expect(rows).toEqual([]);
  });
});
