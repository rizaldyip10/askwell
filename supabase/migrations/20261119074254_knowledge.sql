-- knowledge: the `knowledge` Storage bucket, reserve_knowledge_source and match_chunks
-- (project.md §3, §6.4, §6.6 step 4, §7, §9). New objects only; no table or column changes.

-- ---------------------------------------------------------------------------
-- Storage bucket
--
-- Private. Only service_role touches it: no storage.objects policies for anon or
-- authenticated. The browser uploads with a one-time signed URL made by the server.
--
-- The size and MIME list are copies of @askwell/shared (packages/shared/src/limits.ts):
--   file_size_limit    = MAX_KNOWLEDGE_FILE_BYTES (10 MB)
--   allowed_mime_types = KNOWLEDGE_ALLOWED_MIME_TYPES
-- packages/db/tests/knowledge.test.ts asserts they match.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge',
  'knowledge',
  false,
  10485760,
  array['application/pdf', 'text/markdown', 'text/x-markdown', 'text/plain']
);

-- ---------------------------------------------------------------------------
-- reserve_knowledge_source: the plan-limited knowledge source insert.
--
-- The route reads the plan on the server and passes p_max_sources from PLAN_LIMITS.
-- Pasted text: p_type 'text', p_storage_key null, p_status 'processing'.
-- File:        p_type 'pdf' | 'md' | 'txt', p_storage_key set, p_status 'uploading'.
--
-- Steps, under a FOR UPDATE lock on the project row (so concurrent calls for one project
-- run one after the other and can't both pass the limit):
--   1. Reclaim stale reservations: delete this project's 'uploading' rows older than
--      2 hours. Their storage keys come back so the route can remove the files.
--   2. Count every source of the project (files and texts together).
--   3. Raise P0001 'knowledge_limit' if the count is at p_max_sources.
--   4. Insert the new row.
--
-- Returns exactly one row: the new knowledge_sources row's columns plus
-- `reclaimed_storage_keys text[]` (the files of the reclaimed reservations; empty if none).
-- The route removes those files from the bucket after the call.
--
-- On any error the whole call rolls back, reclaimed rows included, so no key is lost:
-- the next successful call reclaims them.
--
-- Errors the route maps:
--   P0001 'knowledge_limit'   the project already has p_max_sources sources → 402/403
--   P0002 'project_not_found' no project with p_project_id
--   22023                     bad arguments (limit, or a type/key/status mismatch)
-- ---------------------------------------------------------------------------

create function public.reserve_knowledge_source(
  p_project_id uuid,
  p_title text,
  p_type text,
  p_storage_key text,
  p_status text,
  p_max_sources integer
)
returns table (
  id uuid,
  project_id uuid,
  title text,
  type text,
  storage_key text,
  status text,
  created_at timestamptz,
  reclaimed_storage_keys text[]
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_count integer;
  v_reclaimed text[];
  v_source public.knowledge_sources;
begin
  if p_max_sources is null or p_max_sources < 0 then
    raise exception 'p_max_sources must be a non-negative integer' using errcode = '22023';
  end if;

  if p_type = 'text' then
    if p_storage_key is not null or p_status is distinct from 'processing' then
      raise exception 'pasted text needs a null storage key and status processing' using errcode = '22023';
    end if;
  elsif p_storage_key is null or p_status is distinct from 'uploading' then
    raise exception 'a file needs a storage key and status uploading' using errcode = '22023';
  end if;

  perform 1
  from public.projects p
  where p.id = p_project_id
  for update;

  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  with reclaimed as (
    delete from public.knowledge_sources ks
    where ks.project_id = p_project_id
      and ks.status = 'uploading'
      and ks.created_at < now() - interval '2 hours'
    returning ks.storage_key
  )
  select coalesce(array_agg(r.storage_key order by r.storage_key), '{}')
  into v_reclaimed
  from reclaimed r
  where r.storage_key is not null;

  select count(*)::integer into v_count
  from public.knowledge_sources ks
  where ks.project_id = p_project_id;

  if v_count >= p_max_sources then
    raise exception 'knowledge_limit'
      using errcode = 'P0001',
            detail = format('%s of %s knowledge sources used', v_count, p_max_sources);
  end if;

  insert into public.knowledge_sources as ks (project_id, title, type, storage_key, status)
  values (p_project_id, p_title, p_type, p_storage_key, p_status)
  returning ks.* into v_source;

  return query
  select v_source.id, v_source.project_id, v_source.title, v_source.type,
         v_source.storage_key, v_source.status, v_source.created_at, v_reclaimed;
end;
$$;

revoke execute on function public.reserve_knowledge_source(uuid, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_knowledge_source(uuid, text, text, text, text, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- match_chunks: the p_match_count chunks nearest to p_embedding (cosine), from this
-- project's 'ready' sources only, nearest first. similarity = 1 - cosine distance.
--
-- Exact scan, on purpose. The HNSW index on knowledge_chunks.embedding is shared by every
-- project and filters after it finds neighbors, so a project with few chunks among many
-- other projects' chunks could get fewer than p_match_count rows, or none. The
-- MATERIALIZED CTE narrows to this project's ready chunks first (project_id index), so
-- the HNSW index can't be used and the result is always complete and exactly ordered.
-- The scan covers one project's chunks only, bounded by its plan's source limit (25 on
-- Pro). If that ever gets slow, switch to `hnsw.iterative_scan` (pgvector 0.8) instead.
-- ---------------------------------------------------------------------------

create function public.match_chunks(
  p_project_id uuid,
  p_embedding extensions.vector(1536),
  p_match_count integer
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as materialized (
    select c.id, c.source_id, c.content, c.embedding
    from public.knowledge_chunks c
    join public.knowledge_sources s
      on s.id = c.source_id
     and s.project_id = c.project_id
    where c.project_id = p_project_id
      and s.status = 'ready'
  )
  select
    m.id,
    m.source_id,
    m.content,
    1 - (m.embedding operator(extensions.<=>) p_embedding) as similarity
  from candidates m
  order by m.embedding operator(extensions.<=>) p_embedding, m.id
  limit p_match_count;
$$;

revoke execute on function public.match_chunks(uuid, extensions.vector, integer)
  from public, anon, authenticated;
grant execute on function public.match_chunks(uuid, extensions.vector, integer)
  to service_role;
