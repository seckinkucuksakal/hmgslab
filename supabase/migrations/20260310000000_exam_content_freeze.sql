-- Phase 3: reliable admin saves and frozen exam content
--
-- * admin_save_exam: exam fields + question links in ONE transaction.
-- * Publishing an exam validates it and freezes question text, options, correct
--   answers and explanations into exam_question_snapshots. Attempts copy that
--   frozen version when they start, so later question-bank edits never change
--   what participants see or how they are scored.
-- * Started exams (any attempt, or scheduled start passed) can no longer change
--   duration, mode or schedule; published/started exams cannot change questions.
--   Results-publish control is unaffected.

-- ---------------------------------------------------------------------------
-- schema
-- ---------------------------------------------------------------------------
alter table public.exams
  add column content_frozen_at timestamptz;

create table public.exam_question_snapshots (
  exam_id uuid not null references public.exams (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  sort_order integer not null,
  question_text text not null,
  explanation text,
  subject_id uuid,
  subject_name text,
  topic_id uuid,
  topic_name text,
  correct_option_id uuid,
  options jsonb not null,
  created_at timestamptz not null default now(),
  primary key (exam_id, question_id)
);

-- Contains the answer key: reachable only through SECURITY DEFINER functions.
alter table public.exam_question_snapshots enable row level security;
revoke all on public.exam_question_snapshots from anon, authenticated;

-- ---------------------------------------------------------------------------
-- freezing
-- ---------------------------------------------------------------------------
create or replace function private.build_exam_snapshots(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.exam_question_snapshots where exam_id = p_exam_id;

  insert into public.exam_question_snapshots (
    exam_id, question_id, sort_order, question_text, explanation,
    subject_id, subject_name, topic_id, topic_name, correct_option_id, options
  )
  select
    eq.exam_id,
    eq.question_id,
    eq.sort_order,
    q.question_text,
    q.explanation,
    q.subject_id,
    s.name,
    q.topic_id,
    t.name,
    (
      select qo.id
      from public.question_options qo
      where qo.question_id = q.id and qo.is_correct
      limit 1
    ),
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', qo.id,
            'option_key', qo.option_key,
            'option_text', qo.option_text,
            'sort_order', qo.sort_order
          )
          order by qo.sort_order nulls last, qo.option_key
        ),
        '[]'::jsonb
      )
      from public.question_options qo
      where qo.question_id = q.id
    )
  from public.exam_questions eq
  join public.questions q on q.id = eq.question_id
  join public.subjects s on s.id = q.subject_id
  join public.topics t on t.id = q.topic_id
  where eq.exam_id = p_exam_id;
end;
$$;

revoke all on function private.build_exam_snapshots(uuid) from public;

-- Freezes lazily (legacy exams); published exams are already frozen.
create or replace function private.ensure_exam_frozen(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.exams where id = p_exam_id and content_frozen_at is not null
  ) then
    return;
  end if;

  -- advisory lock: concurrent starters would otherwise deadlock on row locks
  perform pg_advisory_xact_lock(hashtext('exam-freeze:' || p_exam_id::text));

  if exists (
    select 1 from public.exams where id = p_exam_id and content_frozen_at is not null
  ) then
    return;
  end if;

  perform private.build_exam_snapshots(p_exam_id);
  perform set_config('hmgs.internal_freeze', 'on', true);
  update public.exams set content_frozen_at = now() where id = p_exam_id;
  perform set_config('hmgs.internal_freeze', '', true);
end;
$$;

revoke all on function private.ensure_exam_frozen(uuid) from public;

-- ---------------------------------------------------------------------------
-- publish validation
-- ---------------------------------------------------------------------------
create or replace function private.exam_publish_problems(p_exam public.exams)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_problems text[] := array[]::text[];
  v_count integer;
  v_n integer;
