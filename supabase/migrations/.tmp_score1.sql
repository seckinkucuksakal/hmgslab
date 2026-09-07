-- HMGS-style exam score: (correct / total) * 100, rounded half-up to 2 decimals

create or replace function private.compute_exam_score(
  p_correct integer,
  p_total integer
)
returns numeric
language sql
immutable
as $$
  select case
    when p_total is null or p_total <= 0 then 0::numeric
    when p_correct is null or p_correct <= 0 then 0::numeric
    else round(100.0 * p_correct::numeric / p_total, 2)
  end;
$$;

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
  v_total integer := 0;
begin
  perform private.snapshot_attempt_questions(p_attempt_id);

  select count(*)::integer
  into v_total
  from public.attempt_questions aq
  where aq.attempt_id = p_attempt_id;

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
    score = private.compute_exam_score(v_correct, v_total)
  where id = p_attempt_id;
end;
$$;

-- Backfill finalized attempts
update public.exam_attempts ea
set score = private.compute_exam_score(
  ea.correct_count,
  (
    select count(*)::integer
    from public.attempt_questions aq
    where aq.attempt_id = ea.id
  )
)
where ea.status in ('submitted', 'expired')
  and ea.correct_count is not null;

-- Results list: return score (not integer-truncated percent)
create or replace function public.get_attempt_results_list(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  return coalesce(
    (
      select jsonb_agg(row order by (row ->> 'submitted_at') desc nulls last)
      from (
        select jsonb_build_object(
          'id', ea.id,
          'exam_title', e.title,
          'submitted_at', ea.submitted_at,
          'status', ea.status,
          'embargo', not private.scheduled_results_available(e, now()),
          'results_publish_at', e.results_publish_at,
          'total_questions', (
            select count(*)::integer
            from public.attempt_questions aq
            where aq.attempt_id = ea.id
          ),
          'correct_count', case
            when private.scheduled_results_available(e, now()) then ea.correct_count
            else null
          end,
          'incorrect_count', case
            when private.scheduled_results_available(e, now()) then ea.incorrect_count
            else null
          end,
          'blank_count', case
            when private.scheduled_results_available(e, now()) then ea.blank_count
            else null
          end,
          'completion_percent', case
            when not private.scheduled_results_available(e, now()) then null
            else private.compute_exam_score(
              ea.correct_count,
              (
                select count(*)::integer
                from public.attempt_questions aq
                where aq.attempt_id = ea.id
              )
            )
          end
        ) as row
        from public.exam_attempts ea
        join public.exams e on e.id = ea.exam_id
        where ea.user_id = v_user_id
          and ea.status in ('submitted', 'expired')
        order by ea.submitted_at desc nulls last, ea.id desc
        limit greatest(1, least(p_limit, 50))
      ) items
    ),
    '[]'::jsonb
  );
end;
$$;

