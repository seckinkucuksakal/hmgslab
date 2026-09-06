-- Phase 8: exam ranking and leaderboard

-- ---------------------------------------------------------------------------
-- profile preference: show in public leaderboard
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column show_in_leaderboard boolean not null default true;

-- ---------------------------------------------------------------------------
-- indexes for ranking queries
-- ---------------------------------------------------------------------------
create index exam_attempts_ranking_idx
  on public.exam_attempts (
    exam_id,
    correct_count desc,
    incorrect_count asc,
    submitted_at asc
  )
  where status in ('submitted', 'expired');

create index exam_attempts_exam_user_finalized_idx
  on public.exam_attempts (exam_id, user_id)
  where status in ('submitted', 'expired');

-- ---------------------------------------------------------------------------
-- leaderboard display name (privacy-safe)
-- ---------------------------------------------------------------------------
create or replace function private.leaderboard_display_name(
  p_display_name text,
  p_show_in_leaderboard boolean,
  p_is_current_user boolean
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_is_current_user then coalesce(nullif(btrim(p_display_name), ''), 'Kullanıcı')
    when not coalesce(p_show_in_leaderboard, true) then 'Gizli Kullanıcı'
    else coalesce(nullif(btrim(p_display_name), ''), 'Kullanıcı')
  end;
$$;

revoke all on function private.leaderboard_display_name(text, boolean, boolean) from public;

-- ---------------------------------------------------------------------------
-- ranked best attempts per user for an exam (one row per user)
-- ---------------------------------------------------------------------------
create or replace function private.exam_ranked_best_attempts(p_exam_id uuid)
returns table (
  attempt_id uuid,
  user_id uuid,
  correct_count integer,
  incorrect_count integer,
  blank_count integer,
  submitted_at timestamptz,
  rank integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with best_attempts as (
    select distinct on (ea.user_id)
      ea.id as attempt_id,
      ea.user_id,
      ea.correct_count,
      ea.incorrect_count,
      ea.blank_count,
      ea.submitted_at
    from public.exam_attempts ea
    where ea.exam_id = p_exam_id
      and ea.status in ('submitted', 'expired')
      and ea.correct_count is not null
    order by
      ea.user_id,
      ea.correct_count desc,
      ea.incorrect_count asc,
      ea.submitted_at asc
  )
  select
    ba.attempt_id,
    ba.user_id,
    ba.correct_count,
    ba.incorrect_count,
    ba.blank_count,
    ba.submitted_at,
    row_number() over (
      order by
        ba.correct_count desc,
        ba.incorrect_count asc,
        ba.submitted_at asc
    )::integer as rank
  from best_attempts ba;
$$;

revoke all on function private.exam_ranked_best_attempts(uuid) from public;

-- ---------------------------------------------------------------------------
-- RPC: ranking for a finalized attempt (owner only)
-- ---------------------------------------------------------------------------
create or replace function public.get_attempt_ranking(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
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

  select e.title into v_exam_title
  from public.exams e
  where e.id = v_attempt.exam_id;

  if not found then
    raise exception 'Deneme bulunamadı';
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

revoke all on function public.get_attempt_ranking(uuid) from public;
grant execute on function public.get_attempt_ranking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: exam leaderboard (top N + current user if outside range)
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
  v_exam_title text;
  v_total integer;
  v_entries jsonb;
  v_viewer_entry jsonb;
  v_safe_limit integer;
begin
  if v_viewer_id is null then
    raise exception 'Unauthorized';
  end if;

  v_safe_limit := greatest(1, least(coalesce(p_limit, 50), 100));

  select e.title into v_exam_title
  from public.exams e
  where e.id = p_exam_id;

  if not found then
    raise exception 'Deneme bulunamadı';
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
      'blank_count', r.blank_count,
      'submitted_at', r.submitted_at
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
    'blank_count', r.blank_count,
    'submitted_at', r.submitted_at
  )
  into v_viewer_entry
  from private.exam_ranked_best_attempts(p_exam_id) r
  join public.profiles p on p.id = r.user_id
  where r.user_id = v_viewer_id;

  return jsonb_build_object(
    'exam_id', p_exam_id,
    'exam_title', v_exam_title,
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

revoke all on function public.get_exam_leaderboard(uuid, integer) from public;
grant execute on function public.get_exam_leaderboard(uuid, integer) to authenticated;