begin
  if btrim(coalesce(p_exam.title, '')) = '' then
    v_problems := array_append(v_problems, 'Deneme başlığı boş olamaz');
  end if;

  if p_exam.duration_minutes is null or p_exam.duration_minutes <= 0 then
    v_problems := array_append(v_problems, 'Süre sıfırdan büyük olmalı');
  end if;

  select count(*) into v_count
  from public.exam_questions where exam_id = p_exam.id;

  if v_count = 0 then
    v_problems := array_append(v_problems, 'Denemede en az bir soru olmalı');
  end if;

  select count(*) into v_n
  from public.exam_questions eq
  join public.questions q on q.id = eq.question_id
  where eq.exam_id = p_exam.id and not q.is_active;
  if v_n > 0 then
    v_problems := array_append(v_problems, format('%s soru pasif durumda', v_n));
  end if;

  select count(*) into v_n
  from public.exam_questions eq
  join public.questions q on q.id = eq.question_id
  join public.subjects s on s.id = q.subject_id
  where eq.exam_id = p_exam.id and not s.is_standard;
  if v_n > 0 then
    v_problems := array_append(
      v_problems,
      format('%s sorunun dersi standart 19 ders kapsamı dışında (elle sınıflandırın)', v_n)
    );
  end if;

  select count(*) into v_n
  from public.exam_questions eq
  join public.questions q on q.id = eq.question_id
  where eq.exam_id = p_exam.id
    and (
      btrim(q.question_text) = ''
      or (select count(*) from public.question_options qo where qo.question_id = q.id) <> 5
      or (select count(*) from public.question_options qo
          where qo.question_id = q.id and qo.is_correct) <> 1
      or exists (select 1 from public.question_options qo
                 where qo.question_id = q.id and btrim(qo.option_text) = '')
    );
  if v_n > 0 then
    v_problems := array_append(
      v_problems,
      format('%s sorunun metni veya seçenekleri geçersiz (5 dolu seçenek ve tek doğru cevap gerekir)', v_n)
    );
  end if;

  if p_exam.exam_mode = 'scheduled' then
    if p_exam.scheduled_start_at is null then
      v_problems := array_append(v_problems, 'Başlangıç tarihi ve saati gerekli');
    elsif p_exam.scheduled_start_at <= now() then
      v_problems := array_append(v_problems, 'Başlangıç zamanı geçmişte; yayımlamak için ileri bir zaman seçin');
    end if;
  end if;

  return v_problems;
end;
$$;

revoke all on function private.exam_publish_problems(public.exams) from public;

-- ---------------------------------------------------------------------------
-- exams lifecycle guard
-- ---------------------------------------------------------------------------
create or replace function private.guard_exam_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_has_attempts boolean;
  v_problems text[];
begin
  if tg_op = 'INSERT' then
    new.content_frozen_at := null;
    if new.is_active then
      v_problems := private.exam_publish_problems(new);
      raise exception 'Yayımlanamaz: %', array_to_string(v_problems, ' • ');
    end if;
    return new;
  end if;

  v_has_attempts := exists (
    select 1 from public.exam_attempts where exam_id = old.id
  );

  -- schedule/duration/mode are fixed once the exam has started
  if v_has_attempts
     or (old.exam_mode = 'scheduled' and old.scheduled_start_at <= now()) then
    if new.duration_minutes is distinct from old.duration_minutes
       or new.exam_mode is distinct from old.exam_mode
       or new.scheduled_start_at is distinct from old.scheduled_start_at
       or new.lobby_offset_minutes is distinct from old.lobby_offset_minutes
       or new.late_entry_minutes is distinct from old.late_entry_minutes
       or new.results_delay_minutes is distinct from old.results_delay_minutes then
      raise exception 'Başlamış sınavın süresi, türü veya takvimi değiştirilemez';
    end if;
  end if;

  if not old.is_active and new.is_active then
    v_problems := private.exam_publish_problems(new);
    if array_length(v_problems, 1) > 0 then
      raise exception 'Yayımlanamaz: %', array_to_string(v_problems, ' • ');
    end if;
    perform private.build_exam_snapshots(new.id);
    new.content_frozen_at := now();
  elsif old.is_active and not new.is_active and not v_has_attempts then
    -- unpublished and never started: content may change again, so un-freeze
    delete from public.exam_question_snapshots where exam_id = new.id;
    new.content_frozen_at := null;
  elsif coalesce(current_setting('hmgs.internal_freeze', true), '') <> 'on' then
    new.content_frozen_at := old.content_frozen_at;
  end if;

  return new;
end;
$$;

create trigger exams_guard_lifecycle
  before insert or update on public.exams
  for each row
  execute function private.guard_exam_lifecycle();

-- ---------------------------------------------------------------------------
-- exam_questions: locked once published or started
-- ---------------------------------------------------------------------------
create or replace function private.guard_exam_questions()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_exam_id uuid := coalesce(new.exam_id, old.exam_id);
  v_exam public.exams;
begin
  select * into v_exam from public.exams where id = v_exam_id;

  -- exam itself is being deleted (cascade): nothing left to protect
  if not found then
    return coalesce(new, old);
  end if;

  if v_exam.is_active
     or exists (select 1 from public.exam_attempts where exam_id = v_exam_id) then
    raise exception 'Yayındaki veya başlamış sınavın soruları değiştirilemez';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger exam_questions_guard
  before insert or update or delete on public.exam_questions
  for each row
  execute function private.guard_exam_questions();

-- ---------------------------------------------------------------------------
-- attempts copy the frozen version when they start
-- ---------------------------------------------------------------------------
create or replace function private.attempt_questions_fill_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exam_id uuid;
  v_snap public.exam_question_snapshots;
