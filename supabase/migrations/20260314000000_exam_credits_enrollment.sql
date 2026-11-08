-- Exam credits and explicit enrollment
--
-- Business model (product owner, 2026-11-08):
-- * Every user gets ONE free exam credit when they sign up (existing users too).
-- * Further credits are bought in packages of 1 or 10. Credits never expire.
-- * A user must explicitly enroll in an exam; enrolling spends one credit.
--   Nobody is enrolled automatically, and an attempt can only be started by an
--   enrolled user (admins excepted, for testing).
-- * One enrollment covers every attempt of that exam (practice retakes are free).
-- * Scheduled (live) exam: if the user enrolled but never started before the
--   entry window closed, the credit is refunded automatically.
--
-- No payment provider is connected yet. Credits are granted by admins with
-- admin_grant_credits(); a provider webhook can later insert 'purchase' rows
-- (provider + provider_ref make it idempotent).
--
-- This replaces the time-limited plan enforcement from billing_foundation:
-- its exam_attempts trigger is dropped (it was never enforced).

-- ---------------------------------------------------------------------------
-- schema
-- ---------------------------------------------------------------------------
create table public.credit_packages (
  id text primary key,
  name text not null,
  credits integer not null check (credits > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0
);
-- Prices are intentionally not stored: they are decided with the provider.
insert into public.credit_packages (id, name, credits, sort_order) values
  ('single', '1 deneme', 1, 1),
  ('pack10', '10 deneme', 10, 2);
alter table public.credit_packages enable row level security;
create policy "Authenticated users can read credit packages"
  on public.credit_packages for select to authenticated using (is_active);
revoke insert, update, delete on public.credit_packages from anon, authenticated;

create table public.exam_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'refunded')),
  -- false for enrollments backfilled from attempts made before credits existed
  charged boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, exam_id)
);
create index exam_enrollments_exam_idx on public.exam_enrollments (exam_id);
alter table public.exam_enrollments enable row level security;
create policy "Users read own enrollments"
  on public.exam_enrollments for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.exam_enrollments from anon, authenticated;

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null
    check (reason in ('signup_bonus', 'purchase', 'admin_grant', 'enrollment', 'refund')),
  package_id text references public.credit_packages (id),
  exam_id uuid references public.exams (id) on delete set null,
  enrollment_id uuid references public.exam_enrollments (id) on delete set null,
  provider text,
  provider_ref text,
  note text,
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
create unique index credit_ledger_one_signup_bonus
  on public.credit_ledger (user_id) where reason = 'signup_bonus';
alter table public.credit_ledger enable row level security;
revoke all on public.credit_ledger from anon, authenticated;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function private.credit_balance(p_user_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(delta), 0)::integer
  from public.credit_ledger
  where user_id = p_user_id
$$;
revoke all on function private.credit_balance(uuid) from public;

-- serialises every credit change of one user (no double spending)
create or replace function private.lock_user_credits(p_user_id uuid)
returns void
language sql security definer set search_path = ''
as $$ select pg_advisory_xact_lock(hashtext('credits:' || p_user_id::text)) $$;
revoke all on function private.lock_user_credits(uuid) from public;

