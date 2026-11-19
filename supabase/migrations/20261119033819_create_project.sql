-- create_project: the plan-limited project insert (project.md §5, §7, §9).
--
-- Only service_role may execute it. The route reads the plan on the server and passes the
-- limit from PLAN_LIMITS and the widget defaults from DEFAULT_WIDGET_CONFIG (@askwell/shared);
-- SQL holds no copy of either.
--
-- Concurrency: the owner's accounts row is locked FOR UPDATE before counting, so two calls
-- for the same owner run one after the other and can't both pass the limit check.
--
-- Errors the route maps:
--   P0001 'plan_limit'        the owner already has p_max_projects projects  → 402/403 plan_limit
--   P0002 'account_not_found' no accounts row for p_owner_id
--   23505 (unique_violation)  duplicate public_key; the route retries with a new key

create function public.create_project(
  p_owner_id text,
  p_name text,
  p_public_key text,
  p_max_projects integer,
  p_button_color text,
  p_position text,
  p_label text,
  p_animation text,
  p_header_text text,
  p_show_badge boolean
)
returns public.projects
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_project public.projects;
begin
  if p_max_projects is null or p_max_projects < 0 then
    raise exception 'p_max_projects must be a non-negative integer' using errcode = '22023';
  end if;

  perform 1
  from public.accounts a
  where a.clerk_user_id = p_owner_id
  for update;

  if not found then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_count
  from public.projects p
  where p.owner_id = p_owner_id;

  if v_count >= p_max_projects then
    raise exception 'plan_limit'
      using errcode = 'P0001',
            detail = format('%s of %s projects used', v_count, p_max_projects);
  end if;

  insert into public.projects (owner_id, name, public_key)
  values (p_owner_id, p_name, p_public_key)
  returning * into v_project;

  insert into public.widget_configs
    (project_id, button_color, position, label, animation, header_text, show_badge)
  values
    (v_project.id, p_button_color, p_position, p_label, p_animation, p_header_text, p_show_badge);

  return v_project;
end;
$$;

revoke execute on function public.create_project(
  text, text, text, integer, text, text, text, text, text, boolean
) from public, anon, authenticated;

grant execute on function public.create_project(
  text, text, text, integer, text, text, text, text, text, boolean
) to service_role;
