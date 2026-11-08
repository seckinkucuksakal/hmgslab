-- 5 deneme package (product owner, 2026-11-08): priced at exactly five single
-- credits (5 x 149,90 TL = 749,50 TL), listed between the 1 and 10 packs.

insert into public.credit_packages (id, name, credits, price_kurus, sort_order)
values ('pack5', '5 deneme', 5, 5 * 14990, 2)
on conflict (id) do update
  set name = excluded.name,
      credits = excluded.credits,
      price_kurus = excluded.price_kurus,
      sort_order = excluded.sort_order,
      is_active = true;

update public.credit_packages set sort_order = 3 where id = 'pack10';
