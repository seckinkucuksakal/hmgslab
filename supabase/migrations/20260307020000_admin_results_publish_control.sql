-- Admin control: custom results publish time + immediate publish

alter table public.exams
  add column if not exists results_publish_at_override boolean not null default false;

create or replace function private.apply_scheduled_exam_times()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.exam_mode = 'practice' then
    new.scheduled_start_at := null;
    new.lobby_open_at := null;
    new.late_entry_until := null;
    new.scheduled_end_at := null;
    new.results_publish_at := null;
    new.results_publish_at_override := false;
    return new;
  end if;

  if new.scheduled_start_at is null then
    raise exception 'Scheduled exams require scheduled_start_at';
  end if;

  if new.duration_minutes <= 0 then
    raise exception 'Duration must be positive';
  end if;

  new.lobby_open_at :=
    new.scheduled_start_at - (new.lobby_offset_minutes * interval '1 minute');
  new.late_entry_until :=
    new.scheduled_start_at + (new.late_entry_minutes * interval '1 minute');
  new.scheduled_end_at :=
    new.scheduled_start_at + (new.duration_minutes * interval '1 minute');

  if coalesce(new.results_publish_at_override, false) then
    if new.results_publish_at is null then
      raise exception 'Custom results publish time is required';
    end if;
  else
    new.results_publish_at :=
      new.scheduled_end_at + (new.results_delay_minutes * interval '1 minute');
  end if;

  if new.lobby_open_at >= new.scheduled_start_at then
    raise exception 'Lobby must open before scheduled start';
  end if;

  if new.late_entry_until > new.scheduled_end_at then
    raise exception 'Late entry window cannot extend past exam end';
  end if;

  if new.results_publish_at < new.scheduled_end_at
    and not coalesce(new.results_publish_at_override, false)
  then
    raise exception 'Results cannot publish before exam ends';
  end if;

  return new;
end;
$$;

create or replace function public.admin_publish_exam_results(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.exams%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Unauthorized';
  end if;

  update public.exams
  set
    results_publish_at = now(),
    results_publish_at_override = true
  where id = p_exam_id
    and exam_mode = 'scheduled'
  returning * into v_row;

  if not found then
    raise exception 'Scheduled exam not found';
  end if;

  return jsonb_build_object(
    'exam_id', v_row.id,
    'results_publish_at', v_row.results_publish_at,
    'results_published', true
  );
end;
$$;

revoke all on function public.admin_publish_exam_results(uuid) from public, anon;
grant execute on function public.admin_publish_exam_results(uuid) to authenticated;
