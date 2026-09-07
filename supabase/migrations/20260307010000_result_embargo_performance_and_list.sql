-- Result embargo: performance analytics + results list must respect scheduled_results_available

-- ---------------------------------------------------------------------------
-- RPC: attempt results list (published scores + embargo placeholders)
-- ---------------------------------------------------------------------------
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
            when (
              select count(*)
              from public.attempt_questions aq
              where aq.attempt_id = ea.id
            ) = 0 then 0
            else round(
              100.0 * ea.correct_count::numeric / (
                select count(*)
                from public.attempt_questions aq
                where aq.attempt_id = ea.id
              )
            )::integer
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

revoke all on function public.get_attempt_results_list(integer) from public, anon;
grant execute on function public.get_attempt_results_list(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: performance analytics (exclude embargoed attempts from all aggregates)
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
  v_pending jsonb;
  v_recent_avg numeric;
  v_previous_avg numeric;
  v_trend_threshold constant numeric := 3.0;
  v_subject_min_answered constant integer := 5;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select coalesce(jsonb_agg(row order by (row ->> 'submitted_at') desc nulls last), '[]'::jsonb)
  into v_pending
  from (
    select jsonb_build_object(
      'attempt_id', ea.id,
      'exam_id', ea.exam_id,
      'exam_title', e.title,
      'submitted_at', ea.submitted_at,
      'results_publish_at', e.results_publish_at
    ) as row
    from public.exam_attempts ea
    join public.exams e on e.id = ea.exam_id
    where ea.user_id = v_user_id
      and ea.status in ('submitted', 'expired')
      and not private.scheduled_results_available(e, now())
    order by ea.submitted_at desc nulls last, ea.id desc
    limit 12
  ) pending_rows;

  select count(*)::integer
  into v_completed
  from public.exam_attempts ea
  join public.exams e on e.id = ea.exam_id
  where ea.user_id = v_user_id
    and ea.status in ('submitted', 'expired')
    and private.scheduled_results_available(e, now());

  if v_completed = 0 then
    return jsonb_build_object(
      'has_data', false,
      'overview', null,
      'recent_exams', '[]'::jsonb,
      'subjects', '[]'::jsonb,
      'topics', '[]'::jsonb,
      'strongest_subject', null,
      'weakest_subject', null,
      'pending_exams', v_pending,
      'is_limited_data', false,
      'subject_min_answered', v_subject_min_answered,
      'trend_threshold', v_trend_threshold
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
      and private.scheduled_results_available(e, now())
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
      and private.scheduled_results_available(e, now())
  ) ast
  order by ast.correct_percent desc
  limit 1;

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
    join public.exams e on e.id = ea.exam_id
    where ea.user_id = v_user_id
      and ea.status in ('submitted', 'expired')
      and private.scheduled_results_available(e, now())
  ),
  recent as (
    select avg(correct_percent) as avg_percent from ordered where rn between 1 and 3
  ),
  previous as (
    select avg(correct_percent) as avg_percent from ordered where rn between 4 and 6
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
        and private.scheduled_results_available(e, now())
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
      'answered', count(*) filter (where aa.selected_option_id is not null)::integer,
      'correct', count(*) filter (
        where aa.selected_option_id = aq.correct_option_id_snapshot
      )::integer,
      'incorrect', count(*) filter (
        where aa.selected_option_id is not null
          and aa.selected_option_id is distinct from aq.correct_option_id_snapshot
      )::integer,
      'blank', count(*) filter (where aa.selected_option_id is null)::integer,
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
    join public.exams e on e.id = ea.exam_id
    join public.attempt_questions aq on aq.attempt_id = ea.id
    left join public.attempt_answers aa
      on aa.attempt_id = aq.attempt_id and aa.question_id = aq.question_id
    where ea.user_id = v_user_id
      and ea.status in ('submitted', 'expired')
      and private.scheduled_results_available(e, now())
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
      'answered', count(*) filter (where aa.selected_option_id is not null)::integer,
      'correct', count(*) filter (
        where aa.selected_option_id = aq.correct_option_id_snapshot
      )::integer,
      'incorrect', count(*) filter (
        where aa.selected_option_id is not null
          and aa.selected_option_id is distinct from aq.correct_option_id_snapshot
      )::integer,
      'blank', count(*) filter (where aa.selected_option_id is null)::integer,
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
    join public.exams e on e.id = ea.exam_id
    join public.attempt_questions aq on aq.attempt_id = ea.id
    left join public.attempt_answers aa
      on aa.attempt_id = aq.attempt_id and aa.question_id = aq.question_id
    where ea.user_id = v_user_id
      and ea.status in ('submitted', 'expired')
      and private.scheduled_results_available(e, now())
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
        count(*) filter (where aa.selected_option_id is not null)::integer as answered,
        round(
          100.0 * count(*) filter (
            where aa.selected_option_id = aq.correct_option_id_snapshot
          ) / nullif(count(*), 0)
        )::integer as correct_percent
      from public.exam_attempts ea
      join public.exams e on e.id = ea.exam_id
      join public.attempt_questions aq on aq.attempt_id = ea.id
      left join public.attempt_answers aa
        on aa.attempt_id = aq.attempt_id and aa.question_id = aq.question_id
      where ea.user_id = v_user_id
        and ea.status in ('submitted', 'expired')
        and private.scheduled_results_available(e, now())
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
        count(*) filter (where aa.selected_option_id is not null)::integer as answered,
        round(
          100.0 * count(*) filter (
            where aa.selected_option_id = aq.correct_option_id_snapshot
          ) / nullif(count(*), 0)
        )::integer as correct_percent
      from public.exam_attempts ea
      join public.exams e on e.id = ea.exam_id
      join public.attempt_questions aq on aq.attempt_id = ea.id
      left join public.attempt_answers aa
        on aa.attempt_id = aq.attempt_id and aa.question_id = aq.question_id
      where ea.user_id = v_user_id
        and ea.status in ('submitted', 'expired')
        and private.scheduled_results_available(e, now())
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
    'pending_exams', v_pending,
    'is_limited_data', v_completed < 3,
    'subject_min_answered', v_subject_min_answered,
    'trend_threshold', v_trend_threshold
  );
end;
$$;

revoke all on function public.get_user_performance_analytics() from public, anon;
grant execute on function public.get_user_performance_analytics() to authenticated;
