-- Phase 0: fixed 19-subject catalogue (see PROJECT_PLAN.md)
--
-- * Adds subjects.is_standard and seeds/adopts the 19 standard subjects.
-- * Existing subjects whose slug or name exactly matches a standard subject are
--   adopted in place (same id, so topics/questions/snapshots keep pointing at it).
-- * Every other subject (e.g. the sample "Anayasa Hukuku") is left untouched as a
--   non-standard legacy subject, pushed after the standard ones in sort order.
--   Nothing is renamed, merged, deleted or reclassified automatically.
-- * New/re-pointed questions may only reference standard subjects; admins can no
--   longer insert/delete subjects or edit catalogue fields through the API.

-- ---------------------------------------------------------------------------
-- column + constraints
-- ---------------------------------------------------------------------------
alter table public.subjects
  add column is_standard boolean not null default false;

alter table public.subjects
  add constraint subjects_standard_sort_order_check
  check (not is_standard or sort_order between 1 and 19);

create unique index subjects_standard_sort_order_key
  on public.subjects (sort_order)
  where is_standard;

-- ---------------------------------------------------------------------------
-- adopt / seed the 19 standard subjects
-- ---------------------------------------------------------------------------
do $$
declare
  std record;
  v_id uuid;
  v_by_slug uuid;
  v_by_name uuid;
begin
  -- park every existing subject after the standard range first, so the partial
  -- unique index on standard sort orders can never collide while adopting
  update public.subjects
  set sort_order = 1000 + coalesce(sort_order, 0);

  for std in
    select *
    from (values
      (1,  'Anayasa Yargısı',                'anayasa-yargisi'),
      (2,  'İdare Hukuku',                   'idare-hukuku'),
      (3,  'İdari Yargılama Usulü',          'idari-yargilama-usulu'),
      (4,  'Medeni Hukuk',                   'medeni-hukuk'),
      (5,  'Borçlar Hukuku',                 'borclar-hukuku'),
      (6,  'Ticaret Hukuku',                 'ticaret-hukuku'),
      (7,  'Hukuk Yargılama Usulü',          'hukuk-yargilama-usulu'),
      (8,  'İcra ve İflas Hukuku',           'icra-ve-iflas-hukuku'),
      (9,  'Ceza Hukuku',                    'ceza-hukuku'),
      (10, 'Ceza Yargılama Usulü',           'ceza-yargilama-usulu'),
      (11, 'İş ve Sosyal Güvenlik Hukuku',   'is-ve-sosyal-guvenlik-hukuku'),
      (12, 'Vergi Hukuku',                   'vergi-hukuku'),
      (13, 'Vergi Usul Hukuku',              'vergi-usul-hukuku'),
      (14, 'Avukatlık Hukuku',               'avukatlik-hukuku'),
      (15, 'Hukuk Felsefesi ve Sosyolojisi', 'hukuk-felsefesi-ve-sosyolojisi'),
      (16, 'Türk Hukuk Tarihi',              'turk-hukuk-tarihi'),
      (17, 'Milletlerarası Hukuk',           'milletlerarasi-hukuk'),
      (18, 'Milletlerarası Özel Hukuk',      'milletlerarasi-ozel-hukuk'),
      (19, 'Genel Kamu Hukuku',              'genel-kamu-hukuku')
    ) as t(sort_order, name, slug)
    order by sort_order
  loop
    select id into v_by_slug from public.subjects where slug = std.slug;
    select id into v_by_name
    from public.subjects
    where lower(btrim(name)) = lower(btrim(std.name))
    limit 1;

    if v_by_slug is not null and v_by_name is not null and v_by_slug <> v_by_name then
      raise exception
        'Ambiguous existing subjects for "%": slug matches %, name matches %. Resolve manually.',
        std.name, v_by_slug, v_by_name;
    end if;

    v_id := coalesce(v_by_slug, v_by_name);

    if v_id is null then
      insert into public.subjects (id, name, slug, sort_order, is_active, is_standard)
      values (
        ('a2000000-0000-4000-8000-' || lpad(std.sort_order::text, 12, '0'))::uuid,
        std.name, std.slug, std.sort_order, true, true
      );
    else
      update public.subjects
      set name = std.name,
          slug = std.slug,
          sort_order = std.sort_order,
          is_active = true,
          is_standard = true
      where id = v_id;
    end if;
  end loop;

  -- keep the legacy order stable but sorted after the standard subjects
  update public.subjects
  set sort_order = sort_order - 1000 + 100
  where not is_standard and sort_order >= 1000;
