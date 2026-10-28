// Phase 6: entitlement model, access enforcement, history lock
export default async function run({ db, U, sql, q, chk, opts, std, topic }) {
  const Q = (await q('adm', `select admin_create_question('${std}','${topic}','Q','e','easy',true,${opts('A')}) id`)).rows[0].id
  const mk = async (title) => (await q('adm', `select admin_save_exam(null,'${JSON.stringify({ title, duration_minutes: 60, is_active: true })}'::jsonb,array['${Q}']::uuid[]) id`)).rows[0].id
  const E1 = await mk('E1'), E2 = await mk('E2')
  const start = (who, e) => q(who, `select start_exam_attempt('${e}') id`)

  // enforcement is off by default: nothing changes
  let r = await start('a', E1); chk('enforcement off: first start ok', r.ok, r.err)
  r = await start('a', E2); chk('enforcement off: second exam ok (no limit)', r.ok, r.err)
  r = await q('a', `select get_my_access() j`)
  chk('access report: free, not enforced', r.rows[0].j.status === 'free' && r.rows[0].j.enforced === false)

  await sql(`update billing_settings set enforced = true`)
  r = await start('b', E1); chk('enforced: free user may start 1 exam', r.ok, r.err)
  r = await start('b', E1); chk('enforced: resuming the same exam is allowed', r.ok, r.err)
  r = await start('b', E2); chk('enforced: second distinct exam blocked for free user', !r.ok && r.err.includes('aktif paket'), r.err)
  r = await q('b', `select get_my_access() j`)
  chk('access report shows free allowance used', r.rows[0].j.free_exams_used === 1 && r.rows[0].j.can_start_new === false)

  r = await q('b', `select admin_grant_entitlement('${U.b}','monthly',null,'test') id`); chk('non-admin cannot grant', !r.ok, r.err)
  r = await q('adm', `select admin_grant_entitlement('${U.b}','monthly',null,'test') id`); chk('admin grants monthly plan', r.ok, r.err)
  const ent = r.rows?.[0]?.id
  r = await start('b', E2); chk('active plan: new exam allowed', r.ok, r.err)
  r = await q('b', `select get_my_access() j`)
  chk('access report: active plan with end date', r.rows[0].j.status === 'active' && !!r.rows[0].j.ends_at && r.rows[0].j.plan_name === 'Aylık paket')
  r = await q('b', `select get_attempt_results_page(20,null,null) j`); chk('active plan: history readable', r.ok, r.err)

  // lapse: end date in the past
  await sql(`update entitlements set starts_at = now() - interval '40 days', ends_at = now() - interval '1 day' where id='${ent}'`)
  r = await q('b', `select get_my_access() j`)
  chk('expired plan reported as expired + history locked', r.rows[0].j.status === 'expired' && r.rows[0].j.history_locked === true)
  for (const [name, text] of [
    ['results page', `select get_attempt_results_page(20,null,null) j`],
    ['results list', `select get_attempt_results_list(5) j`],
    ['performance analytics', `select get_user_performance_analytics() j`],
    ['leaderboard', `select get_exam_leaderboard('${E1}') j`],
  ]) {
    r = await q('b', text); chk(`lapsed user locked out of ${name}`, !r.ok && r.err.includes('aktif paket'), r.err)
  }
  const att = (await sql(`select 1`), (await db.query(`select id from exam_attempts where user_id='${U.b}' limit 1`)).rows[0].id)
  r = await q('b', `select get_attempt_review('${att}') j`); chk('lapsed user locked out of review', !r.ok && r.err.includes('aktif paket'), r.err)
  r = await start('b', (await mk('E3'))); chk('lapsed user cannot start new exams', !r.ok, r.err)
  r = await q('a', `select get_attempt_results_page(20,null,null) j`); chk('free user (never paid) keeps their history', r.ok, r.err)

  // renew, then cancel (access until end), then revoke
  r = await q('adm', `select admin_grant_entitlement('${U.b}','monthly',null,null) id`); const ent2 = r.rows[0].id
  r = await q('b', `select get_attempt_results_page(20,null,null) j`); chk('renewal unlocks history', r.ok, r.err)
  await sql(`update entitlements set status='canceled' where id='${ent2}'`)
  r = await q('b', `select get_my_access() j`); chk('canceled keeps access until end date', r.rows[0].j.status === 'canceled' && r.rows[0].j.history_locked === false)
  r = await q('adm', `select admin_revoke_entitlement('${ent2}')`); chk('admin revokes', r.ok, r.err)
  r = await q('b', `select get_attempt_results_page(20,null,null) j`); chk('revoked entitlement locks history again', !r.ok)
  r = await q('b', `select * from entitlements`); chk('entitlements not directly readable', !r.ok)
  r = await q('b', `insert into entitlements (user_id,plan_id,ends_at) values ('${U.b}','season', now()+interval '1 day')`); chk('users cannot grant themselves access', !r.ok)
  r = await q('b', `update billing_settings set enforced=false`); chk('users cannot change billing settings', !r.ok)
}
