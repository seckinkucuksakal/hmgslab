-- Dev-only auth email log (used by send-email hook when SMTP is unavailable)
-- Service role writes; no RLS policies for normal users.

create table public.auth_email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text not null,
  action_type text not null,
  otp_token text,
  verify_url text,
  created_at timestamptz not null default now()
);

alter table public.auth_email_log enable row level security;

-- no policies: authenticated/anon cannot read auth emails

create index auth_email_log_created_at_idx on public.auth_email_log (created_at desc);