-- Refunds the user's charged live-exam enrollments whose entry window closed
-- without the user ever starting. Idempotent; called lazily from user RPCs.
create or replace function private.refund_no_show_enrollments(p_user_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  perform private.lock_user_credits(p_user_id);

  for v_row in
    select en.id, en.exam_id
    from public.exam_enrollments en
    join public.exams e on e.id = en.exam_id
    where en.user_id = p_user_id
      and en.status = 'active'
      and en.charged
      and e.exam_mode = 'scheduled'
      and now() > coalesce(e.late_entry_until, e.scheduled_end_at)
      and not exists (
        select 1 from public.exam_attempts ea
        where ea.user_id = en.user_id and ea.exam_id = en.exam_id
      )
  loop
    update public.exam_enrollments
    set status = 'refunded', updated_at = now()
    where id = v_row.id;

    insert into public.credit_ledger (user_id, delta, reason, exam_id, enrollment_id, note)
    values (p_user_id, 1, 'refund', v_row.exam_id, v_row.id, 'Canlı sınava katılım olmadı');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
revoke all on function private.refund_no_show_enrollments(uuid) from public;

-- ---------------------------------------------------------------------------
-- signup bonus
-- ---------------------------------------------------------------------------
create or replace function private.grant_signup_bonus()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.credit_ledger (user_id, delta, reason, note)
  values (new.id, 1, 'signup_bonus', 'Kayıt hediyesi')
  on conflict (user_id) where reason = 'signup_bonus' do nothing;
  return new;
end;
$$;

create trigger profiles_grant_signup_bonus
  after insert on public.profiles
  for each row execute function private.grant_signup_bonus();

-- ---------------------------------------------------------------------------
-- attempts require an active enrollment
-- ---------------------------------------------------------------------------
drop trigger if exists exam_attempts_enforce_access on public.exam_attempts;

create or replace function private.require_exam_enrollment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.is_admin() then
    return new;
  end if;

  if not exists (
    select 1 from public.exam_enrollments en
    where en.user_id = new.user_id
      and en.exam_id = new.exam_id
      and en.status = 'active'
  ) then
    raise exception 'Bu denemeye kayıtlı değilsiniz';
  end if;

  return new;
end;
$$;

create trigger exam_attempts_require_enrollment
  before insert on public.exam_attempts
  for each row execute function private.require_exam_enrollment();

-- ---------------------------------------------------------------------------
-- user RPCs
-- ---------------------------------------------------------------------------
create or replace function public.enroll_in_exam(p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_exam public.exams;
  v_enrollment public.exam_enrollments;
  v_balance integer;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  perform private.refund_no_show_enrollments(v_uid);
  perform private.lock_user_credits(v_uid);

  select * into v_exam from public.exams where id = p_exam_id and is_active;
  if not found then
    raise exception 'Deneme bulunamadı veya aktif değil';
  end if;

  select * into v_enrollment
  from public.exam_enrollments
  where user_id = v_uid and exam_id = p_exam_id;

  -- already enrolled: idempotent, nothing is charged again
  if found and v_enrollment.status = 'active' then
    return jsonb_build_object(
      'enrollment_id', v_enrollment.id,
      'already_enrolled', true,
      'credit_balance', private.credit_balance(v_uid)
    );
  end if;

  if v_exam.exam_mode = 'scheduled'
     and now() > coalesce(v_exam.late_entry_until, v_exam.scheduled_end_at) then
    raise exception 'Bu canlı sınavın kayıt süresi sona erdi';
  end if;

  v_balance := private.credit_balance(v_uid);
  if v_balance < 1 then
    raise exception 'Yetersiz deneme hakkı';
  end if;

  insert into public.exam_enrollments (user_id, exam_id, status, charged)
  values (v_uid, p_exam_id, 'active', true)
  on conflict (user_id, exam_id) do update
    set status = 'active', charged = true, updated_at = now()
  returning * into v_enrollment;

  insert into public.credit_ledger (user_id, delta, reason, exam_id, enrollment_id)
  values (v_uid, -1, 'enrollment', p_exam_id, v_enrollment.id);

  return jsonb_build_object(
    'enrollment_id', v_enrollment.id,
    'already_enrolled', false,
    'credit_balance', v_balance - 1
  );
end;
$$;
revoke all on function public.enroll_in_exam(uuid) from public, anon;
grant execute on function public.enroll_in_exam(uuid) to authenticated;

create or replace function public.get_my_credits()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_history jsonb;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  perform private.refund_no_show_enrollments(v_uid);

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb)
  into v_history
  from (
    select
      l.created_at,
      jsonb_build_object(
        'id', l.id,
        'delta', l.delta,
        'reason', l.reason,
        'exam_title', e.title,
        'package_name', p.name,
        'created_at', l.created_at
      ) as row_data
    from public.credit_ledger l
    left join public.exams e on e.id = l.exam_id
    left join public.credit_packages p on p.id = l.package_id
    where l.user_id = v_uid
    order by l.created_at desc
    limit 20
  ) recent;

  return jsonb_build_object(
    'balance', private.credit_balance(v_uid),
    'history', v_history
  );
end;
$$;
revoke all on function public.get_my_credits() from public, anon;
grant execute on function public.get_my_credits() to authenticated;

-- ---------------------------------------------------------------------------
-- admin: grant credits until a payment provider is connected
-- ---------------------------------------------------------------------------
create or replace function public.admin_grant_credits(
  p_user_id uuid,
  p_package_id text,
  p_note text default null
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_pkg public.credit_packages;
begin
  if not private.is_admin() then
    raise exception 'Unauthorized';
  end if;

  select * into v_pkg from public.credit_packages where id = p_package_id and is_active;
  if not found then
    raise exception 'Paket bulunamadı';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Kullanıcı bulunamadı';
  end if;

  perform private.lock_user_credits(p_user_id);

  insert into public.credit_ledger (user_id, delta, reason, package_id, note)
  values (p_user_id, v_pkg.credits, 'admin_grant', v_pkg.id, p_note);

  return private.credit_balance(p_user_id);
end;
$$;
revoke all on function public.admin_grant_credits(uuid, text, text) from public, anon;
grant execute on function public.admin_grant_credits(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- exam list: enrollment state per exam
-- ---------------------------------------------------------------------------
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
  v_enrolled boolean;
  v_entry_closed boolean;
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

  perform private.refund_no_show_enrollments(v_user_id);

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

    v_enrolled := exists (
      select 1 from public.exam_enrollments en
      where en.user_id = v_user_id and en.exam_id = v_exam.id and en.status = 'active'
    );

    v_entry_closed := v_exam.exam_mode = 'scheduled'
      and now() > coalesce(v_exam.late_entry_until, v_exam.scheduled_end_at);

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
      'is_enrolled', v_enrolled,
      'can_enroll', not v_enrolled and not v_entry_closed and v_count > 0,
      'live_state', coalesce(v_status ->> 'exam_state', 'practice'),
      'can_enter_lobby', v_enrolled and coalesce((v_status ->> 'can_enter_lobby')::boolean, false),
      'can_enter_exam', v_enrolled and coalesce((v_status ->> 'can_enter_exam')::boolean, true),
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

-- ---------------------------------------------------------------------------
-- backfill
-- ---------------------------------------------------------------------------
-- attempts made before credits existed keep working, without charging anyone
insert into public.exam_enrollments (user_id, exam_id, status, charged)
select distinct ea.user_id, ea.exam_id, 'active', false
from public.exam_attempts ea
on conflict (user_id, exam_id) do nothing;

-- every existing user starts with the free credit as well
insert into public.credit_ledger (user_id, delta, reason, note)
select p.id, 1, 'signup_bonus', 'Kayıt hediyesi'
from public.profiles p
join auth.users u on u.id = p.id
on conflict (user_id) where reason = 'signup_bonus' do nothing;
