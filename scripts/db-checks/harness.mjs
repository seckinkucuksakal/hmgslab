// Applies every migration to an in-memory Postgres (PGlite) with minimal
// Supabase stubs (auth schema, roles, auth.uid()). It exercises SQL logic,
// RLS and grants; it is NOT a substitute for testing against a real Supabase
// project (no PostgREST, no real Auth, single connection / no concurrency).
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../supabase/migrations',
)

export const U = {
  adm: '00000000-0000-4000-8000-00000000000a',
  a: '00000000-0000-4000-8000-0000000000a1',
  b: '00000000-0000-4000-8000-0000000000b1',
  c: '00000000-0000-4000-8000-0000000000c1',
}

let failures = 0
export const failureCount = () => failures

export async function setupDb() {
  const db = new PGlite()
  await db.exec(`create schema auth; create role anon nologin; create role authenticated nologin; create role service_role nologin;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create schema private; alter default privileges in schema public grant all on tables to authenticated; alter default privileges in schema public grant all on sequences to authenticated; grant usage on schema public, private, auth to anon, authenticated;`)

  const files = fs.readdirSync(migrationsDir).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort()
  for (const f of files) await db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'))

  for (const id of Object.values(U)) {
    await db.exec(`insert into auth.users (id,email) values ('${id}','${id}@example.test')`)
  }
  await db.exec(`alter table profiles disable trigger profiles_prevent_role_escalation;
    update profiles set role='admin' where id='${U.adm}';
    update profiles set display_name='Ayşe' where id='${U.a}';
    update profiles set display_name='Berk', show_in_leaderboard=false where id='${U.b}';
    update profiles set display_name='Cem' where id='${U.c}';
    alter table profiles enable trigger profiles_prevent_role_escalation`)

  const sql = (s) => db.exec(s)
  const as = async (who, fn) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${U[who]}',false)`)
    try { return await fn() } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false)`)
    }
  }
  const q = (who, text) => as(who, async () => {
    try { return { ok: true, rows: (await db.query(text)).rows } }
    catch (e) { return { ok: false, err: e.message } }
  })
  const chk = (name, cond, extra = '') => {
    if (!cond) failures++
    console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra)
  }
  const opts = (correct) =>
    `'${JSON.stringify(['A', 'B', 'C', 'D', 'E'].map((k, i) => ({ option_key: k, option_text: 'opt ' + k, is_correct: k === correct, sort_order: i + 1 })))}'::jsonb`
  const std = (await db.query(`select id from subjects where slug='ceza-hukuku'`)).rows[0].id
  const topic = (await db.query(`select id from topics where subject_id='${std}' limit 1`)).rows[0].id

  return { db, U, sql, as, q, tryq: q, chk, opts, std, topic }
}
