-- Phase 6: rank each exam once per call.
--
-- Measured with scripts/db-checks/bench.mjs (single connection, 3000 finished
-- attempts): get_exam_leaderboard and get_attempt_ranking recomputed the full
-- ranking two to three times per call and grew roughly linearly with
-- participants. They now evaluate it once (MATERIALIZED CTE). Behaviour,
-- privacy rules and output shape are unchanged.

create or replace function private.get_exam_leaderboard_core(
  p_exam_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_exam public.exams;
  v_safe_limit integer;
  v_total integer;
  v_entries jsonb;
  v_viewer_entry jsonb;
begin
  if v_viewer_id is null then
    raise exception 'Unauthorized';
  end if;

  v_safe_limit := greatest(1, least(coalesce(p_limit, 50), 100));

  select * into v_exam from public.exams e where e.id = p_exam_id;
  if not found then
    raise exception 'Deneme bulunamadı';
  end if;

  if not private.is_admin() then
    if not private.scheduled_results_available(v_exam, now()) then
      raise exception 'Sonuçlar henüz açıklanmadı';
    end if;

    if not exists (
      select 1 from public.exam_attempts ea
      where ea.exam_id = p_exam_id
        and ea.user_id = v_viewer_id
        and ea.status in ('submitted', 'expired')
    ) then
      raise exception 'Sıralamayı görmek için bu denemeyi tamamlamış olmalısınız';
    end if;
  end if;

  with ranked as materialized (
    select * from private.exam_ranked_best_attempts(p_exam_id)
  ),
  shown as (
    select r.*, p.display_name, p.show_in_leaderboard
    from ranked r
    join public.profiles p on p.id = r.user_id
    where r.rank <= v_safe_limit or r.user_id = v_viewer_id
  )
  select
    (select count(*)::integer from ranked),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rank', s.rank,
          'display_name', private.leaderboard_display_name(
            s.display_name, s.show_in_leaderboard, s.user_id = v_viewer_id),
          'is_current_user', s.user_id = v_viewer_id,
          'is_hidden', not coalesce(s.show_in_leaderboard, true) and s.user_id <> v_viewer_id,
          'correct_count', s.correct_count,
          'incorrect_count', s.incorrect_count,
          'blank_count', s.blank_count
        )
        order by s.rank
      ) filter (where s.rank <= v_safe_limit),
      '[]'::jsonb
    ),
    (
      select jsonb_build_object(
        'rank', s2.rank,
        'display_name', private.leaderboard_display_name(
          s2.display_name, s2.show_in_leaderboard, true),
        'is_current_user', true,
        'is_hidden', false,
        'correct_count', s2.correct_count,
        'incorrect_count', s2.incorrect_count,
        'blank_count', s2.blank_count
      )
      from shown s2
      where s2.user_id = v_viewer_id
        and s2.rank > v_safe_limit
    )
  into v_total, v_entries, v_viewer_entry
  from shown s;

  return jsonb_build_object(
    'exam_id', p_exam_id,
    'exam_title', v_exam.title,
    'total_participants', coalesce(v_total, 0),
    'limit', v_safe_limit,
    'entries', v_entries,
    'viewer_entry', v_viewer_entry
  );
end;
$$;

create or replace function private.get_attempt_ranking_core(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
  v_exam public.exams;
  v_rank integer;
  v_total integer;
  v_best_attempt_id uuid;
  v_top_percent numeric;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select ea.* into v_attempt
  from public.exam_attempts ea
  where ea.id = p_attempt_id and ea.user_id = auth.uid();

  if not found then
    raise exception 'Sonuç bulunamadı';
  end if;

  if v_attempt.status not in ('submitted', 'expired') then
    raise exception 'Tamamlanmamış denemeler sıralamaya dahil değil';
  end if;

  select * into v_exam from public.exams where id = v_attempt.exam_id;

  if not private.scheduled_results_available(v_exam, now()) then
    return jsonb_build_object(
      'embargo', true,
      'results_publish_at', v_exam.results_publish_at
    );
  end if;

  with ranked as materialized (
    select * from private.exam_ranked_best_attempts(v_attempt.exam_id)
  )
  select
    (select count(*)::integer from ranked),
    me.rank,
    me.attempt_id
  into v_total, v_rank, v_best_attempt_id
  from (select 1) one
  left join ranked me on me.user_id = v_attempt.user_id;

  if v_rank is null then
    raise exception 'Sıralama hesaplanamadı';
  end if;

  v_top_percent := case
    when v_total <= 0 then null
    else round((v_rank::numeric / v_total::numeric) * 100, 1)
  end;

  return jsonb_build_object(
    'embargo', false,
    'exam_id', v_attempt.exam_id,
    'exam_title', v_exam.title,
    'rank', v_rank,
    'total_participants', v_total,
    'top_percent', v_top_percent,
    'best_attempt_id', v_best_attempt_id,
    'is_best_attempt', v_best_attempt_id = p_attempt_id
  );
end;
$$;
