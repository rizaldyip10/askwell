-- chat: consume_message (with its helper message_period_start), conversation_belongs and
-- save_chat_turn, the functions the chat route (POST /api/widget/chat) calls
-- (project.md §6.6 steps 2, 3 and 6, §6.12, §7, §9).
-- New functions only; no table or column changes.
--
-- Route order (§6.6):
--   2. Validate: if the request has a conversationId, conversation_belongs(project, id)
--      must be true, else 404 and nothing is counted.
--   3. Count:    consume_message(project, PLAN_LIMITS[plan].messagesPerMonth), before OpenAI.
--   6. Save:     save_chat_turn(...) after the reply.
--
-- All of them: SECURITY INVOKER, search_path = '', EXECUTE for service_role only.

-- ---------------------------------------------------------------------------
-- message_period_start: the start of the quota period that contains p_now.
--
-- The period is rolling, anchored on the stored period_start. While p_now is at or past
-- start + 1 month, the start moves one month forward. So a project idle for a long time
-- keeps its day of the month instead of drifting to "the day of the next message".
--
-- It steps one month at a time, never n months at once, because Postgres clamps each
-- month addition on its own: from Jan 31, + 2 months is Mar 31, but + 1 month twice is
-- Feb 28 then Mar 28. Only the step-by-step result is a start whose next boundary
-- (start + 1 month, the check consume_message runs) is after p_now, so the next call
-- doesn't reset again. A month-end start therefore moves to the clamped day (Jan 31 →
-- Feb 28) and stays on it. Interval math uses the session time zone (UTC on Supabase).
--
-- p_now is a parameter so the tests can check fixed dates. consume_message passes now().
-- ---------------------------------------------------------------------------

create function public.message_period_start(
  p_period_start timestamptz,
  p_now timestamptz
)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_start timestamptz := p_period_start;
begin
  while v_start + interval '1 month' <= p_now loop
    v_start := v_start + interval '1 month';
  end loop;
  return v_start;
end;
$$;

revoke execute on function public.message_period_start(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.message_period_start(timestamptz, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- consume_message: count one visitor message against the project's monthly quota.
--
-- Returns the new messages_used. The route reads the plan on the server and passes
-- p_max_messages from PLAN_LIMITS.
--
-- Steps, under a FOR UPDATE lock on the project row (so concurrent calls for one project
-- run one after the other: two calls at limit - 1 can't both pass):
--   1. Monthly reset, by message_period_start (above). When now() is at or past
--      period_start + 1 month, period_start moves forward in whole-month steps to the
--      period that contains now(), and messages_used goes back to 0.
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
    v_period_start := public.message_period_start(v_period_start, v_now);
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
-- An existing conversation's row is locked (FOR NO KEY UPDATE) before that read, so two
-- concurrent turns in one conversation run one after the other and can't read the same
-- latest time. The lock still lets other transactions insert messages that reference it.
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
      and c.project_id = p_project_id
    for no key update;

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
