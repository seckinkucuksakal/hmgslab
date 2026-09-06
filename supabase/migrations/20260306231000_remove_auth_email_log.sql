-- Remove dev auth hook artifacts (email handled via dashboard settings instead)

drop table if exists public.auth_email_log;
