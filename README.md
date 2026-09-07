# HMGSlab

Turkish online exam platform for law graduates.

## Stack

- React + TypeScript
- Vite
- Tailwind CSS
- Supabase (Postgres, Auth, RLS, RPC)

## Local setup

1. Copy `.env.example` to `.env`
2. Fill in your Supabase credentials
3. Install dependencies: `npm install`
4. Start the dev server: `npm run dev`

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type check (`tsc -b`) plus production build |
| `npm run lint` | oxlint |
| `npm run preview` | Serve the production build locally |

---

## Production configuration

### Environment variables

Only these two variables are needed, and both are public by design. The anon
key is a client credential whose reach is bounded entirely by Row Level
Security, so shipping it in the bundle is expected.

| Variable | Example | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Project REST URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Public anon key only |

Set both in the hosting provider's build environment (Vercel, Netlify,
Cloudflare Pages, etc.). Vite inlines every `VITE_*` value into the JavaScript
bundle at build time, so **never** add `SUPABASE_SERVICE_ROLE_KEY` or any other
secret to a `VITE_*` variable. This project has no server-side runtime and
needs no service-role key at all.

### Supabase Dashboard settings (manual)

These cannot be applied from migrations and must be set once per environment.

1. **Authentication → URL Configuration**
   - *Site URL*: the production origin, e.g. `https://hmgSlab.com`
   - *Redirect URLs*: add every origin that runs the app:
     - `https://hmgSlab.com/**`
     - `http://localhost:5173/**` (local development only)

   Password reset uses `window.location.origin + '/reset-password'`, so no
   localhost URL is hard-coded anywhere; the redirect is derived from wherever
   the app is actually served. Both `/reset-password` and the email
   confirmation landing route are covered by the wildcard entries above.

2. **Authentication → Providers → Email**
   - Enable *Confirm email* so new accounts must verify ownership.
   - Configure a custom SMTP sender before launch. The built-in Supabase SMTP
     is heavily rate limited and is not intended for production traffic.

3. **Authentication → Rate limits**
   - Keep the default per-IP limits for sign-in, sign-up, OTP and password
     recovery. These already cover credential stuffing, registration spam and
     password-reset abuse; see "Abuse vectors" below.

4. **Authentication → Policies**
   - Minimum password length 8 (matches the client-side `minLength`).
   - Enable *Leaked password protection*. It is off by default and checks new
     passwords against HaveIBeenPwned, which is the cheapest available defence
     against credential stuffing.

5. **Project Settings → Database → Backups**
   - Verify the backup schedule for the current plan (see below).

### Granting admin access

Admin is a column on `public.profiles` and is deliberately **not** settable
from the app. `private.prevent_role_escalation` is a `BEFORE UPDATE` trigger
that rejects any `role` change unless the caller is already an admin, so
editing your own profile row, forging client state or calling PostgREST
directly all fail.

To promote a user, run this from the Supabase SQL editor (a trusted,
service-role session):

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'admin@example.com');
```

### Deploying

The app is a static SPA. Build with `npm run build` and serve `dist/`.
Configure the host to rewrite unknown paths to `/index.html` so client-side
routes such as `/sonuclar/:id` survive a hard refresh.

---

## Database

### Migrations

All schema lives in `supabase/migrations/`, applied in filename order:

| Migration | Contents |
| --- | --- |
| `20260306200000_create_profiles` | `profiles`, signup trigger |
| `20260306210000_create_question_bank` | `subjects`, `topics`, `questions`, `question_options` |
| `20260306210001_seed_question_bank` | Seed catalogue data |
| `20260306220000_admin_role_and_policies` | `private.is_admin`, role-escalation trigger, admin policies |
| `20260306230000_auth_email_log` | Dev-only email log |
| `20260306231000_remove_auth_email_log` | Drops the dev email log again |
| `20260306240000_create_exams` | `exams`, `exam_questions` |
| `20260306250000_create_exam_attempts` | Attempt engine, scoring, timer |
| `20260306260000_attempt_review_snapshots` | Result snapshots and review RPC |
| `20260306270000_exam_ranking` | Ranking and leaderboard RPCs |
| `20260306280000_user_performance_analytics` | Topic snapshots, analytics RPC |
| `20260306290000_phase11_security_hardening` | Answer-key lockdown, grant cleanup |

Applying them in order against an empty project reproduces the current schema.
There is no undocumented manual SQL; the only steps outside migrations are the
Dashboard settings listed above and the admin promotion statement.

### Security model

- **RLS is enabled on every table in `public`.** Students reach their own rows
  only; everything cross-user goes through a `SECURITY DEFINER` RPC that
  derives identity from `auth.uid()` and never from a client-supplied id.
- **Answer keys are not reachable by clients.** `public.questions` has no
  student-facing policy (only `Admins manage questions`), so `explanation` is
  unreadable before submission. `question_options.is_correct` is likewise
  never exposed. The snapshot columns on `attempt_questions` that hold the
  correct option are excluded from the `authenticated` column grants, so only
  the definer functions can read them.
- **Scoring is server-only.** `anon` and `authenticated` hold no
  `INSERT`/`UPDATE`/`DELETE` grant on `exam_attempts`, `attempt_questions` or
  `attempt_answers`. Scores are written exclusively by
  `private.score_exam_attempt`.
- **The timer is server-authoritative.** Remaining time is computed from
  `started_at + duration_minutes_snapshot`; the client clock is display only.
- **The leaderboard exposes no private data.** It returns rank, display name
  and answer counts, clamps the requested page size to 100 server-side, and
  renders opted-out users as "Gizli Kullanıcı".

Students read exam content through `public.get_exam_session(attempt_id)`,
which returns question text, option text and the caller's own saved answers
for their own in-progress attempt, and nothing else.

### Abuse vectors

Handled by Supabase's built-in per-IP auth rate limits: repeated login
attempts, registration spam, password-reset abuse.

Handled in the database: `start_exam_attempt` reuses an existing in-progress
attempt instead of creating duplicates, so exam-start spam cannot fan out.
`save_attempt_answer` upserts a single row per question and rejects writes to
finalised attempts, so rapid answer mutation is bounded by the question count.
The analytics and ranking RPCs are per-user aggregations backed by dedicated
partial indexes.

No external rate-limiting service is warranted at this stage. If abuse does
appear after launch, the next step in order of cost would be enabling
Cloudflare rate limiting in front of the static host, then a per-user
throttle table checked inside the hot RPCs. Neither is needed today.

### Backups and recovery

Rely on Supabase's managed backups rather than custom tooling.

- **Free / Pro**: daily automated backups with 7-day retention. Verify the
  schedule under *Project Settings → Database → Backups* and download a manual
  backup before any risky migration.
- **Point-in-time recovery** is a paid add-on and is the right upgrade once
  real user attempt data exists, since it shortens the worst-case data loss
  window from ~24 hours to minutes.
- **Schema versioning** is the migration folder above; it is the recovery path
  for structural mistakes and should stay committed to Git.
- **Recovery expectation**: restoring a backup replaces the whole database, so
  treat it as a last resort. For an accidental data change, prefer replaying a
  corrective migration.
