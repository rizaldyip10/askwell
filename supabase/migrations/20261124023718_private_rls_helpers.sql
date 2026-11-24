-- Move the RLS helpers out of `public` (Supabase advisor 0029).
--
-- `public` is exposed by the Data API, so `public.owned_project_ids()` and
-- `public.owned_conversation_ids()` were callable through /rest/v1/rpc. They live in
-- `private` now, which the Data API doesn't expose. Same bodies, same grants.
-- Policies that called them are dropped and recreated (same names, same logic) to
-- call the private ones, then the public functions are dropped.
-- Runs as one transaction, so the policies are never missing while it applies.

-- ---------------------------------------------------------------------------
-- Schema. Only `authenticated` needs it (RLS policies run as the caller).
-- ---------------------------------------------------------------------------

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- RLS helpers. SECURITY DEFINER so policies don't recurse through RLS on projects /
-- conversations. They only ever return the caller's own IDs (from the JWT `sub`).
-- ---------------------------------------------------------------------------

create function private.owned_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.projects p
  where p.owner_id = (select auth.jwt() ->> 'sub');
$$;

create function private.owned_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.conversations c
  join public.projects p on p.id = c.project_id
  where p.owner_id = (select auth.jwt() ->> 'sub');
$$;

revoke execute on function private.owned_project_ids() from public, anon, service_role;
revoke execute on function private.owned_conversation_ids() from public, anon, service_role;
grant execute on function private.owned_project_ids() to authenticated;
grant execute on function private.owned_conversation_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Policies: same names and logic, now calling the private helpers.
-- ---------------------------------------------------------------------------

drop policy widget_configs_select_own on public.widget_configs;
create policy widget_configs_select_own on public.widget_configs
  for select to authenticated
  using (project_id in (select private.owned_project_ids()));

drop policy knowledge_sources_select_own on public.knowledge_sources;
create policy knowledge_sources_select_own on public.knowledge_sources
  for select to authenticated
  using (project_id in (select private.owned_project_ids()));

drop policy knowledge_chunks_select_own on public.knowledge_chunks;
create policy knowledge_chunks_select_own on public.knowledge_chunks
  for select to authenticated
  using (project_id in (select private.owned_project_ids()));

drop policy conversations_select_own on public.conversations;
create policy conversations_select_own on public.conversations
  for select to authenticated
  using (project_id in (select private.owned_project_ids()));

drop policy messages_select_own on public.messages;
create policy messages_select_own on public.messages
  for select to authenticated
  using (conversation_id in (select private.owned_conversation_ids()));

-- ---------------------------------------------------------------------------
-- Drop the public helpers. No policy depends on them any more (a remaining one
-- would make this fail), and no app code calls them.
-- ---------------------------------------------------------------------------

drop function public.owned_project_ids();
drop function public.owned_conversation_ids();
