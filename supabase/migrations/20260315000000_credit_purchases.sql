-- Credit purchases (payment provider not connected yet)
--
-- * Package prices (product owner, 2026-11-08): 1 deneme 149,90 TL,
--   10 deneme 1.350,00 TL. Amounts are stored in kuruş.
-- * A purchase is a credit_orders row: the user creates a 'pending' order,
--   which snapshots the package's credits and price. Credits are granted only
--   when the order is fulfilled.
-- * private.fulfill_credit_order() is the single place that marks an order paid
--   and grants credits. It is idempotent so a payment-provider webhook can call
--   it repeatedly; until a provider is connected, admins fulfil orders manually
--   (e.g. bank transfer) with admin_mark_credit_order_paid().

-- ---------------------------------------------------------------------------
-- prices
-- ---------------------------------------------------------------------------
alter table public.credit_packages
  add column price_kurus integer not null default 0 check (price_kurus >= 0),
  add column currency text not null default 'TRY' check (currency = 'TRY');

update public.credit_packages set price_kurus = 14990 where id = 'single';
update public.credit_packages set price_kurus = 135000 where id = 'pack10';

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table public.credit_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  package_id text not null references public.credit_packages (id),
  -- snapshot at order time: later price changes never affect an open order
  credits integer not null check (credits > 0),
  amount_kurus integer not null check (amount_kurus >= 0),
  currency text not null default 'TRY',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'canceled', 'failed')),
  provider text,
  provider_ref text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  canceled_at timestamptz,
  unique (provider, provider_ref)
);
create index credit_orders_user_idx on public.credit_orders (user_id, created_at desc);
alter table public.credit_orders enable row level security;
create policy "Users read own credit orders"
  on public.credit_orders for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.credit_orders from anon, authenticated;

alter table public.credit_ledger
  add column order_id uuid references public.credit_orders (id) on delete set null;
create unique index credit_ledger_one_purchase_per_order
  on public.credit_ledger (order_id) where order_id is not null;

-- ---------------------------------------------------------------------------
-- fulfilment (provider webhook or admin)
-- ---------------------------------------------------------------------------
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
begin
  select * into v_order from public.credit_orders where id = p_order_id for update;
  if not found then
    raise exception 'Sipariş bulunamadı';
  end if;

  -- idempotent: a repeated confirmation changes nothing
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

  insert into public.credit_ledger (user_id, delta, reason, package_id, order_id, note)
  values (v_order.user_id, v_order.credits, 'purchase', v_order.package_id, v_order.id, null);

  return v_order;
end;
$$;
revoke all on function private.fulfill_credit_order(uuid, text, text) from public;

-- ---------------------------------------------------------------------------
-- user RPCs
-- ---------------------------------------------------------------------------
create or replace function private.credit_order_json(p_order public.credit_orders)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_order.id,
    'package_id', p_order.package_id,
    'package_name', (select name from public.credit_packages where id = p_order.package_id),
    'credits', p_order.credits,
    'amount_kurus', p_order.amount_kurus,
    'currency', p_order.currency,
    'status', p_order.status,
    'created_at', p_order.created_at,
    'paid_at', p_order.paid_at
  )
$$;
revoke all on function private.credit_order_json(public.credit_orders) from public;

create or replace function public.create_credit_order(p_package_id text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pkg public.credit_packages;
  v_order public.credit_orders;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_pkg from public.credit_packages where id = p_package_id and is_active;
  if not found then
    raise exception 'Paket bulunamadı';
  end if;

  perform private.lock_user_credits(v_uid);

  -- reuse an open order for the same package and price instead of piling up
  select * into v_order
  from public.credit_orders
  where user_id = v_uid
    and package_id = v_pkg.id
    and status = 'pending'
    and amount_kurus = v_pkg.price_kurus
    and credits = v_pkg.credits
  order by created_at desc
  limit 1;

  if not found then
    insert into public.credit_orders (user_id, package_id, credits, amount_kurus, currency)
    values (v_uid, v_pkg.id, v_pkg.credits, v_pkg.price_kurus, v_pkg.currency)
    returning * into v_order;
  end if;

  return private.credit_order_json(v_order);
end;
$$;
revoke all on function public.create_credit_order(text) from public, anon;
grant execute on function public.create_credit_order(text) to authenticated;

create or replace function public.cancel_credit_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  update public.credit_orders
  set status = 'canceled', canceled_at = now()
  where id = p_order_id and user_id = auth.uid() and status = 'pending';

  if not found then
    raise exception 'İptal edilebilecek sipariş bulunamadı';
  end if;
end;
$$;
revoke all on function public.cancel_credit_order(uuid) from public, anon;
grant execute on function public.cancel_credit_order(uuid) to authenticated;

create or replace function public.get_my_credit_orders()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  return coalesce((
    select jsonb_agg(private.credit_order_json(o) order by o.created_at desc)
    from (
      select * from public.credit_orders
      where user_id = auth.uid()
      order by created_at desc
      limit 20
    ) o
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_my_credit_orders() from public, anon;
grant execute on function public.get_my_credit_orders() to authenticated;

-- ---------------------------------------------------------------------------
-- admin: manual fulfilment until a provider is connected
-- ---------------------------------------------------------------------------
create or replace function public.admin_mark_credit_order_paid(
  p_order_id uuid,
  p_reference text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.credit_orders;
begin
  if not private.is_admin() then
    raise exception 'Unauthorized';
  end if;

  v_order := private.fulfill_credit_order(
    p_order_id,
    'manual',
    coalesce(nullif(btrim(p_reference), ''), p_order_id::text)
  );

  return private.credit_order_json(v_order);
end;
$$;
revoke all on function public.admin_mark_credit_order_paid(uuid, text) from public, anon;
grant execute on function public.admin_mark_credit_order_paid(uuid, text) to authenticated;