end;
$$;

-- ---------------------------------------------------------------------------
-- catalogue protection (API requests only: auth.uid() is null for migrations
-- and trusted service-role SQL sessions)
-- ---------------------------------------------------------------------------
create or replace function private.protect_subject_catalog()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Subjects cannot be created: the subject catalogue is fixed';
  elsif tg_op = 'DELETE' then
    raise exception 'Subjects cannot be deleted: the subject catalogue is fixed';
  end if;

  if new.id is distinct from old.id
     or new.name is distinct from old.name
     or new.slug is distinct from old.slug
     or new.sort_order is distinct from old.sort_order
     or new.is_standard is distinct from old.is_standard then
    raise exception 'Subject catalogue fields are read-only';
  end if;

  if old.is_standard and new.is_active = false then
    raise exception 'Standard subjects cannot be deactivated';
  end if;

  return new;
end;
$$;

create trigger subjects_protect_catalog
  before insert or update or delete on public.subjects
  for each row
  execute function private.protect_subject_catalog();

-- admins may read and update (is_active of legacy subjects only, per trigger);
-- insert/delete policies are intentionally absent
drop policy "Admins manage subjects" on public.subjects;

create policy "Admins read subjects"
  on public.subjects
  for select
  to authenticated
  using (private.is_admin());

create policy "Admins update subjects"
  on public.subjects
  for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

revoke insert, delete on public.subjects from authenticated, anon;

-- ---------------------------------------------------------------------------
-- questions: only standard subjects, topic must belong to the subject
-- ---------------------------------------------------------------------------
create or replace function private.check_question_subject_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.subject_id is distinct from old.subject_id then
    if not exists (
      select 1
      from public.subjects s
      where s.id = new.subject_id
        and s.is_standard
    ) then
      raise exception 'Subject is outside the standard catalogue';
    end if;
  end if;

  if tg_op = 'INSERT'
     or new.subject_id is distinct from old.subject_id
     or new.topic_id is distinct from old.topic_id then
    if not exists (
      select 1
      from public.topics t
      where t.id = new.topic_id
        and t.subject_id = new.subject_id
    ) then
      raise exception 'Topic does not belong to the selected subject';
    end if;
  end if;

  return new;
end;
$$;

create trigger questions_check_subject_scope
  before insert or update of subject_id, topic_id on public.questions
  for each row
  execute function private.check_question_subject_scope();

-- ---------------------------------------------------------------------------
-- admin review of legacy (non-standard) subjects awaiting manual classification
-- ---------------------------------------------------------------------------
create or replace function public.admin_legacy_subject_report()
returns table (
  subject_id uuid,
  subject_name text,
  topic_count bigint,
  question_count bigint,
  exam_question_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    s.id,
    s.name,
    (select count(*) from public.topics t where t.subject_id = s.id),
    (select count(*) from public.questions q where q.subject_id = s.id),
    (
      select count(*)
      from public.exam_questions eq
      join public.questions q on q.id = eq.question_id
      where q.subject_id = s.id
    )
  from public.subjects s
  where not s.is_standard
  order by s.sort_order, s.name;
end;
$$;

revoke all on function public.admin_legacy_subject_report() from public, anon;
grant execute on function public.admin_legacy_subject_report() to authenticated;
