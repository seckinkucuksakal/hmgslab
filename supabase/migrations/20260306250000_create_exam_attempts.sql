-- Phase 6: student exam-taking engine

-- ---------------------------------------------------------------------------
-- exam_attempts
-- ---------------------------------------------------------------------------
create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete restrict,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  status text not null default 'in_progress',
  duration_minutes_snapshot integer not null,
  score numeric,
  correct_count integer,
  incorrect_count integer,
  blank_count integer,
  created_at timestamptz not null default now(),
  constraint exam_attempts_status_check
    check (status in ('in_progress', 'submitted', 'expired')),
  constraint exam_attempts_duration_positive
    check (duration_minutes_snapshot > 0)
);

create index exam_attempts_user_id_idx on public.exam_attempts (user_id);
create index exam_attempts_exam_id_idx on public.exam_attempts (exam_id);
create index exam_attempts_status_idx on public.exam_attempts (status);

create unique index exam_attempts_one_in_progress_idx
  on public.exam_attempts (user_id, exam_id)
  where status = 'in_progress';

-- ---------------------------------------------------------------------------
-- attempt_questions (snapshot at start)
-- ---------------------------------------------------------------------------
create table public.attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id),
  unique (attempt_id, sort_order),
  constraint attempt_questions_sort_order_positive check (sort_order > 0)
);

create index attempt_questions_attempt_id_idx on public.attempt_questions (attempt_id);

-- ---------------------------------------------------------------------------
-- attempt_answers
-- ---------------------------------------------------------------------------
create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  selected_option_id uuid references public.question_options (id) on delete set null,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index attempt_answers_attempt_id_idx on public.attempt_answers (attempt_id);

-- ---------------------------------------------------------------------------
-- scoring helper (private)
-- ---------------------------------------------------------------------------
create or replace function private.score_exam_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correct integer := 0;
  v_incorrect integer := 0;
  v_blank integer := 0;
begin
  select
    count(*) filter (
      where aa.selected_option_id is null
    ),
    count(*) filter (
      where aa.selected_option_id is not null
        and qo.is_correct = true
    ),
    count(*) filter (
      where aa.selected_option_id is not null
        and qo.is_correct = false
    )
  into v_blank, v_correct, v_incorrect
  from public.attempt_questions aq
  left join public.attempt_answers aa
    on aa.attempt_id = aq.attempt_id
    and aa.question_id = aq.question_id
  left join public.question_options qo
    on qo.id = aa.selected_option_id
  where aq.attempt_id = p_attempt_id;

  update public.exam_attempts
  set
    correct_count = v_correct,
    incorrect_count = v_incorrect,
    blank_count = v_blank,
    score = v_correct
  where id = p_attempt_id;
end;
$$;

revoke all on function private.score_exam_attempt(uuid) from public;

-- ---------------------------------------------------------------------------
-- expire in-progress attempt when time is up
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

  v_deadline := v_attempt.started_at
    + (v_attempt.duration_minutes_snapshot * interval '1 minute');

  if now() >= v_deadline then
    perform private.score_exam_attempt(p_attempt_id);

    update public.exam_attempts
    set
      status = 'expired',
      submitted_at = now()
    where id = p_attempt_id
    returning * into v_attempt;
  end if;

  return v_attempt;
end;
$$;

revoke all on function private.expire_attempt_if_needed(uuid) from public;

-- ---------------------------------------------------------------------------
-- remaining seconds (server source of truth for timer)
-- ---------------------------------------------------------------------------
create or replace function private.attempt_remaining_seconds(p_attempt public.exam_attempts)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(
    0,
    floor(
      extract(
        epoch from (
          p_attempt.started_at
          + (p_attempt.duration_minutes_snapshot * interval '1 minute')
          - now()
        )
      )
    )::integer
  );
$$;

revoke all on function private.attempt_remaining_seconds(public.exam_attempts) from public;

-- ---------------------------------------------------------------------------
-- RPC: start exam attempt (with snapshot)
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

  select id, duration_minutes
  into v_exam
  from public.exams
  where id = p_exam_id
    and is_active = true;

  if not found then
    raise exception 'Deneme bulunamadı veya aktif değil';
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

