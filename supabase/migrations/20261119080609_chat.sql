-- chat: consume_message, conversation_belongs and save_chat_turn, the three functions the
-- chat route (POST /api/widget/chat) calls (project.md §6.6 steps 2, 3 and 6, §6.12, §7, §9).
-- New functions only; no table or column changes.
--
-- Route order (§6.6):
--   2. Validate: if the request has a conversationId, conversation_belongs(project, id)
--      must be true, else 404 and nothing is counted.
--   3. Count:    consume_message(project, PLAN_LIMITS[plan].messagesPerMonth), before OpenAI.
--   6. Save:     save_chat_turn(...) after the reply.
--
-- All three: SECURITY INVOKER, search_path = '', EXECUTE for service_role only.

-- ---------------------------------------------------------------------------
-- consume_message: count one visitor message against the project's monthly quota.
--
-- Returns the new messages_used. The route reads the plan on the server and passes
-- p_max_messages from PLAN_LIMITS.
--
-- Steps, under a FOR UPDATE lock on the project row (so concurrent calls for one project
-- run one after the other: two calls at limit - 1 can't both pass):
--   1. Monthly reset. The period is rolling, anchored on period_start: when now() is at
--      or past period_start + 1 month, period_start moves forward by the number of whole
--      months that have passed (period_start + n months <= now() < period_start + n+1
--      months) and messages_used goes back to 0. Stepping in whole months keeps the
--      period aligned to the same day, so a project idle for a long time doesn't drift to
--      "the day of the next message". Month arithmetic is Postgres's: a month-end start
--      is clamped (Jan 31 + 1 month = Feb 28), and from then on the period starts on the
--      28th. Interval math runs in the session time zone (UTC on Supabase).
--   2. If messages_used >= p_max_messages, raise P0001 'quota_exceeded'.
--   3. Otherwise increment and return the new count.
--
-- On the error the whole call rolls back (the reset too); the next call recomputes it.
--
-- Errors the route maps:
--   P0001 'quota_exceeded'    the project used its p_max_messages this period
--   P0002 'project_not_found' no project with p_project_id
--   22023                     a null or negative p_max_messages
-- ---------------------------------------------------------------------------

create function public.consume_message(
  p_project_id uuid,
  p_max_messages integer
)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_used integer;
  v_period_start timestamptz;
  v_now timestamptz := now();
  v_age interval;
  v_months integer;
begin
  if p_max_messages is null or p_max_messages < 0 then
    raise exception 'p_max_messages must be a non-negative integer' using errcode = '22023';
  end if;

  select p.messages_used, p.period_start
  into v_used, v_period_start
  from public.projects p
  where p.id = p_project_id
  for update;

  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if v_period_start + interval '1 month' <= v_now then
    -- Whole months since period_start. age() gives a close first guess; the two loops
    -- make it exact with the same `+ n months` arithmetic that moves period_start.
    v_age := age(v_now, v_period_start);
    v_months := greatest(1, (extract(year from v_age) * 12 + extract(month from v_age))::integer);
    while v_period_start + make_interval(months => v_months) > v_now loop
      v_months := v_months - 1;
    end loop;
    while v_period_start + make_interval(months => v_months + 1) <= v_now loop
      v_months := v_months + 1;
    end loop;

    v_period_start := v_period_start + make_interval(months => v_months);
    v_used := 0;
  end if;

  if v_used >= p_max_messages then
    raise exception 'quota_exceeded'
      using errcode = 'P0001',
            detail = format('%s of %s messages used this period', v_used, p_max_messages);
  end if;

  update public.projects p
  set messages_used = v_used + 1,
      period_start = v_period_start
  where p.id = p_project_id;

  return v_used + 1;
end;
$$;

revoke execute on function public.consume_message(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_message(uuid, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- conversation_belongs: true if p_conversation_id is a conversation of p_project_id.
--
-- The cheap check the route runs before consume_message (§6.6 step 2): a given
-- conversationId of another project, or an unknown one, is a 404 and nothing is counted.
-- save_chat_turn checks it again, since the conversation could be deleted in between.
-- A null p_conversation_id returns false.
-- ---------------------------------------------------------------------------

create function public.conversation_belongs(
  p_project_id uuid,
  p_conversation_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and c.project_id = p_project_id
  );
$$;

revoke execute on function public.conversation_belongs(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.conversation_belongs(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- save_chat_turn: save one visitor message and the bot's reply. Returns the conversation id.
--
--   p_conversation_id null → a new conversation for p_project_id and p_visitor_id.
--   p_conversation_id set  → it must belong to p_project_id, else P0002
--                            'conversation_not_found'. p_visitor_id is then not used.
--
-- The visitor message is inserted first, then the bot message. Both get explicit
-- created_at values, because the column default now() is the transaction start and would
-- give both rows the same time: the visitor's is clock time (or 1 µs after the
-- conversation's latest message, if that is later), the bot's 1 µs after the visitor's.
-- So ordering by created_at always gives visitor, bot, visitor, bot...
--
-- Errors the route maps:
--   P0002 'conversation_not_found' the given conversation isn't this project's
--   23503                          no project with p_project_id (new conversation only)
--   23502                          a null visitor id (new conversation), message or reply
-- ---------------------------------------------------------------------------

create function public.save_chat_turn(
  p_project_id uuid,
  p_conversation_id uuid,
  p_visitor_id text,
  p_visitor_message text,
  p_bot_reply text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_at timestamptz;
begin
  if p_conversation_id is null then
    insert into public.conversations (project_id, visitor_id)
    values (p_project_id, p_visitor_id)
    returning id into v_conversation_id;
  else
    select c.id into v_conversation_id
    from public.conversations c
    where c.id = p_conversation_id
      and c.project_id = p_project_id;

    if not found then
      raise exception 'conversation_not_found' using errcode = 'P0002';
    end if;
  end if;

  -- Clock time, but never at or before the conversation's latest message, so turns stay in
  -- order even when the clock is coarse or two turns land in the same instant.
  select greatest(clock_timestamp(), max(m.created_at) + interval '1 microsecond')
  into v_at
  from public.messages m
  where m.conversation_id = v_conversation_id;

  insert into public.messages (conversation_id, role, body, created_at)
  values (v_conversation_id, 'visitor', p_visitor_message, v_at);

  insert into public.messages (conversation_id, role, body, created_at)
  values (v_conversation_id, 'bot', p_bot_reply, v_at + interval '1 microsecond');

  return v_conversation_id;
end;
$$;

revoke execute on function public.save_chat_turn(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_chat_turn(uuid, uuid, text, text, text)
  to service_role;
