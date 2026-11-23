-- owner_activity: the dashboard's usage numbers for each project the caller can see
-- (project.md §6.12, §7). New function only; no table or column changes.
--
-- Why: projects.messages_used is reset lazily, by consume_message on the next chat. After a
-- month rolls over, the stored count is last period's until a visitor writes again. This
-- function returns this period's real number without writing anything.
--
-- SECURITY INVOKER, so the projects_select_own RLS policy decides which rows the caller
-- sees: an owner gets their own projects, service_role gets every project.
--
-- The period rule is the same as message_period_start (20261119080609_chat.sql): a rolling
-- month anchored on the stored period_start, stepped forward one month at a time. It is
-- repeated inline here, not called, because message_period_start is service_role only and
-- §7 lets authenticated execute owner_activity and nothing else. The pglite tests check the
-- two give the same start, month-end dates included, so they can't drift apart unnoticed.
--
-- Returns, per project:
--   project_id
--   messages_used  the stored count, or 0 when the stored period has ended
--   period_start   start of the period that contains now()
--   period_end     period_start + 1 month (exclusive: the next reset happens at this time)
-- ---------------------------------------------------------------------------

create function public.owner_activity()
returns table (
  project_id uuid,
  messages_used integer,
  period_start timestamptz,
  period_end timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_project record;
  v_start timestamptz;
begin
  for v_project in
    select p.id, p.messages_used, p.period_start
    from public.projects p
    order by p.created_at, p.id
  loop
    v_start := v_project.period_start;
    -- Same loop as message_period_start: one month per step (see its comment).
    while v_start + interval '1 month' <= v_now loop
      v_start := v_start + interval '1 month';
    end loop;

    project_id := v_project.id;
    messages_used := case
      when v_start = v_project.period_start then v_project.messages_used
      else 0
    end;
    period_start := v_start;
    period_end := v_start + interval '1 month';
    return next;
  end loop;
end;
$$;

revoke execute on function public.owner_activity()
  from public, anon;
grant execute on function public.owner_activity()
  to authenticated, service_role;