revoke all on function public.start_exam_attempt(uuid) from public;
grant execute on function public.start_exam_attempt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: sync attempt (expire check + timer metadata)
-- ---------------------------------------------------------------------------
create or replace function public.sync_exam_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
  v_exam_title text;
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

  v_attempt := private.expire_attempt_if_needed(p_attempt_id);

  select e.title into v_exam_title
  from public.exams e
  where e.id = v_attempt.exam_id;

  return jsonb_build_object(
    'id', v_attempt.id,
    'exam_id', v_attempt.exam_id,
    'exam_title', v_exam_title,
    'status', v_attempt.status,
    'started_at', v_attempt.started_at,
    'submitted_at', v_attempt.submitted_at,
    'duration_minutes_snapshot', v_attempt.duration_minutes_snapshot,
    'remaining_seconds', private.attempt_remaining_seconds(v_attempt),
    'correct_count', v_attempt.correct_count,
    'incorrect_count', v_attempt.incorrect_count,
    'blank_count', v_attempt.blank_count,
    'total_questions', (
      select count(*)::integer
      from public.attempt_questions aq
      where aq.attempt_id = v_attempt.id
    )
  );
end;
$$;

revoke all on function public.sync_exam_attempt(uuid) from public;
grant execute on function public.sync_exam_attempt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: save answer (in_progress only)
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

  v_attempt := private.expire_attempt_if_needed(p_attempt_id);

  if v_attempt.status <> 'in_progress' then
    raise exception 'Deneme artık düzenlenemez';
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

revoke all on function public.save_attempt_answer(uuid, uuid, uuid) from public;
grant execute on function public.save_attempt_answer(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: submit exam
-- ---------------------------------------------------------------------------
create or replace function public.submit_exam_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
  v_total integer;
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

  v_attempt := private.expire_attempt_if_needed(p_attempt_id);

  if v_attempt.status = 'expired' then
    select count(*)::integer into v_total
    from public.attempt_questions aq
    where aq.attempt_id = p_attempt_id;

    return jsonb_build_object(
      'status', v_attempt.status,
      'correct_count', v_attempt.correct_count,
      'incorrect_count', v_attempt.incorrect_count,
      'blank_count', v_attempt.blank_count,
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

  select count(*)::integer into v_total
  from public.attempt_questions aq
  where aq.attempt_id = p_attempt_id;

  return jsonb_build_object(
    'status', v_attempt.status,
    'correct_count', v_attempt.correct_count,
    'incorrect_count', v_attempt.incorrect_count,
    'blank_count', v_attempt.blank_count,
    'total_questions', v_total
  );
end;
$$;

revoke all on function public.submit_exam_attempt(uuid) from public;
grant execute on function public.submit_exam_attempt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- student read access to active exams
-- ---------------------------------------------------------------------------
create policy "Users can read active exams"
  on public.exams
  for select
  to authenticated
  using (is_active = true);

create policy "Users can read active exam question counts"
  on public.exam_questions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.exams e
      where e.id = exam_questions.exam_id
        and e.is_active = true
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: exam_attempts, attempt_questions, attempt_answers
-- ---------------------------------------------------------------------------
alter table public.exam_attempts enable row level security;
alter table public.attempt_questions enable row level security;
alter table public.attempt_answers enable row level security;

create policy "Users read own exam attempts"
  on public.exam_attempts
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Admins read all exam attempts"
  on public.exam_attempts
  for select
  to authenticated
  using (private.is_admin());

create policy "Users read own attempt questions"
  on public.attempt_questions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.exam_attempts ea
      where ea.id = attempt_questions.attempt_id
        and ea.user_id = auth.uid()
    )
  );

create policy "Users read own attempt answers"
  on public.attempt_answers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.exam_attempts ea
      where ea.id = attempt_answers.attempt_id
        and ea.user_id = auth.uid()
    )
  );

-- no insert/update/delete policies for students on attempts/answers
-- mutations go through security definer RPCs only

-- allow reading snapshotted questions even if later deactivated
create policy "Users can read questions in own attempts"
  on public.questions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.attempt_questions aq
      join public.exam_attempts ea on ea.id = aq.attempt_id
      where aq.question_id = questions.id
        and ea.user_id = auth.uid()
    )
  );
