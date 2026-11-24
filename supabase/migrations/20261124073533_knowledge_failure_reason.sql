-- Why a knowledge source failed (project.md §6.4), so the Knowledge page can say more than
-- "Failed". Approved by the product owner on 2026-11-24.
--
-- Additive only: a new nullable column, and every existing row stays valid (null reason).
-- The live app keeps working while this runs: it never selects or writes the column.
--
-- The values must match KNOWLEDGE_FAILURE_REASONS in packages/shared/src/domain.ts
-- (the pglite tests check that they do).
--
-- Grants: none needed. authenticated already has table-level SELECT on knowledge_sources
-- (RLS still scopes the rows) and service_role has ALL, so both reach the new column.
-- Owners still can't write it: they have no UPDATE on this table.

alter table public.knowledge_sources
  add column failure_reason text null,
  add constraint knowledge_sources_failure_reason_check check (
    failure_reason in (
      'unreadable',
      'no_text',
      'text_too_long',
      'file_too_large',
      'download_failed',
      'embedding_failed',
      'database_failed',
      'source_not_found',
      'not_processing'
    )
  ),
  -- A reason only on a failed source. Moving a source back to processing, or on to ready,
  -- must clear it in the same update.
  add constraint knowledge_sources_failure_reason_only_failed check (
    failure_reason is null or status = 'failed'
  );

comment on column public.knowledge_sources.failure_reason is
  'Why processing failed (KNOWLEDGE_FAILURE_REASONS); null unless status = ''failed''.';
