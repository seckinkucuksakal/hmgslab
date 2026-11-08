-- Live exam lobby: who is in the room + lobby chat
--
-- * Chat messages are written only through send_lobby_message(), which stores
--   them with the server-side display name, so nobody can fake a message or a
--   name. Clients receive new messages through Realtime postgres_changes on
--   lobby_messages; RLS limits that (and history) to users enrolled in the
--   exam (or admins).
-- * Who is in the room uses Realtime Presence on 'exam-lobby:<exam_id>',
--   keyed by user id only. The client shows a person only if the server lists
--   them as enrolled (get_lobby_state), and names always come from the server.
-- * Chat is open from lobby opening until the exam starts; no chatting during
--   the exam. Names follow the leaderboard privacy setting
--   (private.leaderboard_display_name).

-- ---------------------------------------------------------------------------
-- membership
-- ---------------------------------------------------------------------------
create or replace function private.is_exam_lobby_member(p_exam_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    private.is_admin()
    or exists (
      select 1 from public.exam_enrollments en
      where en.exam_id = p_exam_id
        and en.user_id = auth.uid()
        and en.status = 'active'
    )
  )
$$;
revoke all on function private.is_exam_lobby_member(uuid) from public;

-- RLS policies run as the signed-in user, who has no access to the private
-- schema; this public wrapper exposes only the yes/no answer.
create or replace function public.is_exam_lobby_member(p_exam_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_exam_lobby_member(p_exam_id) $$;
revoke all on function public.is_exam_lobby_member(uuid) from public, anon;
grant execute on function public.is_exam_lobby_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- chat storage
-- ---------------------------------------------------------------------------
create table public.lobby_messages (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index lobby_messages_exam_idx on public.lobby_messages (exam_id, created_at desc);
create index lobby_messages_user_idx on public.lobby_messages (user_id, created_at desc);
alter table public.lobby_messages enable row level security;
-- write only through send_lobby_message(); read (history and Realtime) as a member
revoke all on public.lobby_messages from anon, authenticated;
grant select on public.lobby_messages to authenticated;
create policy "Exam lobby members read lobby messages"
  on public.lobby_messages for select to authenticated
  using (public.is_exam_lobby_member(exam_id));

alter publication supabase_realtime add table public.lobby_messages;

-- p_viewer_is_self: show the real name to the user themself; everyone else
-- (and stored chat messages) follow the leaderboard privacy setting.
create or replace function private.lobby_name(p_user_id uuid, p_viewer_is_self boolean)
returns text
language sql stable security definer set search_path = ''
as $$
  select private.leaderboard_display_name(
    p.display_name, p.show_in_leaderboard, p_viewer_is_self
  )
  from public.profiles p
  where p.id = p_user_id
$$;
revoke all on function private.lobby_name(uuid, boolean) from public;

create or replace function private.lobby_chat_open(p_exam public.exams)
returns boolean
language sql stable set search_path = ''
as $$
  select p_exam.exam_mode = 'scheduled'
    and p_exam.lobby_open_at is not null
    and now() >= p_exam.lobby_open_at
    and now() < p_exam.scheduled_start_at
$$;
revoke all on function private.lobby_chat_open(public.exams) from public;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.get_lobby_state(p_exam_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_exam public.exams;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_exam from public.exams where id = p_exam_id and is_active;
  if not found then
    raise exception 'Deneme bulunamadı';
  end if;

  if not private.is_exam_lobby_member(p_exam_id) then
    raise exception 'Bu denemeye kayıtlı değilsiniz';
  end if;

  return jsonb_build_object(
    'me', auth.uid(),
    'chat_open', private.lobby_chat_open(v_exam),
    'enrolled_count', (
      select count(*) from public.exam_enrollments
      where exam_id = p_exam_id and status = 'active'
    ),
    -- names of everyone allowed in the room; presence only carries user ids
    'participants', coalesce((
      select jsonb_object_agg(en.user_id, private.lobby_name(en.user_id, en.user_id = auth.uid()))
      from public.exam_enrollments en
      where en.exam_id = p_exam_id and en.status = 'active'
    ), '{}'::jsonb),
    'messages', coalesce((
      select jsonb_agg(m order by m.created_at)
      from (
        select id, user_id, display_name, body, created_at
        from public.lobby_messages
        where exam_id = p_exam_id
        order by created_at desc
        limit 50
      ) m
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_lobby_state(uuid) from public, anon;
grant execute on function public.get_lobby_state(uuid) to authenticated;

create or replace function public.send_lobby_message(p_exam_id uuid, p_body text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_exam public.exams;
  v_body text := btrim(coalesce(p_body, ''));
  v_msg public.lobby_messages;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_exam from public.exams where id = p_exam_id and is_active;
  if not found then
    raise exception 'Deneme bulunamadı';
  end if;

  if not private.is_exam_lobby_member(p_exam_id) then
    raise exception 'Bu denemeye kayıtlı değilsiniz';
  end if;

  if not private.lobby_chat_open(v_exam) then
    raise exception 'Sohbet yalnızca sınav başlamadan önce açıktır';
  end if;

  if char_length(v_body) = 0 then
    raise exception 'Mesaj boş olamaz';
  end if;
  if char_length(v_body) > 300 then
    raise exception 'Mesaj en fazla 300 karakter olabilir';
  end if;

  -- simple flood protection: one message every 2 seconds per user and room
  if exists (
    select 1 from public.lobby_messages
    where exam_id = p_exam_id and user_id = v_uid
      and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'Çok hızlı mesaj gönderiyorsunuz';
  end if;

  insert into public.lobby_messages (exam_id, user_id, display_name, body)
  values (p_exam_id, v_uid, coalesce(private.lobby_name(v_uid, false), 'Kullanıcı'), v_body)
  returning * into v_msg;

  -- other members receive it through Realtime postgres_changes
  return jsonb_build_object(
    'id', v_msg.id,
    'user_id', v_msg.user_id,
    'display_name', v_msg.display_name,
    'body', v_msg.body,
    'created_at', v_msg.created_at
  );
end;
$$;
revoke all on function public.send_lobby_message(uuid, text) from public, anon;
grant execute on function public.send_lobby_message(uuid, text) to authenticated;
