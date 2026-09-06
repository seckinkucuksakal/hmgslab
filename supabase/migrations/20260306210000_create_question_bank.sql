-- Phase 3: HMGS question bank schema

-- ---------------------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index subjects_sort_order_idx on public.subjects (sort_order);
create index subjects_is_active_idx on public.subjects (is_active) where is_active = true;

-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (subject_id, slug),
  unique (id, subject_id)
);

create index topics_subject_id_idx on public.topics (subject_id);
create index topics_sort_order_idx on public.topics (subject_id, sort_order);

-- ---------------------------------------------------------------------------
-- questions
-- ---------------------------------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  topic_id uuid not null,
  question_text text not null,
  explanation text,
  difficulty text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_difficulty_check
    check (difficulty in ('easy', 'medium', 'hard')),
  constraint questions_topic_matches_subject
    foreign key (topic_id, subject_id)
    references public.topics (id, subject_id)
);

create index questions_subject_id_idx on public.questions (subject_id);
create index questions_topic_id_idx on public.questions (topic_id);
create index questions_difficulty_idx on public.questions (difficulty);
create index questions_is_active_idx on public.questions (is_active) where is_active = true;

-- ---------------------------------------------------------------------------
-- question_options
-- ---------------------------------------------------------------------------
create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  option_key text not null,
  option_text text not null,
  is_correct boolean not null default false,
  sort_order integer,
  created_at timestamptz not null default now(),
  unique (question_id, option_key)
);

create index question_options_question_id_idx on public.question_options (question_id);
create index question_options_sort_order_idx on public.question_options (question_id, sort_order);

-- at most one correct option per question
create unique index question_options_one_correct_idx
  on public.question_options (question_id)
  where is_correct = true;

-- ---------------------------------------------------------------------------
-- triggers: updated_at, exactly one correct answer (deferred)
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger questions_set_updated_at
  before update on public.questions
  for each row
  execute function private.set_updated_at();

create or replace function private.check_question_one_correct_answer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_question_id uuid;
  correct_count integer;
begin
  target_question_id := coalesce(new.question_id, old.question_id);

  select count(*)
  into correct_count
  from public.question_options
  where question_id = target_question_id
    and is_correct = true;

  if correct_count <> 1 then
    raise exception
      'Question % must have exactly one correct option (found %)',
      target_question_id,
      correct_count;
  end if;

  return null;
end;
$$;

-- deferred so all options can be inserted in a single transaction
create constraint trigger question_options_one_correct_trg
  after insert or update or delete on public.question_options
  deferrable initially deferred
  for each row
  execute function private.check_question_one_correct_answer();

-- ---------------------------------------------------------------------------
-- safe public view: options without is_correct
-- ---------------------------------------------------------------------------
create view public.question_options_public as
select
  id,
  question_id,
  option_key,
  option_text,
  sort_order,
  created_at
from public.question_options;

-- block direct table access; expose safe view instead
revoke all on public.question_options from anon, authenticated;
grant select on public.question_options_public to authenticated;

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------
alter table public.subjects enable row level security;
alter table public.topics enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;

-- authenticated users: read-only access to active catalogue content
create policy "Authenticated users can read active subjects"
  on public.subjects
  for select
  to authenticated
  using (is_active = true);

create policy "Authenticated users can read active topics"
  on public.topics
  for select
  to authenticated
  using (
    is_active = true
    and exists (
      select 1
      from public.subjects s
      where s.id = topics.subject_id
        and s.is_active = true
    )
  );

create policy "Authenticated users can read active questions"
  on public.questions
  for select
  to authenticated
  using (is_active = true);

-- no select/insert/update/delete policies on question_options for authenticated
-- future admin policies can be added using app_metadata.is_admin or similar

-- ---------------------------------------------------------------------------
-- admin preparation note
-- ---------------------------------------------------------------------------
-- To grant admin write access later, add policies such as:
--   using ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean is true)
-- on subjects, topics, questions, and question_options.
-- Admins should query question_options directly (not the public view).
