-- Phase 6: provider-neutral access control (billing foundation)
--
-- No payment provider is connected. This migration only adds the server-side
-- entitlement model and enforcement points so a provider webhook can later
-- grant/extend/revoke entitlements without touching exam logic.
--
-- Decisions applied (product owner): paid plans are time-limited (monthly,
-- season); free users may start a limited number of distinct exams; users whose
-- paid access has lapsed lose access to results history until they renew.
--
-- Enforcement is OFF by default (billing_settings.enforced = false) so nothing
-- changes for existing users until the owner switches it on.

create table public.billing_settings (
  id boolean primary key default true check (id),
  enforced boolean not null default false,
  free_exam_limit integer not null default 1 check (free_exam_limit >= 0)
);
insert into public.billing_settings default values;
alter table public.billing_settings enable row level security;
revoke all on public.billing_settings from anon, authenticated;

create table public.plans (
  id text primary key,
  name text not null,
  duration_days integer check (duration_days is null or duration_days > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0
);
-- Prices are intentionally not stored: they are an undecided product matter.
insert into public.plans (id, name, duration_days, sort_order) values
  ('monthly', 'Aylık paket', 30, 1),
  ('season', 'Sezon paketi', null, 2);
alter table public.plans enable row level security;
create policy "Authenticated users can read plans"
  on public.plans for select to authenticated using (is_active);
revoke insert, update, delete on public.plans from anon, authenticated;

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null default 'active'
    check (status in ('active', 'canceled', 'revoked')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'provider')),
  -- idempotency key for provider events (e.g. subscription or payment id)
  provider text,
  provider_ref text,
  note text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (provider, provider_ref)
);
create index entitlements_user_idx on public.entitlements (user_id, ends_at desc);
alter table public.entitlements enable row level security;
revoke all on public.entitlements from anon, authenticated;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function private.billing_enforced()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select enforced from public.billing_settings), false) $$;

-- canceled keeps access until ends_at; revoked (refund/abuse) does not
create or replace function private.has_active_entitlement(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = p_user_id
      and e.status in ('active', 'canceled')
      and e.starts_at <= now()
      and e.ends_at > now()
  )
$$;

