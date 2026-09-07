-- Phase 12: scheduled live exam mode (server-authoritative timing)

-- ---------------------------------------------------------------------------
-- exam scheduling columns
-- ---------------------------------------------------------------------------
alter table public.exams
  add column exam_mode text not null default 'practice',
  add column scheduled_start_at timestamptz,
  add column lobby_open_at timestamptz,
  add column late_entry_until timestamptz,
  add column scheduled_end_at timestamptz,
  add column results_publish_at timestamptz,
  add column lobby_offset_minutes integer not null default 30,
  add column late_entry_minutes integer not null default 10,
  add column results_delay_minutes integer not null default 30;

alter table public.exams
  add constraint exams_exam_mode_check
    check (exam_mode in ('practice', 'scheduled'));

alter table public.exams
  add constraint exams_practice_has_no_schedule check (
    exam_mode <> 'practice'
    or (
      scheduled_start_at is null
      and lobby_open_at is null
      and late_entry_until is null
      and scheduled_end_at is null
      and results_publish_at is null
    )
  );

alter table public.exams
  add constraint exams_scheduled_has_schedule check (
    exam_mode <> 'scheduled'
    or (
      scheduled_start_at is not null
      and lobby_open_at is not null
      and late_entry_until is not null
      and scheduled_end_at is not null
      and results_publish_at is not null
    )
  );

alter table public.exams
  add constraint exams_lobby_offset_positive check (lobby_offset_minutes > 0),
  add constraint exams_late_entry_nonnegative check (late_entry_minutes >= 0),
  add constraint exams_results_delay_nonnegative check (results_delay_minutes >= 0);

create index exams_scheduled_start_idx
  on public.exams (scheduled_start_at)
  where exam_mode = 'scheduled';

-- ---------------------------------------------------------------------------
-- attempt snapshot for global scheduled end
-- ---------------------------------------------------------------------------
alter table public.exam_attempts
  add column scheduled_end_at_snapshot timestamptz;

-- ---------------------------------------------------------------------------
-- compute and validate scheduled timestamps (authoritative, DB-side)
-- ---------------------------------------------------------------------------
create or replace function private.apply_scheduled_exam_times()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.exam_mode = 'practice' then
    new.scheduled_start_at := null;
    new.lobby_open_at := null;
    new.late_entry_until := null;
    new.scheduled_end_at := null;
    new.results_publish_at := null;
    return new;
  end if;

  if new.scheduled_start_at is null then
    raise exception 'Scheduled exams require scheduled_start_at';
  end if;

  if new.duration_minutes <= 0 then
    raise exception 'Duration must be positive';
  end if;

  new.lobby_open_at :=
    new.scheduled_start_at - (new.lobby_offset_minutes * interval '1 minute');
  new.late_entry_until :=
    new.scheduled_start_at + (new.late_entry_minutes * interval '1 minute');
  new.scheduled_end_at :=
    new.scheduled_start_at + (new.duration_minutes * interval '1 minute');
  new.results_publish_at :=
    new.scheduled_end_at + (new.results_delay_minutes * interval '1 minute');

  if new.lobby_open_at >= new.scheduled_start_at then
    raise exception 'Lobby must open before scheduled start';
  end if;

  if new.late_entry_until > new.scheduled_end_at then
    raise exception 'Late entry window cannot extend past exam end';
  end if;

  if new.results_publish_at < new.scheduled_end_at then
    raise exception 'Results cannot publish before exam ends';
  end if;

  return new;
end;
$$;

create trigger exams_apply_scheduled_times
  before insert or update on public.exams
  for each row
  execute function private.apply_scheduled_exam_times();

