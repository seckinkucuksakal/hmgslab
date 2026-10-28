// Single-connection micro-benchmark of the exam hot paths on PGlite (WASM
// Postgres). It measures per-call cost of the SQL logic as data grows. It does
// NOT measure concurrency, network, PostgREST or Supabase hardware, so it
// cannot support any capacity claim. Usage: node scripts/db-checks/bench.mjs [users] [questions]
import { setupDb, U } from './harness.mjs'

const USERS = Number(process.argv[2] ?? 300)
const QUESTIONS = Number(process.argv[3] ?? 60)
const { db, sql, q, opts, std, topic } = await setupDb()

const ms = async (label, fn, n = 1) => {
  const t = performance.now()
  for (let i = 0; i < n; i++) await fn(i)
  const total = performance.now() - t
  console.log(`${label.padEnd(46)} ${(total / n).toFixed(1).padStart(8)} ms/call  (n=${n})`)
}

const qids = []
for (let i = 0; i < QUESTIONS; i++) {
  qids.push((await q('adm', `select admin_create_question('${std}','${topic}','Q${i}','e','easy',true,${opts('A')}) id`)).rows[0].id)
}
const exam = (await q('adm', `select admin_save_exam(null,'${JSON.stringify({ title: 'Bench', duration_minutes: 120, is_active: true })}'::jsonb,array[${qids.map((x) => `'${x}'`).join(',')}]::uuid[]) id`)).rows[0].id

// bulk users
await sql(`alter table profiles disable trigger user; alter table auth.users disable trigger user`).catch(() => {})
await sql(`insert into auth.users (id,email) select gen_random_uuid(), 'bench'||g||'@example.test' from generate_series(1,${USERS}) g`)
const users = (await db.query(`select id from auth.users where email like 'bench%' order by email`)).rows.map((r) => r.id)
console.log(`users=${USERS} questions=${QUESTIONS}`)

const asUser = async (uid, text) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false)`)
  try { return (await db.query(text)).rows } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false)`) }
}

const attempts = []
await ms('start_exam_attempt (first start, freeze+copy)', async (i) => {
  attempts.push((await asUser(users[i], `select start_exam_attempt('${exam}') id`))[0].id)
}, Math.min(USERS, 100))
const opt = (await db.query(`select id from question_options where question_id='${qids[0]}' and is_correct`)).rows[0].id
await ms('save_attempt_answer', async (i) => {
  const u = i % attempts.length
  await asUser(users[u], `select save_attempt_answer('${attempts[u]}','${qids[i % QUESTIONS]}','${(await db.query(`select id from question_options where question_id='${qids[i % QUESTIONS]}' and is_correct`)).rows[0].id}')`)
}, 200)
void opt
await ms('get_exam_session', async (i) => { await asUser(users[i], `select get_exam_session('${attempts[i]}')`) }, Math.min(attempts.length, 50))
await ms('submit_exam_attempt (score)', async (i) => { await asUser(users[i], `select submit_exam_attempt('${attempts[i]}')`) }, Math.min(attempts.length, 50))

// grow the finished-attempt population to USERS for the ranking paths
await sql(`insert into exam_attempts (user_id,exam_id,status,submitted_at,duration_minutes_snapshot,correct_count,incorrect_count,blank_count,score)
  select u.id,'${exam}','submitted', now() - (random()*interval '60 minutes'), 120, (random()*${QUESTIONS})::int, 0, 0, 0
  from auth.users u where u.email like 'bench%' and not exists (select 1 from exam_attempts a where a.user_id=u.id and a.exam_id='${exam}')`)
const who = (await db.query(`select user_id from exam_attempts where exam_id='${exam}' and status='submitted' limit 1`)).rows[0].user_id
const att = (await db.query(`select id from exam_attempts where user_id='${who}' and exam_id='${exam}' limit 1`)).rows[0].id
await ms(`get_exam_leaderboard (${USERS} participants)`, () => asUser(who, `select get_exam_leaderboard('${exam}', 50)`), 10)
await ms(`get_attempt_ranking (${USERS} participants)`, () => asUser(who, `select get_attempt_ranking('${att}')`), 10)
await ms('get_attempt_results_page', () => asUser(who, `select get_attempt_results_page(20,null,null)`), 10)
await ms('get_student_exam_list', () => asUser(who, `select get_student_exam_list()`), 10)
void U
process.exit(0)
