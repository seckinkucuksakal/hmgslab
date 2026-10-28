# HMGSlab operations guide

Status of each item is stated explicitly. "Verified" means exercised in this
repository's local checks; it does **not** mean verified in production.

## 1. Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Supabase project URL (public) |
| `VITE_SUPABASE_ANON_KEY` | yes | Public anon key; access is bounded by RLS |
| `VITE_SITE_URL` | yes | Production origin for auth email redirects |
| `VITE_ERROR_REPORT_URL` | no | Endpoint receiving redacted client error reports. Empty = reporting off |
| `VITE_APP_VERSION` | no | Release id attached to error reports |

All `VITE_*` values are inlined into the public bundle. Never put a service-role
key, payment secret or webhook secret in a `VITE_*` variable. Payment provider
secrets belong in server-side runtime configuration (Supabase Edge Function
secrets), once a provider is chosen.

## 2. Setup and release steps

1. `cp .env.example .env`, fill values, `npm install`.
2. Apply migrations in filename order (`supabase db push` or the SQL editor).
   **Take a manual backup first** (section 4). Recent migrations and their
   notable effects:
   - `20260308…standard_subject_catalog` – fixed 19 subjects; legacy subjects need manual classification.
   - `20260309…result_privacy` – revokes direct reads of result columns on `exam_attempts`.
   - `20260310…exam_content_freeze` – publish validation + frozen content; freezes already-published exams.
   - `20260311…listing_pagination` – paged results, batched exam list.
   - `20260312…billing_foundation` – entitlement model; **enforcement is off** until `billing_settings.enforced` is set.
   - `20260313…ranking_single_pass` – ranking performance.
3. `npm run build` and deploy `dist/` (SPA fallback required, see README).
4. Dashboard settings listed in README ("Supabase Dashboard settings").

After migrating, confirm in SQL:
`select has_column_privilege('authenticated','public.exam_attempts','score','select');` → `false`.

## 3. Local checks

```bash
npm run build && npm run lint
npm run check:db        # applies all migrations to in-memory Postgres (PGlite) and runs ~110 checks
node scripts/db-checks/bench.mjs 3000 60   # micro-benchmark, see limits below
```

`check:db` covers: result embargo and leaderboard privacy, column grants,
atomic exam saves, frozen content and lifecycle locks, pagination, search
semantics, entitlement enforcement and history lock. It runs on PGlite with
stubbed Supabase auth: it validates SQL/RLS/grant logic, not PostgREST, real
Auth, or concurrency.

### Load measurements (single connection, PGlite, laptop)
At 3000 finished attempts: `get_exam_leaderboard` ≈ 7 ms, `get_attempt_ranking`
≈ 6 ms, `save_attempt_answer` ≈ 1 ms, `start_exam_attempt` ≈ 4 ms per call
(after optimisation; before: 12 ms / 11 ms for the ranking calls). These are
per-call costs in one process. **They are not a capacity claim**: concurrent
users, connection limits, network and Supabase instance size were not measured.
Before launch run a real concurrent test against a staging Supabase project
(e.g. k6 or pgbench against the RPCs with N simultaneous sessions).

## 4. Backup and restore

Not verified here: no Postgres/Docker/Supabase CLI was available in the
development environment, so restore was never executed. Procedure to rehearse on
a **scratch project** before relying on it:

1. Backup (before every risky migration): Dashboard → Database → Backups, or
   `pg_dump "$DATABASE_URL" --format=custom --no-owner -f hmgslab-$(date +%F).dump`
   (use the pooled/direct connection string; store the dump encrypted, it holds user data).
2. Restore rehearsal: create a new empty Supabase project, then
   `pg_restore --no-owner --clean --if-exists -d "$SCRATCH_DATABASE_URL" hmgslab-….dump`.
3. Verify: row counts for `profiles`, `exam_attempts`, `attempt_answers`; run
   `npm run check:db` logic spot checks (sections 2–3) against the restored copy;
   sign in with a test account.
4. Production restore is whole-database and replaces current data. Prefer a
   corrective migration for logic mistakes. Point-in-time recovery needs the
   paid add-on (see README "Backups and recovery").

## 5. Error tracking and privacy

`src/lib/error-reporting.ts` sends (only when `VITE_ERROR_REPORT_URL` is set) a
redacted message and stack (emails, UUIDs, tokens, query strings and long
numbers removed), the route *pattern* (`/sonuclar/:id`), app version and time.
It never sends user ids, names, answers, question text, storage contents or
cookies, and caps reports per session. An `ErrorBoundary` shows a reload screen;
saved exam answers survive a reload. The collector endpoint is operator-provided
and not included in this repository. Redaction was unit-checked locally; no real
collector was exercised.

## 6. Billing status

No payment provider is connected and none has been chosen. Implemented and
verified locally: provider-neutral entitlement tables, plans (`monthly`,
`season`, no prices stored), server-side enforcement (free allowance of
`free_exam_limit` distinct exams, active entitlement required beyond it),
history lock for lapsed paying users, `get_my_access()` shown on the profile
page, manual `admin_grant_entitlement` / `admin_revoke_entitlement`.
`billing_settings.enforced` is `false`: **turning it on locks free users after
their free exams and there is no way to pay yet.**

Pending (needs decisions or credentials, not built, not tested):
provider selection, final prices and season length, checkout creation,
signed-webhook handling with idempotency and out-of-order protection
(`entitlements(provider, provider_ref)` is the unique idempotency key reserved
for this), refunds, failed-payment and renewal flows, provider test-mode
verification, invoicing/legal texts.

## 7. Pre-launch checklist

- [ ] Choose payment provider and final prices; build and test checkout + webhook in the provider's test mode.
- [ ] Apply migrations to staging, run `npm run check:db`, then manual smoke test of register → exam → submit → results with real Supabase.
- [ ] Real concurrent load test on staging.
- [ ] Backup + restore rehearsal on a scratch project.
- [ ] Choose an error-collector endpoint (or leave reporting off).
- [ ] Classify legacy subjects/questions (Phase 0 report) and review `question_options_public` exposure.
- [ ] Review legal pages, cookie text and KVKK wording with counsel.
