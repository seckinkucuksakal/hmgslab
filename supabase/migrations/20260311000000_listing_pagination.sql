-- Phase 4: listing, pagination and batched exam state
--
-- * get_attempt_results_page: keyset-paginated results history (stable order
--   submitted_at desc, id desc; no duplicates/skips while new results arrive).
--   Result embargo handling is identical to get_attempt_results_list.
-- * get_student_exam_list: all active exams with the caller's attempt state and
--   live status in ONE round trip; stale in-progress attempts are finalised
--   first so an expired/finished session is never reported as running.

create or replace function public.get_attempt_results_page(
  p_limit integer default 20,
  p_cursor_submitted_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_rows jsonb;
  v_items jsonb;
  v_count integer;
  v_next jsonb := null;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if (p_cursor_submitted_at is null) <> (p_cursor_id is null) then
    raise exception 'Invalid cursor';
  end if;

  select coalesce(jsonb_agg(page.item order by page.sort_ts desc, page.sort_id desc), '[]'::jsonb)
  into v_rows
  from (
    select
      coalesce(ea.submitted_at, '-infinity'::timestamptz) as sort_ts,
      ea.id as sort_id,
      jsonb_build_object(
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
        end,
        'incorrect_count', case
          when private.scheduled_results_available(e, now()) then ea.incorrect_count
        end,
        'blank_count', case
          when private.scheduled_results_available(e, now()) then ea.blank_count
        end,
        'completion_percent', case
          when not private.scheduled_results_available(e, now()) then null
          else private.compute_exam_score(
            ea.correct_count,
            (select count(*)::integer from public.attempt_questions aq
             where aq.attempt_id = ea.id)
          )
        end
      ) as item
    from public.exam_attempts ea
    join public.exams e on e.id = ea.exam_id
    where ea.user_id = v_user_id
      and ea.status in ('submitted', 'expired')
      and (
        p_cursor_id is null
        or (coalesce(ea.submitted_at, '-infinity'::timestamptz), ea.id)
           < (p_cursor_submitted_at, p_cursor_id)
      )
    order by coalesce(ea.submitted_at, '-infinity'::timestamptz) desc, ea.id desc
    limit v_limit + 1
  ) page;

  v_count := jsonb_array_length(v_rows);

  if v_count > v_limit then
    -- the extra row only signals "more"; the cursor is the last returned item
    v_items := (select jsonb_agg(x.value order by x.ord)
                from jsonb_array_elements(v_rows) with ordinality x(value, ord)
                where x.ord <= v_limit);
    v_next := jsonb_build_object(
      'submitted_at', v_items -> (v_limit - 1) -> 'submitted_at',
      'id', v_items -> (v_limit - 1) -> 'id'
    );
  else
    v_items := v_rows;
  end if;

  return jsonb_build_object('items', v_items, 'next_cursor', v_next);
end;
$$;

revoke all on function public.get_attempt_results_page(integer, timestamptz, uuid) from public, anon;
grant execute on function public.get_attempt_results_page(integer, timestamptz, uuid) to authenticated;

create or replace function public.get_student_exam_list()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_exam public.exams;
  v_stale uuid;
  v_in_progress uuid;
  v_finalized uuid;
  v_status jsonb;
  v_items jsonb := '[]'::jsonb;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  -- finalise attempts whose time is up so they are not listed as running
  for v_stale in
    select ea.id
    from public.exam_attempts ea
    where ea.user_id = v_user_id and ea.status = 'in_progress'
  loop
    perform private.expire_attempt_if_needed(v_stale);
  end loop;

  for v_exam in
    select e.*
    from public.exams e
    where e.is_active
    order by e.scheduled_start_at asc nulls last, e.updated_at desc, e.id
  loop
    select ea.id into v_in_progress
    from public.exam_attempts ea
    where ea.exam_id = v_exam.id and ea.user_id = v_user_id and ea.status = 'in_progress'
    limit 1;

    select ea.id into v_finalized
    from public.exam_attempts ea
    where ea.exam_id = v_exam.id and ea.user_id = v_user_id
      and ea.status in ('submitted', 'expired')
    order by ea.submitted_at desc nulls last, ea.id desc
    limit 1;

    select count(*)::integer into v_count
    from public.exam_questions where exam_id = v_exam.id;

    if v_exam.exam_mode = 'scheduled' then
      v_status := public.get_exam_live_status(v_exam.id);
    else
      v_status := null;
    end if;

    v_items := v_items || jsonb_build_object(
      'id', v_exam.id,
      'title', v_exam.title,
      'description', v_exam.description,
      'duration_minutes', v_exam.duration_minutes,
      'question_count', v_count,
      'exam_mode', v_exam.exam_mode,
      'scheduled_start_at', v_exam.scheduled_start_at,
      'lobby_open_at', v_exam.lobby_open_at,
      'scheduled_end_at', v_exam.scheduled_end_at,
      'results_publish_at', v_exam.results_publish_at,
      'in_progress_attempt_id', v_in_progress,
      'finalized_attempt_id', v_finalized,
      'live_state', coalesce(v_status ->> 'exam_state', 'practice'),
      'can_enter_lobby', coalesce((v_status ->> 'can_enter_lobby')::boolean, false),
      'can_enter_exam', coalesce((v_status ->> 'can_enter_exam')::boolean, true),
      'results_available', coalesce((v_status ->> 'results_available')::boolean, true),
      'seconds_until_start', coalesce((v_status ->> 'seconds_until_start')::integer, 0),
      'server_now', now()
    );
  end loop;

  return v_items;
end;
$$;

revoke all on function public.get_student_exam_list() from public, anon;
grant execute on function public.get_student_exam_list() to authenticated;

-- question search ordering/filter support for the admin bank
create index if not exists questions_created_at_id_idx
  on public.questions (created_at desc, id desc);
