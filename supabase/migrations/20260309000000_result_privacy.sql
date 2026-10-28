-- Phase 2: result privacy and ranking correctness
--
-- 1. get_exam_leaderboard now enforces the result embargo (it did not), and only
--    exposes the ranking to participants who finished the exam (or admins).
--    Leaderboard rows no longer include other users' submission timestamps.
-- 2. Scores/correct/incorrect/blank counts on exam_attempts are no longer
--    readable through direct table access; they are only returned by the
--    embargo-aware SECURITY DEFINER functions.

-- ---------------------------------------------------------------------------
-- 1. leaderboard
-- ---------------------------------------------------------------------------
create or replace function public.get_exam_leaderboard(
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
  v_total integer;
  v_entries jsonb;
  v_viewer_entry jsonb;
  v_safe_limit integer;
begin
  if v_viewer_id is null then
    raise exception 'Unauthorized';
  end if;

  v_safe_limit := greatest(1, least(coalesce(p_limit, 50), 100));

  select * into v_exam
  from public.exams e
  where e.id = p_exam_id;

  if not found then
    raise exception 'Deneme bulunamadı';
  end if;

  if not private.is_admin() then
    if not private.scheduled_results_available(v_exam, now()) then
      raise exception 'Sonuçlar henüz açıklanmadı';
    end if;

    if not exists (
      select 1
      from public.exam_attempts ea
      where ea.exam_id = p_exam_id
        and ea.user_id = v_viewer_id
        and ea.status in ('submitted', 'expired')
    ) then
      raise exception 'Sıralamayı görmek için bu denemeyi tamamlamış olmalısınız';
    end if;
  end if;

  select count(*)::integer into v_total
  from private.exam_ranked_best_attempts(p_exam_id);

  select coalesce(jsonb_agg(entry order by (entry ->> 'rank')::integer), '[]'::jsonb)
  into v_entries
  from (
    select jsonb_build_object(
      'rank', r.rank,
      'display_name', private.leaderboard_display_name(
        p.display_name,
        p.show_in_leaderboard,
        r.user_id = v_viewer_id
      ),
      'is_current_user', r.user_id = v_viewer_id,
      'is_hidden', not coalesce(p.show_in_leaderboard, true) and r.user_id <> v_viewer_id,
      'correct_count', r.correct_count,
      'incorrect_count', r.incorrect_count,
      'blank_count', r.blank_count
    ) as entry
    from private.exam_ranked_best_attempts(p_exam_id) r
    join public.profiles p on p.id = r.user_id
    where r.rank <= v_safe_limit
  ) top_rows;

  select jsonb_build_object(
    'rank', r.rank,
    'display_name', private.leaderboard_display_name(
      p.display_name,
      p.show_in_leaderboard,
      true
    ),
    'is_current_user', true,
    'is_hidden', false,
    'correct_count', r.correct_count,
    'incorrect_count', r.incorrect_count,
    'blank_count', r.blank_count
  )
  into v_viewer_entry
  from private.exam_ranked_best_attempts(p_exam_id) r
  join public.profiles p on p.id = r.user_id
  where r.user_id = v_viewer_id;

  return jsonb_build_object(
    'exam_id', p_exam_id,
    'exam_title', v_exam.title,
    'total_participants', v_total,
    'limit', v_safe_limit,
    'entries', v_entries,
    'viewer_entry', case
      when v_viewer_entry is null then null
      when (v_viewer_entry ->> 'rank')::integer <= v_safe_limit then null
      else v_viewer_entry
    end
  );
end;
$$;

revoke all on function public.get_exam_leaderboard(uuid, integer) from public, anon;
grant execute on function public.get_exam_leaderboard(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. exam_attempts: hide result columns from direct reads
-- ---------------------------------------------------------------------------
-- RLS is row-level only, so the owner could read score/correct_count/... of a
-- finished but still embargoed attempt straight from the table. Column grants
-- keep identity/status/timing readable and leave results to the RPCs.
revoke select on public.exam_attempts from anon, authenticated;
grant select (
  id,
  user_id,
  exam_id,
  started_at,
  submitted_at,
  status,
  duration_minutes_snapshot,
  scheduled_end_at_snapshot,
  created_at
) on public.exam_attempts to authenticated;
