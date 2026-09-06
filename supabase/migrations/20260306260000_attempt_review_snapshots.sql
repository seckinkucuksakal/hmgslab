-- Phase 7: review snapshots and secure result review RPC

-- ---------------------------------------------------------------------------
-- snapshot columns on attempt_questions (populated at finalize time)
-- ---------------------------------------------------------------------------
alter table public.attempt_questions
  add column question_text_snapshot text,
  add column explanation_snapshot text,
  add column subject_id_snapshot uuid,
  add column subject_name_snapshot text,
  add column correct_option_id_snapshot uuid,
  add column options_snapshot jsonb;

-- ---------------------------------------------------------------------------
-- capture question state at scoring/finalize time
-- ---------------------------------------------------------------------------
create or replace function private.snapshot_attempt_questions(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.attempt_questions aq
  set
    question_text_snapshot = q.question_text,
    explanation_snapshot = q.explanation,
    subject_id_snapshot = q.subject_id,
    subject_name_snapshot = s.name,
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
  left join lateral (
    select qo2.id
    from public.question_options qo2
    where qo2.question_id = q.id
      and qo2.is_correct = true
    limit 1
  ) cor on true
  where aq.attempt_id = p_attempt_id
    and aq.question_id = q.id;
end;
$$;

revoke all on function private.snapshot_attempt_questions(uuid) from public;

-- ---------------------------------------------------------------------------
-- score using frozen snapshots (consistent with historical review)
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
  perform private.snapshot_attempt_questions(p_attempt_id);

  select
    count(*) filter (where aa.selected_option_id is null),
    count(*) filter (
      where aa.selected_option_id is not null
        and aa.selected_option_id = aq.correct_option_id_snapshot
    ),
    count(*) filter (
      where aa.selected_option_id is not null
        and aa.selected_option_id is distinct from aq.correct_option_id_snapshot
    )
  into v_blank, v_correct, v_incorrect
  from public.attempt_questions aq
  left join public.attempt_answers aa
    on aa.attempt_id = aq.attempt_id
    and aa.question_id = aq.question_id
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

-- ---------------------------------------------------------------------------
-- backfill snapshots for attempts finalized before Phase 7
-- ---------------------------------------------------------------------------
do $$
declare
  v_attempt_id uuid;
begin
  for v_attempt_id in
    select ea.id
    from public.exam_attempts ea
    where ea.status in ('submitted', 'expired')
      and exists (
        select 1
        from public.attempt_questions aq
        where aq.attempt_id = ea.id
          and aq.question_text_snapshot is null
      )
  loop
    perform private.snapshot_attempt_questions(v_attempt_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- secure review RPC: correct answers only for finalized own attempts
-- ---------------------------------------------------------------------------
create or replace function public.get_attempt_review(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
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

  if exists (
    select 1
    from public.attempt_questions aq
    where aq.attempt_id = p_attempt_id
      and aq.question_text_snapshot is null
  ) then
    perform private.snapshot_attempt_questions(p_attempt_id);
  end if;

  select e.title into v_exam_title
  from public.exams e
  where e.id = v_attempt.exam_id;

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

revoke all on function public.get_attempt_review(uuid) from public;
grant execute on function public.get_attempt_review(uuid) to authenticated;

-- index for results list ordering
create index exam_attempts_user_submitted_idx
  on public.exam_attempts (user_id, submitted_at desc)
  where status in ('submitted', 'expired');
