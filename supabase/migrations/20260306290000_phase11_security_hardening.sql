-- Phase 11: production security hardening
--
-- Findings addressed here:
--   1. Any authenticated student could read questions.explanation directly,
--      which usually reveals the correct answer before submission.
--   2. attempt_questions exposed answer-key snapshot columns to API roles.
--      They are NULL until finalisation, so the leak was latent, not active,
--      but nothing structurally prevented it.
--   3. anon held EXECUTE on every public RPC (guarded only by in-function
--      auth.uid() checks).
--   4. API roles held write grants on attempt tables that only SECURITY
--      DEFINER functions are allowed to mutate.
--   5. attempt_remaining_seconds was IMMUTABLE while calling now().

-- ---------------------------------------------------------------------------
-- 1. Answer-key protection: students must not read public.questions directly
-- ---------------------------------------------------------------------------
-- The whole row (including `explanation`) was reachable via PostgREST. RLS is
-- row-level only, so the column cannot be hidden by a policy. Student reads
-- now go through get_exam_session / get_attempt_review instead.
drop policy if exists "Authenticated users can read active questions" on public.questions;
drop policy if exists "Users can read questions in own attempts" on public.questions;

-- ---------------------------------------------------------------------------
-- 2. Answer-key protection: snapshot columns are function-only
-- ---------------------------------------------------------------------------
-- A column-level REVOKE is ignored while a table-level grant exists, so the
-- table grant is dropped first and only the safe columns are granted back.
revoke select on public.attempt_questions from anon, authenticated;
grant select (id, attempt_id, question_id, sort_order, created_at)
  on public.attempt_questions to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Attempt tables are written only by SECURITY DEFINER functions
-- ---------------------------------------------------------------------------
-- No INSERT/UPDATE/DELETE policy exists on these tables, so RLS already
-- denied writes. Removing the grants means a future permissive policy cannot
-- silently open scoring up to clients.
revoke insert, update, delete on public.exam_attempts from anon, authenticated;
revoke insert, update, delete on public.attempt_questions from anon, authenticated;
revoke insert, update, delete on public.attempt_answers from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Timer correctness: now() makes this STABLE, never IMMUTABLE
-- ---------------------------------------------------------------------------
create or replace function private.attempt_remaining_seconds(p_attempt public.exam_attempts)
returns integer
language sql
stable
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
-- 5. RPC: exam session payload (replaces direct student table reads)
-- ---------------------------------------------------------------------------
-- Returns only what the exam UI needs: ordered questions, option text and the
-- caller's own saved selections. is_correct and explanation are never
-- included. Question text is read live so that deactivating a question
-- mid-attempt does not blank out a running exam.
create or replace function public.get_exam_session(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.exam_attempts;
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

  v_attempt := private.expire_attempt_if_needed(p_attempt_id);

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
        'question_text', q.question_text,
        'selected_option_id', aa.selected_option_id,
        'options', (
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
    'remaining_seconds', private.attempt_remaining_seconds(v_attempt),
    'questions', v_questions
  );
end;
$$;

revoke all on function public.get_exam_session(uuid) from public, anon;
grant execute on function public.get_exam_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. anon must not hold EXECUTE on authenticated-only RPCs
-- ---------------------------------------------------------------------------
-- Supabase default privileges grant EXECUTE to anon for every new function in
-- `public`, so each one has to be revoked explicitly.
revoke execute on function public.admin_create_question(uuid, uuid, text, text, text, boolean, jsonb) from anon;
revoke execute on function public.admin_update_question(uuid, uuid, uuid, text, text, text, boolean, jsonb) from anon;
revoke execute on function public.get_attempt_ranking(uuid) from anon;
revoke execute on function public.get_attempt_review(uuid) from anon;
revoke execute on function public.get_exam_leaderboard(uuid, integer) from anon;
revoke execute on function public.get_user_performance_analytics() from anon;
revoke execute on function public.save_attempt_answer(uuid, uuid, uuid) from anon;
revoke execute on function public.start_exam_attempt(uuid) from anon;
revoke execute on function public.submit_exam_attempt(uuid) from anon;
revoke execute on function public.sync_exam_attempt(uuid) from anon;

-- ---------------------------------------------------------------------------
-- 7. Drop surface the app no longer uses
-- ---------------------------------------------------------------------------
-- get_exam_session now supplies option text, so this view has no callers. It
-- was also a SECURITY DEFINER view, meaning it bypassed RLS by design.
drop view if exists public.question_options_public;

-- Deliberately NOT touched: public.rls_auto_enable().
--
-- The Supabase advisor reports it as anon/authenticated executable, because
-- PUBLIC holds EXECUTE on it. It is left as-is on purpose:
--   * it returns the `event_trigger` pseudo-type, so PostgREST cannot invoke
--     it over /rest/v1/rpc at all, and
--   * it is the platform event trigger that auto-enables RLS on any new table
--     in `public`. Revoking EXECUTE risks disabling that safety net, which
--     would be a worse outcome than the advisory itself.
