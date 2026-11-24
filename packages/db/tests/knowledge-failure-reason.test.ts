// P6H-T04: knowledge_sources.failure_reason, its CHECKs, and who can read or write it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KNOWLEDGE_FAILURE_REASONS } from "../../shared/src/domain";
import { createTestDb, type TestDb } from "../supabase-pglite";

const OWNER = "user_reason";
const OTHER_OWNER = "user_reason_other";
const PROJECT = "00000000-0000-4000-8000-00000000d001";
const OTHER_PROJECT = "00000000-0000-4000-8000-00000000d002";
const FAILED = "00000000-0000-4000-8000-00000000d101";
const READY = "00000000-0000-4000-8000-00000000d102";
const PROCESSING = "00000000-0000-4000-8000-00000000d103";
const OTHER_FAILED = "00000000-0000-4000-8000-00000000d104";

const CHECK_VIOLATION = /violates check constraint/;
const PERMISSION_DENIED = /permission denied/;

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await db.pg.exec(/* sql */ `
    insert into public.accounts (clerk_user_id) values ('${OWNER}'), ('${OTHER_OWNER}');
    insert into public.projects (id, owner_id, name, public_key) values
      ('${PROJECT}', '${OWNER}', 'Mine', 'pk_reason_a'),
      ('${OTHER_PROJECT}', '${OTHER_OWNER}', 'Theirs', 'pk_reason_b');
    insert into public.knowledge_sources (id, project_id, title, type, status, failure_reason) values
      ('${FAILED}', '${PROJECT}', 'Scan', 'pdf', 'failed', 'no_text'),
      ('${READY}', '${PROJECT}', 'FAQ', 'text', 'ready', null),
      ('${PROCESSING}', '${PROJECT}', 'Guide', 'md', 'processing', null),
      ('${OTHER_FAILED}', '${OTHER_PROJECT}', 'Theirs', 'txt', 'failed', 'text_too_long');
  `);
});

afterAll(async () => {
  await db?.close();
});

/** Run `sql` as service_role (writes bypass RLS, like the server) and return the error message, or null. */
const serviceError = async (sql: string, params?: unknown[]) => {
  try {
    await db.asService(sql, params);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
};

describe("the column", () => {
  it("is a nullable text column, null by default", async () => {
    const { rows } = await db.pg.query<{ data_type: string; is_nullable: string; column_default: string | null }>(
      `select data_type, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'knowledge_sources' and column_name = 'failure_reason'`,
    );
    expect(rows).toEqual([{ data_type: "text", is_nullable: "YES", column_default: null }]);
    const inserted = await db.as("service_role", {}, async (tx) => {
      await tx.query(
        `insert into public.knowledge_sources (id, project_id, title, type, status)
         values ('00000000-0000-4000-8000-00000000d1ff', $1, 'New', 'text', 'processing')`,
        [PROJECT],
      );
      return (await tx.query(`select failure_reason from public.knowledge_sources where title = 'New'`)).rows;
    });
    expect(inserted).toEqual([{ failure_reason: null }]);
  });

  it("allows exactly the @askwell/shared reasons", async () => {
    const { rows } = await db.pg.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
       where conname = 'knowledge_sources_failure_reason_check'`,
    );
    expect(rows).toHaveLength(1);
    const allowed = [...(rows[0]?.def ?? "").matchAll(/'([^']*)'/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual([...KNOWLEDGE_FAILURE_REASONS].sort());
  });
});

describe("constraints", () => {
  it.each(KNOWLEDGE_FAILURE_REASONS)("accepts %s on a failed source", async (reason) => {
    expect(await serviceError(`update public.knowledge_sources set failure_reason = $1 where id = $2`, [reason, FAILED])).toBeNull();
  });

  it("rejects an unknown reason", async () => {
    for (const reason of ["boom", "NO_TEXT", ""]) {
      expect(
        await serviceError(`update public.knowledge_sources set failure_reason = $1 where id = $2`, [reason, FAILED]),
        reason,
      ).toMatch(CHECK_VIOLATION);
    }
  });

  it("rejects a reason on a ready, processing or uploading source", async () => {
    expect(
      await serviceError(`update public.knowledge_sources set failure_reason = 'no_text' where id = $1`, [READY]),
    ).toMatch(/knowledge_sources_failure_reason_only_failed/);
    expect(
      await serviceError(`update public.knowledge_sources set failure_reason = 'no_text' where id = $1`, [PROCESSING]),
    ).toMatch(/knowledge_sources_failure_reason_only_failed/);
    expect(
      await serviceError(
        `insert into public.knowledge_sources (project_id, title, type, storage_key, status, failure_reason)
         values ($1, 'x', 'pdf', 'k/x.pdf', 'uploading', 'unreadable')`,
        [PROJECT],
      ),
    ).toMatch(/knowledge_sources_failure_reason_only_failed/);
  });

  it("rejects moving a failed source back to processing or on to ready while it keeps its reason", async () => {
    for (const status of ["processing", "ready", "uploading"]) {
      expect(
        await serviceError(`update public.knowledge_sources set status = $1 where id = $2`, [status, FAILED]),
        status,
      ).toMatch(/knowledge_sources_failure_reason_only_failed/);
    }
  });

  it("allows the transitions the app makes: claim (clear + processing), ready (null), failed (reason)", async () => {
    await db.as("service_role", {}, async (tx) => {
      await tx.query(`update public.knowledge_sources set status = 'processing', failure_reason = null where id = $1`, [FAILED]);
      await tx.query(`update public.knowledge_sources set status = 'failed', failure_reason = 'embedding_failed' where id = $1`, [FAILED]);
      await tx.query(`update public.knowledge_sources set status = 'processing', failure_reason = null where id = $1`, [FAILED]);
      await tx.query(`update public.knowledge_sources set status = 'ready', failure_reason = null where id = $1`, [FAILED]);
      const { rows } = await tx.query(`select status, failure_reason from public.knowledge_sources where id = $1`, [FAILED]);
      expect(rows).toEqual([{ status: "ready", failure_reason: null }]);
    });
  });

  it("allows a failed source with no reason (failed before reasons were stored)", async () => {
    expect(await serviceError(`update public.knowledge_sources set failure_reason = null where id = $1`, [FAILED])).toBeNull();
  });
});

describe("access", () => {
  it("an owner reads their own sources' reasons through RLS, and none of another owner's", async () => {
    const { rows } = await db.asOwner<{ id: string; failure_reason: string | null }>(
      OWNER,
      `select id::text, failure_reason from public.knowledge_sources order by title`,
    );
    expect(rows).toEqual([
      { id: READY, failure_reason: null },
      { id: PROCESSING, failure_reason: null },
      { id: FAILED, failure_reason: "no_text" },
    ]);
  });

  it("an owner can't write the reason", async () => {
    await expect(
      db.asOwner(OWNER, `update public.knowledge_sources set failure_reason = null where id = $1`, [FAILED]),
    ).rejects.toThrow(PERMISSION_DENIED);
  });

  it("anon can't read it", async () => {
    await expect(db.asAnon(`select failure_reason from public.knowledge_sources`)).rejects.toThrow(PERMISSION_DENIED);
  });
});
