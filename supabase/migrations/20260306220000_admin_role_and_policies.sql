-- Phase 4: admin role and RLS policies

-- ---------------------------------------------------------------------------
-- profiles.role
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column role text not null default 'user';

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin'));

-- prevent non-admins from changing their own role
create or replace function private.prevent_role_escalation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    if not exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'admin'
    ) then
      raise exception 'Unauthorized role change';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row
  execute function private.prevent_role_escalation();

-- helper for policies
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- admin RLS policies
-- ---------------------------------------------------------------------------

-- subjects
create policy "Admins manage subjects"
  on public.subjects
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- topics
create policy "Admins manage topics"
  on public.topics
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- questions
create policy "Admins manage questions"
  on public.questions
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- question_options: grant table access, restrict via RLS
grant select, insert, update, delete on public.question_options to authenticated;

create policy "Admins manage question options"
  on public.question_options
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ---------------------------------------------------------------------------
-- admin RPC: create question with options (single transaction)
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_question(
  p_subject_id uuid,
  p_topic_id uuid,
  p_question_text text,
  p_explanation text,
  p_difficulty text,
  p_is_active boolean,
  p_options jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  opt jsonb;
  correct_count integer := 0;
begin
  if not private.is_admin() then
    raise exception 'Unauthorized';
  end if;

  if jsonb_array_length(p_options) <> 5 then
    raise exception 'Exactly 5 options required';
  end if;

  for opt in select * from jsonb_array_elements(p_options)
  loop
    if coalesce((opt ->> 'is_correct')::boolean, false) then
      correct_count := correct_count + 1;
    end if;
  end loop;

  if correct_count <> 1 then
    raise exception 'Exactly one correct option required';
  end if;

  insert into public.questions (
    subject_id,
    topic_id,
    question_text,
    explanation,
    difficulty,
    is_active
  )
  values (
    p_subject_id,
    p_topic_id,
    p_question_text,
    p_explanation,
    p_difficulty,
    p_is_active
  )
  returning id into new_id;

  for opt in select * from jsonb_array_elements(p_options)
  loop
    insert into public.question_options (
      question_id,
      option_key,
      option_text,
      is_correct,
      sort_order
    )
    values (
      new_id,
      opt ->> 'option_key',
      opt ->> 'option_text',
      coalesce((opt ->> 'is_correct')::boolean, false),
      (opt ->> 'sort_order')::integer
    );
  end loop;

  return new_id;
end;
$$;

revoke all on function public.admin_create_question(uuid, uuid, text, text, text, boolean, jsonb) from public;
grant execute on function public.admin_create_question(uuid, uuid, text, text, text, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- admin RPC: update question with options (single transaction)
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_question(
  p_question_id uuid,
  p_subject_id uuid,
  p_topic_id uuid,
  p_question_text text,
  p_explanation text,
  p_difficulty text,
  p_is_active boolean,
  p_options jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  opt jsonb;
  correct_count integer := 0;
  option_keys text[] := array[]::text[];
begin
  if not private.is_admin() then
    raise exception 'Unauthorized';
  end if;

  if jsonb_array_length(p_options) <> 5 then
    raise exception 'Exactly 5 options required';
  end if;

  for opt in select * from jsonb_array_elements(p_options)
  loop
    if coalesce((opt ->> 'is_correct')::boolean, false) then
      correct_count := correct_count + 1;
    end if;
    option_keys := array_append(option_keys, opt ->> 'option_key');
  end loop;

  if correct_count <> 1 then
    raise exception 'Exactly one correct option required';
  end if;

  update public.questions
  set
    subject_id = p_subject_id,
    topic_id = p_topic_id,
    question_text = p_question_text,
    explanation = p_explanation,
    difficulty = p_difficulty,
    is_active = p_is_active
  where id = p_question_id;

  if not found then
    raise exception 'Question not found';
  end if;

  delete from public.question_options
  where question_id = p_question_id
    and option_key <> all (option_keys);

  for opt in select * from jsonb_array_elements(p_options)
  loop
    insert into public.question_options (
      question_id,
      option_key,
      option_text,
      is_correct,
      sort_order
    )
    values (
      p_question_id,
      opt ->> 'option_key',
      opt ->> 'option_text',
      coalesce((opt ->> 'is_correct')::boolean, false),
      (opt ->> 'sort_order')::integer
    )
    on conflict (question_id, option_key)
    do update set
      option_text = excluded.option_text,
      is_correct = excluded.is_correct,
      sort_order = excluded.sort_order;
  end loop;
end;
$$;

revoke all on function public.admin_update_question(uuid, uuid, uuid, text, text, text, boolean, jsonb) from public;
grant execute on function public.admin_update_question(uuid, uuid, uuid, text, text, text, boolean, jsonb) to authenticated;
