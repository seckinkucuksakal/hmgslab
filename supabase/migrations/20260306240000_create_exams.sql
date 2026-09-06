-- Phase 5: exam builder schema

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  duration_minutes integer not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exams_duration_positive check (duration_minutes > 0)
);

create index exams_is_active_idx on public.exams (is_active);
create index exams_updated_at_idx on public.exams (updated_at desc);

create trigger exams_set_updated_at
  before update on public.exams
  for each row
  execute function private.set_updated_at();

create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (exam_id, question_id),
  unique (exam_id, sort_order),
  constraint exam_questions_sort_order_positive check (sort_order > 0)
);

create index exam_questions_exam_id_idx on public.exam_questions (exam_id);
create index exam_questions_question_id_idx on public.exam_questions (question_id);

alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;

-- admin-only: exam definitions are not readable by normal users yet (Phase 6+)
create policy "Admins manage exams"
  on public.exams
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Admins manage exam questions"
  on public.exam_questions
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());