-- lapsed paying user: had an entitlement before, has none active now
create or replace function private.history_locked(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.billing_enforced()
    and p_user_id is not null
    and exists (select 1 from public.entitlements e where e.user_id = p_user_id)
    and not private.has_active_entitlement(p_user_id)
$$;

revoke all on function private.billing_enforced() from public;
revoke all on function private.has_active_entitlement(uuid) from public;
revoke all on function private.history_locked(uuid) from public;

-- ---------------------------------------------------------------------------
-- starting an exam requires access (resuming an attempt inserts nothing)
-- ---------------------------------------------------------------------------
create or replace function private.enforce_exam_access()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
begin
  if not private.billing_enforced() or private.has_active_entitlement(new.user_id) then
    return new;
  end if;

  -- a lapsed paying user cannot start new exams
  if private.history_locked(new.user_id) then
    raise exception 'Bu deneme için aktif paket gerekiyor';
  end if;

  select free_exam_limit into v_limit from public.billing_settings;

  -- free allowance counts distinct exams; a retry of an exam already used is fine
  if exists (
    select 1 from public.exam_attempts ea
    where ea.user_id = new.user_id and ea.exam_id = new.exam_id
  ) then
    return new;
  end if;

  select count(distinct ea.exam_id) into v_used
  from public.exam_attempts ea where ea.user_id = new.user_id;

  if v_used >= v_limit then
    raise exception 'Bu deneme için aktif paket gerekiyor';
  end if;

  return new;
end;
$$;

create trigger exam_attempts_enforce_access
  before insert on public.exam_attempts
  for each row execute function private.enforce_exam_access();

-- ---------------------------------------------------------------------------
-- results history: wrappers refuse lapsed users; originals move to `private`
-- ---------------------------------------------------------------------------
alter function public.get_attempt_review(uuid) set schema private;
alter function private.get_attempt_review(uuid) rename to get_attempt_review_core;
alter function public.get_attempt_ranking(uuid) set schema private;
alter function private.get_attempt_ranking(uuid) rename to get_attempt_ranking_core;
alter function public.get_attempt_results_list(integer) set schema private;
alter function private.get_attempt_results_list(integer) rename to get_attempt_results_list_core;
alter function public.get_attempt_results_page(integer, timestamptz, uuid) set schema private;
alter function private.get_attempt_results_page(integer, timestamptz, uuid) rename to get_attempt_results_page_core;
alter function public.get_user_performance_analytics() set schema private;
alter function private.get_user_performance_analytics() rename to get_user_performance_analytics_core;
alter function public.get_exam_leaderboard(uuid, integer) set schema private;
alter function private.get_exam_leaderboard(uuid, integer) rename to get_exam_leaderboard_core;

revoke all on function private.get_attempt_review_core(uuid) from public, anon, authenticated;
revoke all on function private.get_attempt_ranking_core(uuid) from public, anon, authenticated;
revoke all on function private.get_attempt_results_list_core(integer) from public, anon, authenticated;
revoke all on function private.get_attempt_results_page_core(integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function private.get_user_performance_analytics_core() from public, anon, authenticated;
revoke all on function private.get_exam_leaderboard_core(uuid, integer) from public, anon, authenticated;

create or replace function private.assert_history_access()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if private.history_locked(auth.uid()) then
    raise exception 'Geçmiş sonuçlar için aktif paket gerekiyor';
  end if;
end;
$$;
revoke all on function private.assert_history_access() from public;

create or replace function public.get_attempt_review(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$ begin
  perform private.assert_history_access();
  return private.get_attempt_review_core(p_attempt_id);
end $$;

create or replace function public.get_attempt_ranking(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$ begin
  perform private.assert_history_access();
  return private.get_attempt_ranking_core(p_attempt_id);
end $$;

create or replace function public.get_attempt_results_list(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = ''
as $$ begin
  perform private.assert_history_access();
  return private.get_attempt_results_list_core(p_limit);
end $$;

create or replace function public.get_attempt_results_page(
  p_limit integer default 20,
  p_cursor_submitted_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$ begin
  perform private.assert_history_access();
  return private.get_attempt_results_page_core(p_limit, p_cursor_submitted_at, p_cursor_id);
end $$;

create or replace function public.get_user_performance_analytics()
returns jsonb language plpgsql security definer set search_path = ''
as $$ begin
  perform private.assert_history_access();
  return private.get_user_performance_analytics_core();
end $$;

create or replace function public.get_exam_leaderboard(p_exam_id uuid, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = ''
as $$ begin
  perform private.assert_history_access();
  return private.get_exam_leaderboard_core(p_exam_id, p_limit);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'get_attempt_review(uuid)', 'get_attempt_ranking(uuid)',
    'get_attempt_results_list(integer)',
    'get_attempt_results_page(integer, timestamptz, uuid)',
    'get_user_performance_analytics()', 'get_exam_leaderboard(uuid, integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- what the signed-in user sees about their own access
-- ---------------------------------------------------------------------------
create or replace function public.get_my_access()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ent public.entitlements;
  v_plan_name text;
  v_enforced boolean := private.billing_enforced();
  v_limit integer;
  v_used integer;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_ent
  from public.entitlements e
  where e.user_id = v_uid and e.status in ('active', 'canceled')
  order by e.ends_at desc
  limit 1;

  select free_exam_limit into v_limit from public.billing_settings;
  select count(distinct exam_id)::integer into v_used
  from public.exam_attempts where user_id = v_uid;

  if v_ent.id is null then
    v_status := 'free';
  elsif v_ent.starts_at <= now() and v_ent.ends_at > now() then
    v_status := v_ent.status; -- active | canceled (access until ends_at)
  else
    v_status := 'expired';
  end if;

  if v_ent.id is not null then
    select name into v_plan_name from public.plans where id = v_ent.plan_id;
  end if;

  return jsonb_build_object(
    'enforced', v_enforced,
    'status', v_status,
    'plan_id', v_ent.plan_id,
    'plan_name', v_plan_name,
    'starts_at', v_ent.starts_at,
    'ends_at', v_ent.ends_at,
    'free_exam_limit', v_limit,
    'free_exams_used', v_used,
    'history_locked', private.history_locked(v_uid),
    'can_start_new', not v_enforced
      or private.has_active_entitlement(v_uid)
      or (not private.history_locked(v_uid) and v_used < v_limit)
  );
end;
$$;
revoke all on function public.get_my_access() from public, anon;
grant execute on function public.get_my_access() to authenticated;

-- ---------------------------------------------------------------------------
-- admin: manual grant / revoke (until a provider is connected)
-- ---------------------------------------------------------------------------
create or replace function public.admin_grant_entitlement(
  p_user_id uuid,
  p_plan_id text,
  p_ends_at timestamptz default null,
  p_note text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_plan public.plans;
  v_ends timestamptz;
  v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Unauthorized';
  end if;

  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if not found then
    raise exception 'Paket bulunamadı';
  end if;

  v_ends := coalesce(
    p_ends_at,
    case when v_plan.duration_days is not null
      then now() + v_plan.duration_days * interval '1 day' end
  );
  if v_ends is null or v_ends <= now() then
    raise exception 'Geçerli bir bitiş tarihi gerekli';
  end if;

  insert into public.entitlements (user_id, plan_id, ends_at, source, note)
  values (p_user_id, p_plan_id, v_ends, 'manual', p_note)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_revoke_entitlement(p_entitlement_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Unauthorized';
  end if;
  update public.entitlements set status = 'revoked' where id = p_entitlement_id;
  if not found then
    raise exception 'Kayıt bulunamadı';
  end if;
end;
$$;

revoke all on function public.admin_grant_entitlement(uuid, text, timestamptz, text) from public, anon;
revoke all on function public.admin_revoke_entitlement(uuid) from public, anon;
grant execute on function public.admin_grant_entitlement(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.admin_revoke_entitlement(uuid) to authenticated;
