-- Phase 9: personal performance analytics

-- ---------------------------------------------------------------------------
-- topic snapshot columns (for future topic-level analytics)
-- ---------------------------------------------------------------------------
alter table public.attempt_questions
  add column topic_id_snapshot uuid,
  add column topic_name_snapshot text;

-- ---------------------------------------------------------------------------
-- extend snapshot to include topic
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
    where qo2.question_id = q.id
      and qo2.is_correct = true
    limit 1
  ) cor on true
  where aq.attempt_id = p_attempt_id
    and aq.question_id = q.id;
end;
$$;

-- backfill topic snapshots on finalized attempts
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
          and aq.topic_id_snapshot is null
          and aq.question_text_snapshot is not null
      )
  loop
    perform private.snapshot_attempt_questions(v_attempt_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- index for user performance queries
-- ---------------------------------------------------------------------------
create index if not exists exam_attempts_user_submitted_at_idx
  on public.exam_attempts (user_id, submitted_at desc)
  where status in ('submitted', 'expired');

create index if not exists attempt_questions_subject_snapshot_idx
  on public.attempt_questions (attempt_id, subject_id_snapshot)
  where subject_id_snapshot is not null;

-- ---------------------------------------------------------------------------
-- RPC: personal performance analytics (owner only)
-- ---------------------------------------------------------------------------
create or replace function public.get_user_performance_analytics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_completed integer;
  v_avg_percent numeric;
  v_best_percent numeric;
  v_best_title text;
  v_trend text;
  v_trend_label text;
  v_recent jsonb;
  v_subjects jsonb;
  v_topics jsonb;
  v_strongest jsonb;
  v_weakest jsonb;
  v_recent_avg numeric;
  v_previous_avg numeric;
  v_trend_threshold constant numeric := 3.0;
  v_subject_min_answered constant integer := 5;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select count(*)::integer
  into v_completed
  from public.exam_attempts ea
  where ea.user_id = v_user_id
    and ea.status in ('submitted', 'expired');

  if v_completed = 0 then
    return jsonb_build_object(
      'has_data', false,
      'overview', null,
      'recent_exams', '[]'::jsonb,
      'subjects', '[]'::jsonb,
      'topics', '[]'::jsonb,
      'strongest_subject', null,
      'weakest_subject', null,
      'is_limited_data', false
    );
  end if;

  with attempt_stats as (
    select
      ea.id as attempt_id,
      ea.exam_id,
      e.title as exam_title,
      ea.submitted_at,
      ea.correct_count,
      ea.incorrect_count,
      ea.blank_count,
      (
        select count(*)::integer
        from public.attempt_questions aq
        where aq.attempt_id = ea.id
      ) as total_questions,
      case
        when (
          select count(*)
          from public.attempt_questions aq
          where aq.attempt_id = ea.id
        ) = 0 then 0::numeric
        else round(
          100.0 * ea.correct_count::numeric / (
            select count(*)
            from public.attempt_questions aq
            where aq.attempt_id = ea.id
          ),
          1
        )
      end as correct_percent
    from public.exam_attempts ea
    join public.exams e on e.id = ea.exam_id
    where ea.user_id = v_user_id
      and ea.status in ('submitted', 'expired')
  )
  select
    round(avg(correct_percent), 1),
    max(correct_percent)
  into v_avg_percent, v_best_percent
  from attempt_stats;

  select ast.exam_title
  into v_best_title
  from (
    select
      ea.id,
      e.title as exam_title,
      case
        when (
          select count(*)
          from public.attempt_questions aq
          where aq.attempt_id = ea.id
        ) = 0 then 0::numeric
        else round(
          100.0 * ea.correct_count::numeric / (
            select count(*)
            from public.attempt_questions aq
            where aq.attempt_id = ea.id
          ),
          1
        )
      end as correct_percent
    from public.exam_attempts ea
    join public.exams e on e.id = ea.exam_id
    where ea.user_id = v_user_id
      and ea.status in ('submitted', 'expired')
  ) ast
  order by ast.correct_percent desc, ast.id asc
  limit 1;

  -- trend: avg of latest 3 vs previous 3 completed exams (threshold 3 pp)
  with ordered as (
    select
      case
        when (
          select count(*)
          from public.attempt_questions aq
          where aq.attempt_id = ea.id
        ) = 0 then 0::numeric
        else round(
          100.0 * ea.correct_count::numeric / (
            select count(*)
            from public.attempt_questions aq
            where aq.attempt_id = ea.id
          ),
          1
        )
      end as correct_percent,
      row_number() over (
        order by ea.submitted_at desc nulls last, ea.id desc
      ) as rn
    from public.exam_attempts ea
    where ea.user_id = v_user_id
      and ea.status in ('submitted', 'expired')
  ),
  recent as (
    select avg(correct_percent) as avg_percent
    from ordered
    where rn between 1 and 3
  ),
  previous as (
    select avg(correct_percent) as avg_percent
    from ordered
    where rn between 4 and 6
  )
  select r.avg_percent, p.avg_percent
  into v_recent_avg, v_previous_avg
  from recent r, previous p;

  if v_recent_avg is null or v_previous_avg is null then
    v_trend := null;
    v_trend_label := null;
  elsif v_recent_avg - v_previous_avg > v_trend_threshold then
    v_trend := 'improving';
    v_trend_label := 'Gelişiyor';
  elsif v_recent_avg - v_previous_avg < -v_trend_threshold then
    v_trend := 'declining';
    v_trend_label := 'Düşüş var';
  else
    v_trend := 'stable';
    v_trend_label := 'Benzer seviyede';
  end if;

  select coalesce(jsonb_agg(row order by (row ->> 'submitted_at') desc), '[]'::jsonb)
  into v_recent
  from (
    select jsonb_build_object(
      'attempt_id', ast.attempt_id,
      'exam_id', ast.exam_id,
      'exam_title', ast.exam_title,
      'submitted_at', ast.submitted_at,
      'correct_count', ast.correct_count,
      'incorrect_count', ast.incorrect_count,
      'blank_count', ast.blank_count,
      'total_questions', ast.total_questions,
      'correct_percent', ast.correct_percent
    ) as row
    from (
      select
        ea.id as attempt_id,
        ea.exam_id,
        e.title as exam_title,
        ea.submitted_at,
        ea.correct_count,
        ea.incorrect_count,
        ea.blank_count,
        (
          select count(*)::integer
          from public.attempt_questions aq
          where aq.attempt_id = ea.id
        ) as total_questions,
        case
          when (
            select count(*)
            from public.attempt_questions aq
            where aq.attempt_id = ea.id
          ) = 0 then 0::numeric
          else round(
            100.0 * ea.correct_count::numeric / (
              select count(*)
              from public.attempt_questions aq
              where aq.attempt_id = ea.id
            ),
            1
          )
        end as correct_percent
      from public.exam_attempts ea
      join public.exams e on e.id = ea.exam_id
      where ea.user_id = v_user_id
        and ea.status in ('submitted', 'expired')
      order by ea.submitted_at desc nulls last, ea.id desc
      limit 12
    ) ast
  ) recent_rows;

  select coalesce(jsonb_agg(row order by (row ->> 'subject_name')), '[]'::jsonb)
  into v_subjects
  from (
    select jsonb_build_object(
      'subject_id', aq.subject_id_snapshot,
      'subject_name', aq.subject_name_snapshot,
      'total', count(*)::integer,
      'answered', count(*) filter (
        where aa.selected_option_id is not null
      )::integer,
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
      'correct_percent', case
        when count(*) = 0 then 0
        else round(
          100.0 * count(*) filter (
            where aa.selected_option_id = aq.correct_option_id_snapshot
          ) / count(*)
        )::integer
      end
    ) as row
    from public.exam_attempts ea
    join public.attempt_questions aq on aq.attempt_id = ea.id
    left join public.attempt_answers aa
      on aa.attempt_id = aq.attempt_id
      and aa.question_id = aq.question_id
    where ea.user_id = v_user_id
      and ea.status in ('submitted', 'expired')
      and aq.subject_id_snapshot is not null
    group by aq.subject_id_snapshot, aq.subject_name_snapshot
  ) subject_rows;

  select coalesce(jsonb_agg(row order by (row ->> 'topic_name')), '[]'::jsonb)
  into v_topics
  from (
    select jsonb_build_object(
      'topic_id', aq.topic_id_snapshot,
      'topic_name', aq.topic_name_snapshot,
      'subject_id', aq.subject_id_snapshot,
      'subject_name', aq.subject_name_snapshot,
      'total', count(*)::integer,
      'answered', count(*) filter (
        where aa.selected_option_id is not null
      )::integer,
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
      'correct_percent', case
        when count(*) = 0 then 0
        else round(
          100.0 * count(*) filter (
            where aa.selected_option_id = aq.correct_option_id_snapshot
          ) / count(*)
        )::integer
      end
    ) as row
    from public.exam_attempts ea
    join public.attempt_questions aq on aq.attempt_id = ea.id
    left join public.attempt_answers aa
      on aa.attempt_id = aq.attempt_id
      and aa.question_id = aq.question_id
    where ea.user_id = v_user_id
      and ea.status in ('submitted', 'expired')
      and aq.topic_id_snapshot is not null
    group by
      aq.topic_id_snapshot,
      aq.topic_name_snapshot,
      aq.subject_id_snapshot,
      aq.subject_name_snapshot
  ) topic_rows;

  select row into v_strongest
  from (
    select jsonb_build_object(
      'subject_id', s.subject_id,
      'subject_name', s.subject_name,
      'correct_percent', s.correct_percent,
      'answered', s.answered
    ) as row
    from (
      select
        aq.subject_id_snapshot as subject_id,
        aq.subject_name_snapshot as subject_name,
        count(*) filter (
          where aa.selected_option_id is not null
        )::integer as answered,
        round(
          100.0 * count(*) filter (
            where aa.selected_option_id = aq.correct_option_id_snapshot
          ) / nullif(count(*), 0)
        )::integer as correct_percent
      from public.exam_attempts ea
      join public.attempt_questions aq on aq.attempt_id = ea.id
      left join public.attempt_answers aa
        on aa.attempt_id = aq.attempt_id
        and aa.question_id = aq.question_id
      where ea.user_id = v_user_id
        and ea.status in ('submitted', 'expired')
        and aq.subject_id_snapshot is not null
      group by aq.subject_id_snapshot, aq.subject_name_snapshot
      having count(*) filter (where aa.selected_option_id is not null) >= v_subject_min_answered
    ) s
    order by s.correct_percent desc, s.answered desc, s.subject_name asc
    limit 1
  ) strongest_row;

  select row into v_weakest
  from (
    select jsonb_build_object(
      'subject_id', s.subject_id,
      'subject_name', s.subject_name,
      'correct_percent', s.correct_percent,
      'answered', s.answered
    ) as row
    from (
      select
        aq.subject_id_snapshot as subject_id,
        aq.subject_name_snapshot as subject_name,
        count(*) filter (
          where aa.selected_option_id is not null
        )::integer as answered,
        round(
          100.0 * count(*) filter (
            where aa.selected_option_id = aq.correct_option_id_snapshot
          ) / nullif(count(*), 0)
        )::integer as correct_percent
      from public.exam_attempts ea
      join public.attempt_questions aq on aq.attempt_id = ea.id
      left join public.attempt_answers aa
        on aa.attempt_id = aq.attempt_id
        and aa.question_id = aq.question_id
      where ea.user_id = v_user_id
        and ea.status in ('submitted', 'expired')
        and aq.subject_id_snapshot is not null
      group by aq.subject_id_snapshot, aq.subject_name_snapshot
      having count(*) filter (where aa.selected_option_id is not null) >= v_subject_min_answered
    ) s
    order by s.correct_percent asc, s.answered desc, s.subject_name asc
    limit 1
  ) weakest_row;

  if v_strongest is not null
    and v_weakest is not null
    and (v_strongest ->> 'subject_id') = (v_weakest ->> 'subject_id')
  then
    v_weakest := null;
  end if;

  return jsonb_build_object(
    'has_data', true,
    'overview', jsonb_build_object(
      'completed_exams', v_completed,
      'average_correct_percent', v_avg_percent,
      'best_correct_percent', v_best_percent,
      'best_exam_title', v_best_title,
      'trend', v_trend,
      'trend_label', v_trend_label,
      'recent_avg_percent', v_recent_avg,
      'previous_avg_percent', v_previous_avg
    ),
    'recent_exams', v_recent,
    'subjects', v_subjects,
    'topics', v_topics,
    'strongest_subject', v_strongest,
    'weakest_subject', v_weakest,
    'is_limited_data', v_completed < 3,
    'subject_min_answered', v_subject_min_answered,
    'trend_threshold', v_trend_threshold
  );
end;
$$;

revoke all on function public.get_user_performance_analytics() from public;
grant execute on function public.get_user_performance_analytics() to authenticated;
