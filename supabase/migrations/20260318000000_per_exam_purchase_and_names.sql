-- Per-exam purchase, public name format, exam list fields (product owner, 2026-11-08)
--
-- * Pricing is per exam (like ÖzdeBir / TÖDER): the sign-up gift is one free
--   exam; every further exam is bought on its own (149,90 TL, the 'single'
--   package price). The 5 and 10 packs are retired. Internally a purchase is
--   still "+1 credit, then enroll", so enrollment and refunds stay unchanged.
-- * create_exam_order() opens an order for one exam; fulfilling it (provider
--   webhook or admin) grants the credit AND enrolls the user in that exam.
-- * Other people's names are shown as "Arda Ö." (all words but the last, then
--   the initial of the last word). Users still see their own full name, and the
--   hide-from-leaderboard setting still shows "Gizli Kullanıcı".
-- * get_student_exam_list also returns created_at (for newest-first ordering)
--   and price_kurus.

-- ---------------------------------------------------------------------------
-- names
-- ---------------------------------------------------------------------------
create or replace function private.short_person_name(p_name text)
returns text
language sql immutable set search_path = ''
as $$
  with parts as (
    select regexp_split_to_array(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ' ') as w
  )
  select case
    when btrim(coalesce(p_name, '')) = '' then 'Kullanıcı'
    when array_length(w, 1) = 1 then w[1]
    else array_to_string(w[1:array_length(w, 1) - 1], ' ') || ' '
      || upper(translate(left(w[array_length(w, 1)], 1), 'iıçğöşü', 'İIÇĞÖŞÜ')) || '.'
  end
  from parts
$$;
revoke all on function private.short_person_name(text) from public;

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
    else private.short_person_name(p_display_name)
  end;
$$;

-- ---------------------------------------------------------------------------
-- retire bundles
-- ---------------------------------------------------------------------------
update public.credit_packages set is_active = false where id in ('pack5', 'pack10');

-- ---------------------------------------------------------------------------
-- per-exam orders
-- ---------------------------------------------------------------------------
alter table public.credit_orders
  add column exam_id uuid references public.exams (id) on delete set null;

create or replace function public.create_exam_order(p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pkg public.credit_packages;
  v_exam public.exams;
  v_order public.credit_orders;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_exam from public.exams where id = p_exam_id and is_active;
  if not found then
    raise exception 'Deneme bulunamadı veya aktif değil';
  end if;

  if exists (
    select 1 from public.exam_enrollments
    where user_id = v_uid and exam_id = p_exam_id and status = 'active'
  ) then
    raise exception 'Bu denemeye zaten kayıtlısınız';
  end if;

  if v_exam.exam_mode = 'scheduled'
     and now() > coalesce(v_exam.late_entry_until, v_exam.scheduled_end_at) then
    raise exception 'Bu canlı sınavın kayıt süresi sona erdi';
  end if;

  select * into v_pkg from public.credit_packages where id = 'single' and is_active;
  if not found then
    raise exception 'Paket bulunamadı';
  end if;

  perform private.lock_user_credits(v_uid);

  select * into v_order
  from public.credit_orders
  where user_id = v_uid and exam_id = p_exam_id and status = 'pending'
    and amount_kurus = v_pkg.price_kurus
  order by created_at desc
  limit 1;

  if not found then
    insert into public.credit_orders (user_id, package_id, exam_id, credits, amount_kurus, currency)
    values (v_uid, v_pkg.id, p_exam_id, 1, v_pkg.price_kurus, v_pkg.currency)
    returning * into v_order;
  end if;

  return private.credit_order_json(v_order) || jsonb_build_object('exam_id', v_order.exam_id);
end;
$$;
revoke all on function public.create_exam_order(uuid) from public, anon;
grant execute on function public.create_exam_order(uuid) to authenticated;

-- Fulfilment now also enrolls the buyer when the order is for an exam.
create or replace function private.fulfill_credit_order(
  p_order_id uuid,
  p_provider text,
  p_provider_ref text
)
returns public.credit_orders
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.credit_orders;
  v_enrollment public.exam_enrollments;
begin
  select * into v_order from public.credit_orders where id = p_order_id for update;
  if not found then
    raise exception 'Sipariş bulunamadı';
  end if;

  if v_order.status = 'paid' then
    return v_order;
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Sipariş ödenebilir durumda değil (%)', v_order.status;
  end if;

  perform private.lock_user_credits(v_order.user_id);

  update public.credit_orders
  set status = 'paid', paid_at = now(), provider = p_provider, provider_ref = p_provider_ref
  where id = p_order_id
  returning * into v_order;

  insert into public.credit_ledger (user_id, delta, reason, package_id, order_id, exam_id, note)
  values (v_order.user_id, v_order.credits, 'purchase', v_order.package_id, v_order.id, v_order.exam_id, null);

  -- an exam purchase spends that credit on the exam right away (paid is paid:
  -- even if registration closed meanwhile, the credit stays on the account)
  if v_order.exam_id is not null and not exists (
    select 1 from public.exam_enrollments
    where user_id = v_order.user_id and exam_id = v_order.exam_id and status = 'active'
  ) and exists (
    select 1 from public.exams e
    where e.id = v_order.exam_id and e.is_active
      and not (e.exam_mode = 'scheduled' and now() > coalesce(e.late_entry_until, e.scheduled_end_at))
  ) then
    insert into public.exam_enrollments (user_id, exam_id, status, charged)
    values (v_order.user_id, v_order.exam_id, 'active', true)
    on conflict (user_id, exam_id) do update
      set status = 'active', charged = true, updated_at = now()
    returning * into v_enrollment;

    insert into public.credit_ledger (user_id, delta, reason, exam_id, enrollment_id)
    values (v_order.user_id, -1, 'enrollment', v_order.exam_id, v_enrollment.id);
  end if;

  return v_order;
end;
$$;
revoke all on function private.fulfill_credit_order(uuid, text, text) from public;

-- ---------------------------------------------------------------------------
-- exam list: created_at and price
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
  v_price integer := (select price_kurus from public.credit_packages where id = 'single');
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

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
      'created_at', v_exam.created_at,
      'price_kurus', v_price,
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