begin
  select exam_id into v_exam_id
  from public.exam_attempts where id = new.attempt_id;

  perform private.ensure_exam_frozen(v_exam_id);

  select * into v_snap
  from public.exam_question_snapshots
  where exam_id = v_exam_id and question_id = new.question_id;

  if found then
    new.question_text_snapshot := v_snap.question_text;
    new.explanation_snapshot := v_snap.explanation;
    new.subject_id_snapshot := v_snap.subject_id;
    new.subject_name_snapshot := v_snap.subject_name;
    new.topic_id_snapshot := v_snap.topic_id;
    new.topic_name_snapshot := v_snap.topic_name;
    new.correct_option_id_snapshot := v_snap.correct_option_id;
    new.options_snapshot := v_snap.options;
  end if;

  return new;
end;
$$;

create trigger attempt_questions_fill_snapshot
  before insert on public.attempt_questions
  for each row
  execute function private.attempt_questions_fill_snapshot();

-- scoring-time snapshot only fills rows that have none yet (never overwrites)
create or replace function private.snapshot_attempt_questions(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.attempt_questions aq
  set
    question_text_snapshot = s.question_text,
    explanation_snapshot = s.explanation,
    subject_id_snapshot = s.subject_id,
    subject_name_snapshot = s.subject_name,
    topic_id_snapshot = s.topic_id,
    topic_name_snapshot = s.topic_name,
    correct_option_id_snapshot = s.correct_option_id,
    options_snapshot = s.options
  from public.exam_attempts ea
  join public.exam_question_snapshots s on s.exam_id = ea.exam_id
  where aq.attempt_id = p_attempt_id
    and ea.id = aq.attempt_id
    and s.question_id = aq.question_id
    and aq.question_text_snapshot is null;

  -- legacy fallback for attempts of exams that were never frozen
  update public.attempt_questions aq
  set
    question_text_snapshot = q.question_text,
    explanation_snapshot = q.explanation,
    subject_id_snapshot = q.subject_id,
    subject_name_snapshot = s.name,
    topic_id_snapshot = q.topic_id,
    topic_name_snapshot = t.name,
    correct_option_id_snapshot = cor.id,
    options_snapshot = (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', qo.id,
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
  from public.questions q
  join public.subjects s on s.id = q.subject_id
  join public.topics t on t.id = q.topic_id
  left join lateral (
    select qo2.id
    from public.question_options qo2
    where qo2.question_id = q.id and qo2.is_correct = true
    limit 1
  ) cor on true
  where aq.attempt_id = p_attempt_id
    and aq.question_id = q.id
    and aq.question_text_snapshot is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- students are served the frozen version
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
        'question_text', coalesce(aq.question_text_snapshot, q.question_text),
        'selected_option_id', aa.selected_option_id,
        'options', case
          when aq.options_snapshot is not null then (
            select coalesce(
              jsonb_agg(
                o.value || jsonb_build_object('question_id', aq.question_id)
                order by o.ord
              ),
              '[]'::jsonb
            )
            from jsonb_array_elements(aq.options_snapshot) with ordinality as o(value, ord)
          )
          else (
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
        end
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

revoke all on function public.get_exam_session(uuid) from public, anon;
grant execute on function public.get_exam_session(uuid) to authenticated;

-- selected option must belong to the frozen option list
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
  v_aq public.attempt_questions;
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

  select aq.* into v_aq
  from public.attempt_questions aq
  where aq.attempt_id = p_attempt_id
    and aq.question_id = p_question_id;

  if not found then
    raise exception 'Soru bu denemeye ait değil';
  end if;

  if p_selected_option_id is not null then
    if v_aq.options_snapshot is not null then
      if not exists (
        select 1
        from jsonb_array_elements(v_aq.options_snapshot) o
        where (o ->> 'id')::uuid = p_selected_option_id
      ) then
        raise exception 'Geçersiz seçenek';
      end if;
    elsif not exists (
      select 1
      from public.question_options qo
      where qo.id = p_selected_option_id
        and qo.question_id = p_question_id
    ) then
      raise exception 'Geçersiz seçenek';
    end if;
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

revoke all on function public.save_attempt_answer(uuid, uuid, uuid) from public, anon;
grant execute on function public.save_attempt_answer(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_save_exam: exam + question links in one transaction
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_exam(
  p_exam_id uuid,
  p_exam jsonb,
  p_question_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_exam_id;
  v_exam public.exams;
  v_has_attempts boolean;
  v_target_active boolean := coalesce((p_exam ->> 'is_active')::boolean, false);
  v_override boolean := coalesce((p_exam ->> 'results_publish_at_override')::boolean, false);
  v_current uuid[];
  v_new_ids uuid[] := coalesce(p_question_ids, array[]::uuid[]);
begin
  if not private.is_admin() then
    raise exception 'Unauthorized';
  end if;

  if (select count(distinct x) from unnest(v_new_ids) x) <> coalesce(array_length(v_new_ids, 1), 0) then
    raise exception 'Aynı soru denemede birden fazla kez seçilemez';
  end if;

  if v_id is null then
    insert into public.exams (
      title, description, duration_minutes, is_active, exam_mode,
      scheduled_start_at, lobby_offset_minutes, late_entry_minutes,
      results_delay_minutes, results_publish_at_override, results_publish_at
    )
    values (
      btrim(p_exam ->> 'title'),
      nullif(btrim(coalesce(p_exam ->> 'description', '')), ''),
      (p_exam ->> 'duration_minutes')::integer,
      false,
      coalesce(p_exam ->> 'exam_mode', 'practice'),
      (p_exam ->> 'scheduled_start_at')::timestamptz,
      coalesce((p_exam ->> 'lobby_offset_minutes')::integer, 30),
      coalesce((p_exam ->> 'late_entry_minutes')::integer, 10),
      coalesce((p_exam ->> 'results_delay_minutes')::integer, 30),
      v_override,
      case when v_override then (p_exam ->> 'results_publish_at')::timestamptz end
    )
    returning id into v_id;
    v_has_attempts := false;
  else
    -- row lock serialises concurrent saves; attempt creation takes a KEY SHARE
    -- lock on this row through its foreign key, so starts and saves interleave
    -- cleanly.
    select * into v_exam from public.exams where id = v_id for update;
    if not found then
      raise exception 'Deneme bulunamadı';
    end if;
    v_has_attempts := exists (select 1 from public.exam_attempts where exam_id = v_id);
  end if;

  select coalesce(array_agg(question_id order by sort_order), array[]::uuid[])
  into v_current
  from public.exam_questions where exam_id = v_id;

  if v_current is distinct from v_new_ids then
    if p_exam_id is not null then
      if v_has_attempts then
        raise exception 'Yayındaki veya başlamış sınavın soruları değiştirilemez';
      end if;
      if v_exam.is_active then
        -- unpublish (un-freezes) so the content can change; republished below
        update public.exams set is_active = false where id = v_id;
      end if;
    end if;

    delete from public.exam_questions where exam_id = v_id;

    insert into public.exam_questions (exam_id, question_id, sort_order)
    select v_id, q.id, t.ord
    from unnest(v_new_ids) with ordinality as t(qid, ord)
    join public.questions q on q.id = t.qid
    order by t.ord;

    if (select count(*) from public.exam_questions where exam_id = v_id)
       <> coalesce(array_length(v_new_ids, 1), 0) then
      raise exception 'Seçilen sorulardan biri bulunamadı';
    end if;
  end if;

  if p_exam_id is not null then
    update public.exams
    set
      title = btrim(p_exam ->> 'title'),
      description = nullif(btrim(coalesce(p_exam ->> 'description', '')), ''),
      duration_minutes = (p_exam ->> 'duration_minutes')::integer,
      exam_mode = coalesce(p_exam ->> 'exam_mode', 'practice'),
      scheduled_start_at = (p_exam ->> 'scheduled_start_at')::timestamptz,
      lobby_offset_minutes = coalesce((p_exam ->> 'lobby_offset_minutes')::integer, lobby_offset_minutes),
      late_entry_minutes = coalesce((p_exam ->> 'late_entry_minutes')::integer, late_entry_minutes),
      results_delay_minutes = coalesce((p_exam ->> 'results_delay_minutes')::integer, results_delay_minutes),
      results_publish_at_override = v_override,
      results_publish_at = case
        when v_override then (p_exam ->> 'results_publish_at')::timestamptz
        else results_publish_at
      end,
      is_active = v_target_active
    where id = v_id;
  elsif v_target_active then
    update public.exams set is_active = true where id = v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.admin_save_exam(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.admin_save_exam(uuid, jsonb, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- data: freeze exams that are already published or started; fill open attempts
-- ---------------------------------------------------------------------------
do $$
declare
  v_exam_id uuid;
  v_attempt_id uuid;
begin
  for v_exam_id in
    select e.id
    from public.exams e
    where e.content_frozen_at is null
      and (e.is_active or exists (select 1 from public.exam_attempts ea where ea.exam_id = e.id))
  loop
    perform private.ensure_exam_frozen(v_exam_id);
  end loop;

  for v_attempt_id in
    select ea.id
    from public.exam_attempts ea
    where ea.status = 'in_progress'
  loop
    perform private.snapshot_attempt_questions(v_attempt_id);
  end loop;
end;
$$;