-- ---------------------------------------------------------------------------
-- Istanbul local → timestamptz (admin configuration helper)
-- ---------------------------------------------------------------------------
create or replace function public.istanbul_local_to_timestamptz(
  p_date text,
  p_time text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp;
begin
  if not private.is_admin() then
    raise exception 'Unauthorized';
  end if;

  begin
    v_local := (p_date || ' ' || p_time)::timestamp;
  exception
    when others then
      raise exception 'Invalid date or time format';
  end;

  return v_local at time zone 'Europe/Istanbul';
end;
$$;

revoke all on function public.istanbul_local_to_timestamptz(text, text) from public, anon;
grant execute on function public.istanbul_local_to_timestamptz(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- authoritative server clock
-- ---------------------------------------------------------------------------
create or replace function public.get_server_time()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'server_now', now(),
    'timezone', 'Europe/Istanbul'
  );
$$;

revoke all on function public.get_server_time() from public, anon;
grant execute on function public.get_server_time() to authenticated;

-- ---------------------------------------------------------------------------
-- live exam state (single source of truth)
-- ---------------------------------------------------------------------------
create or replace function private.compute_exam_live_state(
  p_exam public.exams,
  p_now timestamptz default now()
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_exam.exam_mode <> 'scheduled' then
    return 'practice';
  end if;

  if p_now < p_exam.lobby_open_at then
    return 'upcoming';
  elsif p_now < p_exam.scheduled_start_at then
    return 'lobby_open';
  elsif p_now < p_exam.late_entry_until then
    return 'in_progress_entry_open';
  elsif p_now < p_exam.scheduled_end_at then
    return 'in_progress_entry_closed';
  elsif p_now < p_exam.results_publish_at then
    return 'results_pending';
  else
    return 'results_published';
  end if;
end;
$$;

revoke all on function private.compute_exam_live_state(public.exams, timestamptz) from public;

-- ---------------------------------------------------------------------------
-- scheduled results embargo check
-- ---------------------------------------------------------------------------
create or replace function private.scheduled_results_available(
  p_exam public.exams,
  p_now timestamptz default now()
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    case
      when p_exam.exam_mode <> 'scheduled' then true
      else p_now >= p_exam.results_publish_at
    end;
$$;

revoke all on function private.scheduled_results_available(public.exams, timestamptz) from public;

-- ---------------------------------------------------------------------------
-- remaining seconds (practice vs scheduled global end)
-- ---------------------------------------------------------------------------
create or replace function private.attempt_remaining_seconds(p_attempt public.exam_attempts)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(
    0,
    floor(
      extract(
        epoch from (
          case
            when p_attempt.scheduled_end_at_snapshot is not null then
              p_attempt.scheduled_end_at_snapshot - now()
            else
              p_attempt.started_at
                + (p_attempt.duration_minutes_snapshot * interval '1 minute')
                - now()
          end
        )
      )
    )::integer
  );
$$;

-- ---------------------------------------------------------------------------
-- expire / finalize attempt when deadline reached
-- ---------------------------------------------------------------------------
create or replace function private.expire_attempt_if_needed(p_attempt_id uuid)
returns public.exam_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
  v_deadline timestamptz;
begin
  select * into v_attempt
  from public.exam_attempts
  where id = p_attempt_id
  for update;

  if not found then
    raise exception 'Attempt not found';
  end if;

  if v_attempt.status <> 'in_progress' then
    return v_attempt;
  end if;

  if v_attempt.scheduled_end_at_snapshot is not null then
    v_deadline := v_attempt.scheduled_end_at_snapshot;
  else
    v_deadline := v_attempt.started_at
      + (v_attempt.duration_minutes_snapshot * interval '1 minute');
  end if;

  if now() >= v_deadline then
    perform private.score_exam_attempt(p_attempt_id);

    update public.exam_attempts
    set
      status = 'expired',
      submitted_at = coalesce(submitted_at, now())
    where id = p_attempt_id
    returning * into v_attempt;
  end if;

  return v_attempt;
end;
$$;

-- ---------------------------------------------------------------------------
-- safety net: finalize overdue scheduled attempts (cron / manual)
-- ---------------------------------------------------------------------------
create or replace function private.finalize_overdue_scheduled_attempts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_id uuid;
  v_count integer := 0;
begin
  for v_attempt_id in
    select ea.id
    from public.exam_attempts ea
    where ea.status = 'in_progress'
      and ea.scheduled_end_at_snapshot is not null
      and now() >= ea.scheduled_end_at_snapshot
  loop
    perform private.expire_attempt_if_needed(v_attempt_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function private.finalize_overdue_scheduled_attempts() from public;

-- ---------------------------------------------------------------------------
-- RPC: live exam status
-- ---------------------------------------------------------------------------
create or replace function public.get_exam_live_status(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_exam public.exams;
  v_now timestamptz := now();
  v_state text;
  v_attempt public.exam_attempts;
  v_has_finalized boolean := false;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_exam
  from public.exams
  where id = p_exam_id
    and is_active = true;

  if not found then
    raise exception 'Deneme bulunamadı veya aktif değil';
  end if;

  if v_exam.exam_mode = 'practice' then
    return jsonb_build_object(
      'server_now', v_now,
      'exam_mode', 'practice',
      'exam_state', 'practice',
      'exam_id', v_exam.id,
      'exam_title', v_exam.title,
      'exam_description', v_exam.description,
      'duration_minutes', v_exam.duration_minutes,
      'can_enter_lobby', false,
      'can_start_exam', true,
      'can_enter_exam', true,
      'can_submit', true,
      'results_available', true,
      'user_attempt_id', (
        select ea.id
        from public.exam_attempts ea
        where ea.exam_id = p_exam_id
          and ea.user_id = v_user_id
          and ea.status = 'in_progress'
        limit 1
      ),
      'user_attempt_status', (
        select ea.status
        from public.exam_attempts ea
        where ea.exam_id = p_exam_id
          and ea.user_id = v_user_id
          and ea.status = 'in_progress'
        limit 1
      )
    );
  end if;

  v_state := private.compute_exam_live_state(v_exam, v_now);

  select ea.* into v_attempt
  from public.exam_attempts ea
  where ea.exam_id = p_exam_id
    and ea.user_id = v_user_id
    and ea.status = 'in_progress'
  limit 1;

  if v_attempt.id is not null then
    v_attempt := private.expire_attempt_if_needed(v_attempt.id);
  end if;

  select exists (
    select 1
    from public.exam_attempts ea
    where ea.exam_id = p_exam_id
      and ea.user_id = v_user_id
      and ea.status in ('submitted', 'expired')
  ) into v_has_finalized;

  return jsonb_build_object(
    'server_now', v_now,
    'exam_mode', v_exam.exam_mode,
    'exam_state', v_state,
    'exam_id', v_exam.id,
    'exam_title', v_exam.title,
    'exam_description', v_exam.description,
    'duration_minutes', v_exam.duration_minutes,
    'scheduled_start_at', v_exam.scheduled_start_at,
    'lobby_open_at', v_exam.lobby_open_at,
    'late_entry_until', v_exam.late_entry_until,
    'scheduled_end_at', v_exam.scheduled_end_at,
    'results_publish_at', v_exam.results_publish_at,
    'seconds_until_start', greatest(
      0,
      floor(extract(epoch from (v_exam.scheduled_start_at - v_now)))::integer
    ),
    'seconds_until_results', greatest(
      0,
      floor(extract(epoch from (v_exam.results_publish_at - v_now)))::integer
    ),
    'can_enter_lobby',
      v_now >= v_exam.lobby_open_at
      and v_now < v_exam.scheduled_end_at
      and not v_has_finalized,
    'can_start_exam',
      v_now >= v_exam.scheduled_start_at
      and v_now < v_exam.late_entry_until
      and v_now < v_exam.scheduled_end_at
      and not v_has_finalized
      and (v_attempt.id is null or v_attempt.status = 'in_progress'),
    'can_enter_exam',
      (
        v_now >= v_exam.scheduled_start_at
        and v_now < v_exam.late_entry_until
        and v_now < v_exam.scheduled_end_at
        and not v_has_finalized
      )
      or (
        v_attempt.id is not null
        and v_attempt.status = 'in_progress'
        and v_now < v_exam.scheduled_end_at
      ),
    'can_submit',
      v_attempt.id is not null
      and v_attempt.status = 'in_progress'
      and v_now < v_exam.scheduled_end_at,
    'results_available', private.scheduled_results_available(v_exam, v_now),
    'user_attempt_id', v_attempt.id,
    'user_attempt_status', v_attempt.status,
    'user_has_finalized_attempt', v_has_finalized
  );
end;
$$;

revoke all on function public.get_exam_live_status(uuid) from public, anon;
grant execute on function public.get_exam_live_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: start practice exam (scheduled exams rejected)
-- ---------------------------------------------------------------------------
create or replace function public.start_exam_attempt(p_exam_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_exam record;
  v_attempt_id uuid;
  v_existing_id uuid;
  v_question_count integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select id, duration_minutes, exam_mode
  into v_exam
  from public.exams
  where id = p_exam_id
    and is_active = true;

  if not found then
    raise exception 'Deneme bulunamadı veya aktif değil';
  end if;

  if v_exam.exam_mode = 'scheduled' then
    raise exception 'Canlı sınavlar lobi üzerinden başlatılmalıdır';
  end if;

  select count(*) into v_question_count
  from public.exam_questions
  where exam_id = p_exam_id;

  if v_question_count = 0 then
    raise exception 'Denemede soru bulunmuyor';
  end if;

  select id into v_existing_id
  from public.exam_attempts
  where user_id = v_user_id
    and exam_id = p_exam_id
    and status = 'in_progress';

  if v_existing_id is not null then
    perform private.expire_attempt_if_needed(v_existing_id);

    select id into v_existing_id
    from public.exam_attempts
    where id = v_existing_id
      and status = 'in_progress';

    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  insert into public.exam_attempts (
    user_id,
    exam_id,
    duration_minutes_snapshot,
    status
  )
  values (
    v_user_id,
    p_exam_id,
    v_exam.duration_minutes,
    'in_progress'
  )
  returning id into v_attempt_id;

  insert into public.attempt_questions (attempt_id, question_id, sort_order)
  select v_attempt_id, eq.question_id, eq.sort_order
  from public.exam_questions eq
  where eq.exam_id = p_exam_id
  order by eq.sort_order;

  return v_attempt_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: start / resume scheduled live exam
-- ---------------------------------------------------------------------------
create or replace function public.start_scheduled_exam_attempt(p_exam_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_exam public.exams;
  v_now timestamptz := now();
  v_attempt_id uuid;
  v_existing public.exam_attempts;
  v_question_count integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_exam
  from public.exams
  where id = p_exam_id
    and is_active = true;

  if not found then
    raise exception 'Deneme bulunamadı veya aktif değil';
  end if;

  if v_exam.exam_mode <> 'scheduled' then
    raise exception 'Bu deneme canlı sınav değil';
  end if;

  if v_now < v_exam.scheduled_start_at then
    raise exception 'Sınav henüz başlamadı';
  end if;

  if v_now >= v_exam.scheduled_end_at then
    raise exception 'Sınav süresi doldu';
  end if;

  if exists (
    select 1
    from public.exam_attempts ea
    where ea.exam_id = p_exam_id
      and ea.user_id = v_user_id
      and ea.status in ('submitted', 'expired')
  ) then
    raise exception 'Bu sınavı zaten tamamladınız';
  end if;

  select * into v_existing
  from public.exam_attempts ea
  where ea.exam_id = p_exam_id
    and ea.user_id = v_user_id
    and ea.status = 'in_progress'
  limit 1;

  if v_existing.id is not null then
    v_existing := private.expire_attempt_if_needed(v_existing.id);

    if v_existing.status = 'in_progress' then
      return v_existing.id;
    end if;

    raise exception 'Sınav süresi doldu';
  end if;

  if v_now >= v_exam.late_entry_until then
    raise exception 'Sınav giriş süresi doldu';
  end if;

  select count(*) into v_question_count
  from public.exam_questions
  where exam_id = p_exam_id;

  if v_question_count = 0 then
    raise exception 'Denemede soru bulunmuyor';
  end if;

  insert into public.exam_attempts (
    user_id,
    exam_id,
    duration_minutes_snapshot,
    scheduled_end_at_snapshot,
    status
  )
  values (
    v_user_id,
    p_exam_id,
    v_exam.duration_minutes,
    v_exam.scheduled_end_at,
    'in_progress'
  )
  returning id into v_attempt_id;

  insert into public.attempt_questions (attempt_id, question_id, sort_order)
  select v_attempt_id, eq.question_id, eq.sort_order
  from public.exam_questions eq
  where eq.exam_id = p_exam_id
  order by eq.sort_order;

  return v_attempt_id;
end;
$$;

revoke all on function public.start_scheduled_exam_attempt(uuid) from public, anon;
grant execute on function public.start_scheduled_exam_attempt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: sync attempt (extended metadata)
-- ---------------------------------------------------------------------------
create or replace function public.sync_exam_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
  v_exam public.exams;
  v_exam_title text;
  v_results_available boolean;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select ea.*
  into v_attempt
  from public.exam_attempts ea
  where ea.id = p_attempt_id
    and ea.user_id = auth.uid();

  if not found then
    raise exception 'Deneme oturumu bulunamadı';
  end if;

  select * into v_exam
  from public.exams
  where id = v_attempt.exam_id;

  v_attempt := private.expire_attempt_if_needed(p_attempt_id);

  select e.title into v_exam_title
  from public.exams e
  where e.id = v_attempt.exam_id;

  v_results_available := private.scheduled_results_available(v_exam, now());

  return jsonb_build_object(
    'id', v_attempt.id,
    'exam_id', v_attempt.exam_id,
    'exam_title', v_exam_title,
    'exam_mode', v_exam.exam_mode,
    'status', v_attempt.status,
    'started_at', v_attempt.started_at,
    'submitted_at', v_attempt.submitted_at,
    'duration_minutes_snapshot', v_attempt.duration_minutes_snapshot,
    'scheduled_end_at', v_attempt.scheduled_end_at_snapshot,
    'results_publish_at', v_exam.results_publish_at,
    'results_available', v_results_available,
    'remaining_seconds', private.attempt_remaining_seconds(v_attempt),
    'correct_count', case when v_results_available then v_attempt.correct_count else null end,
    'incorrect_count', case when v_results_available then v_attempt.incorrect_count else null end,
    'blank_count', case when v_results_available then v_attempt.blank_count else null end,
    'total_questions', (
      select count(*)::integer
      from public.attempt_questions aq
      where aq.attempt_id = v_attempt.id
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: save answer (deadline enforced before expire)
-- ---------------------------------------------------------------------------
create or replace function public.save_attempt_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected_option_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
  v_deadline timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select ea.*
  into v_attempt
  from public.exam_attempts ea
  where ea.id = p_attempt_id
    and ea.user_id = auth.uid();

  if not found then
    raise exception 'Deneme oturumu bulunamadı';
  end if;

  if v_attempt.status <> 'in_progress' then
    raise exception 'Deneme artık düzenlenemez';
  end if;

  if v_attempt.scheduled_end_at_snapshot is not null then
    v_deadline := v_attempt.scheduled_end_at_snapshot;
  else
    v_deadline := v_attempt.started_at
      + (v_attempt.duration_minutes_snapshot * interval '1 minute');
  end if;

  if now() >= v_deadline then
    perform private.expire_attempt_if_needed(p_attempt_id);
    raise exception 'Sınav süresi doldu';
  end if;

  if not exists (
    select 1
    from public.attempt_questions aq
    where aq.attempt_id = p_attempt_id
      and aq.question_id = p_question_id
  ) then
    raise exception 'Soru bu denemeye ait değil';
  end if;

  if p_selected_option_id is not null
    and not exists (
      select 1
      from public.question_options qo
      where qo.id = p_selected_option_id
        and qo.question_id = p_question_id
    )
  then
    raise exception 'Geçersiz seçenek';
  end if;

  insert into public.attempt_answers (
    attempt_id,
    question_id,
    selected_option_id,
    answered_at
  )
  values (
    p_attempt_id,
    p_question_id,
    p_selected_option_id,
    now()
  )
  on conflict (attempt_id, question_id)
  do update set
    selected_option_id = excluded.selected_option_id,
    answered_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: submit exam (result embargo for scheduled)
-- ---------------------------------------------------------------------------
create or replace function public.submit_exam_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
  v_exam public.exams;
  v_total integer;
  v_results_available boolean;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select ea.*
  into v_attempt
  from public.exam_attempts ea
  where ea.id = p_attempt_id
    and ea.user_id = auth.uid();

  if not found then
    raise exception 'Deneme oturumu bulunamadı';
  end if;

  select * into v_exam
  from public.exams
  where id = v_attempt.exam_id;

  v_attempt := private.expire_attempt_if_needed(p_attempt_id);

  select count(*)::integer into v_total
  from public.attempt_questions aq
  where aq.attempt_id = p_attempt_id;

  v_results_available := private.scheduled_results_available(v_exam, now());

  if v_attempt.status = 'expired' then
    return jsonb_build_object(
      'status', v_attempt.status,
      'exam_mode', v_exam.exam_mode,
      'results_available', v_results_available,
      'results_publish_at', v_exam.results_publish_at,
      'correct_count', case when v_results_available then v_attempt.correct_count else null end,
      'incorrect_count', case when v_results_available then v_attempt.incorrect_count else null end,
      'blank_count', case when v_results_available then v_attempt.blank_count else null end,
      'total_questions', v_total
    );
  end if;

  if v_attempt.status <> 'in_progress' then
    raise exception 'Deneme zaten tamamlanmış';
  end if;

  perform private.score_exam_attempt(p_attempt_id);

  update public.exam_attempts
  set
    status = 'submitted',
    submitted_at = now()
  where id = p_attempt_id
  returning * into v_attempt;

  v_results_available := private.scheduled_results_available(v_exam, now());

  return jsonb_build_object(
    'status', v_attempt.status,
    'exam_mode', v_exam.exam_mode,
    'results_available', v_results_available,
    'results_publish_at', v_exam.results_publish_at,
    'correct_count', case when v_results_available then v_attempt.correct_count else null end,
    'incorrect_count', case when v_results_available then v_attempt.incorrect_count else null end,
    'blank_count', case when v_results_available then v_attempt.blank_count else null end,
    'total_questions', v_total
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: exam session (reject before scheduled start)
-- ---------------------------------------------------------------------------
create or replace function public.get_exam_session(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
  v_exam public.exams;
  v_questions jsonb;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select ea.*
  into v_attempt
  from public.exam_attempts ea
  where ea.id = p_attempt_id
    and ea.user_id = auth.uid();

  if not found then
    raise exception 'Deneme oturumu bulunamadı';
  end if;

  select * into v_exam
  from public.exams
  where id = v_attempt.exam_id;

  if v_exam.exam_mode = 'scheduled' and now() < v_exam.scheduled_start_at then
    raise exception 'Sınav henüz başlamadı';
  end if;

  v_attempt := private.expire_attempt_if_needed(p_attempt_id);

  if v_attempt.status <> 'in_progress' then
    raise exception 'Deneme artık düzenlenemez';
  end if;

  select coalesce(
    jsonb_agg(session_row order by sort_order),
    '[]'::jsonb
  )
  into v_questions
  from (
    select
      aq.sort_order as sort_order,
      jsonb_build_object(
        'id', aq.question_id,
        'sort_order', aq.sort_order,
        'question_text', q.question_text,
        'selected_option_id', aa.selected_option_id,
        'options', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', qo.id,
                'question_id', qo.question_id,
                'option_key', qo.option_key,
                'option_text', qo.option_text,
                'sort_order', qo.sort_order
              )
              order by qo.sort_order nulls last, qo.option_key
            ),
            '[]'::jsonb
          )
          from public.question_options qo
          where qo.question_id = aq.question_id
        )
      ) as session_row
    from public.attempt_questions aq
    join public.questions q on q.id = aq.question_id
    left join public.attempt_answers aa
      on aa.attempt_id = aq.attempt_id
      and aa.question_id = aq.question_id
    where aq.attempt_id = p_attempt_id
  ) ordered;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'exam_mode', v_exam.exam_mode,
    'exam_title', v_exam.title,
    'exam_description', v_exam.description,
    'scheduled_end_at', v_attempt.scheduled_end_at_snapshot,
    'remaining_seconds', private.attempt_remaining_seconds(v_attempt),
    'questions', v_questions
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: attempt review (result embargo)
-- ---------------------------------------------------------------------------
create or replace function public.get_attempt_review(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
  v_exam public.exams;
  v_exam_title text;
  v_total integer;
  v_questions jsonb;
  v_subjects jsonb;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select ea.*
  into v_attempt
  from public.exam_attempts ea
  where ea.id = p_attempt_id
    and ea.user_id = auth.uid();

  if not found then
    raise exception 'Sonuç bulunamadı';
  end if;

  if v_attempt.status not in ('submitted', 'expired') then
    raise exception 'Tamamlanmamış denemeler incelenemez';
  end if;

  select * into v_exam
  from public.exams
  where id = v_attempt.exam_id;

  select e.title into v_exam_title
  from public.exams e
  where e.id = v_attempt.exam_id;

  if not private.scheduled_results_available(v_exam, now()) then
    return jsonb_build_object(
      'embargo', true,
      'results_publish_at', v_exam.results_publish_at,
      'exam_title', v_exam_title,
      'attempt_id', v_attempt.id,
      'status', v_attempt.status,
      'submitted_at', v_attempt.submitted_at,
      'message', format(
        'Sonuçlar %s tarihinde açıklanacaktır.',
        to_char(v_exam.results_publish_at at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI')
      )
    );
  end if;

  if exists (
    select 1
    from public.attempt_questions aq
    where aq.attempt_id = p_attempt_id
      and aq.question_text_snapshot is null
  ) then
    perform private.snapshot_attempt_questions(p_attempt_id);
  end if;

  select count(*)::integer into v_total
  from public.attempt_questions aq
  where aq.attempt_id = p_attempt_id;

  select coalesce(jsonb_agg(row order by (row ->> 'sort_order')::integer), '[]'::jsonb)
  into v_questions
  from (
    select jsonb_build_object(
      'question_id', aq.question_id,
      'sort_order', aq.sort_order,
      'question_text', aq.question_text_snapshot,
      'explanation', aq.explanation_snapshot,
      'subject_id', aq.subject_id_snapshot,
      'subject_name', aq.subject_name_snapshot,
      'options', aq.options_snapshot,
      'selected_option_id', aa.selected_option_id,
      'correct_option_id', aq.correct_option_id_snapshot,
      'status', case
        when aa.selected_option_id is null then 'blank'
        when aa.selected_option_id = aq.correct_option_id_snapshot then 'correct'
        else 'incorrect'
      end
    ) as row
    from public.attempt_questions aq
    left join public.attempt_answers aa
      on aa.attempt_id = aq.attempt_id
      and aa.question_id = aq.question_id
    where aq.attempt_id = p_attempt_id
  ) q;

  select coalesce(jsonb_agg(row order by (row ->> 'subject_name')), '[]'::jsonb)
  into v_subjects
  from (
    select jsonb_build_object(
      'subject_id', aq.subject_id_snapshot,
      'subject_name', aq.subject_name_snapshot,
      'total', count(*)::integer,
      'correct', count(*) filter (
        where aa.selected_option_id = aq.correct_option_id_snapshot
      )::integer,
      'incorrect', count(*) filter (
        where aa.selected_option_id is not null
          and aa.selected_option_id is distinct from aq.correct_option_id_snapshot
      )::integer,
      'blank', count(*) filter (
        where aa.selected_option_id is null
      )::integer,
      'percent_correct', case
        when count(*) = 0 then 0
        else round(
          100.0 * count(*) filter (
            where aa.selected_option_id = aq.correct_option_id_snapshot
          ) / count(*)
        )::integer
      end
    ) as row
    from public.attempt_questions aq
    left join public.attempt_answers aa
      on aa.attempt_id = aq.attempt_id
      and aa.question_id = aq.question_id
    where aq.attempt_id = p_attempt_id
      and aq.subject_id_snapshot is not null
    group by aq.subject_id_snapshot, aq.subject_name_snapshot
  ) s;

  return jsonb_build_object(
    'embargo', false,
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'exam_id', v_attempt.exam_id,
      'exam_title', v_exam_title,
      'status', v_attempt.status,
      'submitted_at', v_attempt.submitted_at,
      'correct_count', v_attempt.correct_count,
      'incorrect_count', v_attempt.incorrect_count,
      'blank_count', v_attempt.blank_count,
      'total_questions', v_total
    ),
    'subjects', v_subjects,
    'questions', v_questions
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: attempt ranking (result embargo)
-- ---------------------------------------------------------------------------
create or replace function public.get_attempt_ranking(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
  v_exam public.exams;
  v_exam_title text;
  v_rank integer;
  v_total integer;
  v_top_percent numeric;
  v_best_attempt_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select ea.*
  into v_attempt
  from public.exam_attempts ea
  where ea.id = p_attempt_id
    and ea.user_id = auth.uid();

  if not found then
    raise exception 'Sonuç bulunamadı';
  end if;

  if v_attempt.status not in ('submitted', 'expired') then
    raise exception 'Tamamlanmamış denemeler sıralamaya dahil değil';
  end if;

  select * into v_exam
  from public.exams
  where id = v_attempt.exam_id;

  select e.title into v_exam_title
  from public.exams e
  where e.id = v_attempt.exam_id;

  if not private.scheduled_results_available(v_exam, now()) then
    return jsonb_build_object(
      'embargo', true,
      'results_publish_at', v_exam.results_publish_at
    );
  end if;

  select count(*)::integer into v_total
  from private.exam_ranked_best_attempts(v_attempt.exam_id);

  select r.rank, r.attempt_id
  into v_rank, v_best_attempt_id
  from private.exam_ranked_best_attempts(v_attempt.exam_id) r
  where r.user_id = v_attempt.user_id;

  if v_rank is null then
    raise exception 'Sıralama hesaplanamadı';
  end if;

  if v_total <= 0 then
    v_top_percent := null;
  else
    v_top_percent := round((v_rank::numeric / v_total::numeric) * 100, 1);
  end if;

  return jsonb_build_object(
    'embargo', false,
    'exam_id', v_attempt.exam_id,
    'exam_title', v_exam_title,
    'rank', v_rank,
    'total_participants', v_total,
    'top_percent', v_top_percent,
    'best_attempt_id', v_best_attempt_id,
    'is_best_attempt', v_best_attempt_id = p_attempt_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- revoke anon on new functions
-- ---------------------------------------------------------------------------
revoke execute on function public.get_server_time() from anon;
revoke execute on function public.get_exam_live_status(uuid) from anon;
revoke execute on function public.start_scheduled_exam_attempt(uuid) from anon;
revoke execute on function public.istanbul_local_to_timestamptz(text, text) from anon;

-- ---------------------------------------------------------------------------
-- pg_cron safety net (optional — skips if extension unavailable)
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'hmgs_finalize_scheduled_attempts';

    perform cron.schedule(
      'hmgs_finalize_scheduled_attempts',
      '* * * * *',
      'select private.finalize_overdue_scheduled_attempts();'
    );
  end if;
exception
  when others then
    raise log 'pg_cron schedule skipped: %', sqlerrm;
end;
$do$;

-- ---------------------------------------------------------------------------
-- authorization boundary tests (run at migration time)
-- ---------------------------------------------------------------------------
do $$
declare
  v_exam_id uuid;
  v_pass integer := 0;
  v_fail integer := 0;
begin
  insert into public.exams (
    title,
    description,
    duration_minutes,
    is_active,
    exam_mode,
    scheduled_start_at,
    lobby_offset_minutes,
    late_entry_minutes,
    results_delay_minutes
  )
  values (
    '__migration_test_scheduled__',
    'test',
    120,
    false,
    'scheduled',
    timestamptz '2030-01-01 16:00:00+00',
    30,
    10,
    30
  )
  returning id into v_exam_id;

  if (select lobby_open_at from public.exams where id = v_exam_id)
     = timestamptz '2030-01-01 15:30:00+00' then
    v_pass := v_pass + 1;
  else
    v_fail := v_fail + 1;
    raise warning 'lobby_open_at computation failed';
  end if;

  if (select scheduled_end_at from public.exams where id = v_exam_id)
     = timestamptz '2030-01-01 18:00:00+00' then
    v_pass := v_pass + 1;
  else
    v_fail := v_fail + 1;
    raise warning 'scheduled_end_at computation failed';
  end if;

  if (select results_publish_at from public.exams where id = v_exam_id)
     = timestamptz '2030-01-01 18:30:00+00' then
    v_pass := v_pass + 1;
  else
    v_fail := v_fail + 1;
    raise warning 'results_publish_at computation failed';
  end if;

  delete from public.exams where id = v_exam_id;

  raise notice 'scheduled_exam_migration_tests: % passed, % failed', v_pass, v_fail;
end;
$$;
