// Phase 2: result embargo, leaderboard privacy, column-level grants
export default async function run({ db, U, sql, as, tryq, chk }) {
// exams: one practice, one scheduled with results in the future
// fixtures bypass publish validation on purpose (they model already-published exams)
await sql(`alter table exams disable trigger user`)
await sql(`insert into exams (id,title,duration_minutes,exam_mode,is_active) values ('e0000000-0000-4000-8000-000000000001','Practice',60,'practice',true)`)
await sql(`insert into exams (id,title,duration_minutes,is_active) values ('e0000000-0000-4000-8000-000000000002','Live',60,true)`)
await sql(`alter table exams enable trigger user`)
try {
  await sql(`update exams set exam_mode='scheduled', scheduled_start_at=now()-interval '3 hours', lobby_open_at=now()-interval '4 hours', scheduled_end_at=now()-interval '1 hour', results_publish_at=now()+interval '1 day' where id='e0000000-0000-4000-8000-000000000002'`)
} catch(e){ console.log('exam setup err', e.message) }
await sql(`alter table exams disable trigger user; update exams set results_publish_at=now()+interval '1 day' where title='Live'; alter table exams enable trigger user`)
console.log('live exam', JSON.stringify((await db.query(`select exam_mode, results_publish_at > now() future from exams where title='Live'`)).rows))
const A=(n,u,e,st,c,i,b)=>`insert into exam_attempts (id,user_id,exam_id,status,submitted_at,duration_minutes_snapshot,score,correct_count,incorrect_count,blank_count) values ('${n}','${u}','${e}','${st}',now(),60,${c*5},${c},${i},${b})`
const L='e0000000-0000-4000-8000-000000000002', P='e0000000-0000-4000-8000-000000000001'
await sql(A('a0000000-0000-4000-8000-0000000000a1',U.a,L,'submitted',10,5,5))
await sql(A('a0000000-0000-4000-8000-0000000000b1',U.b,L,'submitted',12,3,5))
await sql(A('a0000000-0000-4000-8000-0000000000c1',U.c,L,'submitted',8,6,6).replace("'submitted',now()","'in_progress',null"))
await sql(A('a0000000-0000-4000-8000-0000000000a2',U.a,P,'submitted',10,5,5))
await sql(A('a0000000-0000-4000-8000-0000000000b2',U.b,P,'submitted',12,3,5))
const AT_A='a0000000-0000-4000-8000-0000000000a1', AT_B='a0000000-0000-4000-8000-0000000000b1'
let r
r=await tryq('a',`select score from exam_attempts where id='${AT_A}'`); chk('direct score read blocked (own, embargoed)',!r.ok,r.err)
r=await tryq('a',`select correct_count, incorrect_count, blank_count from exam_attempts`); chk('direct counts read blocked',!r.ok,r.err)
r=await tryq('a',`select * from exam_attempts`); chk('select * blocked',!r.ok)
r=await tryq('a',`select id, exam_id, status, submitted_at from exam_attempts where user_id='${U.a}'`); chk('safe columns still readable (own only)',r.ok&&r.rows.length===2,JSON.stringify(r.rows.length))
r=await tryq('a',`select id from exam_attempts where user_id='${U.b}'`); chk('other user attempts invisible',r.ok&&r.rows.length===0)
r=await tryq('adm',`select score from exam_attempts`); chk('admin direct score read also blocked (use RPC)',!r.ok)
r=await tryq('a',`select * from attempt_questions`); chk('attempt_questions select * blocked',!r.ok)
r=await tryq('a',`select get_exam_leaderboard('${L}') j`); chk('leaderboard embargoed -> error',!r.ok&&r.err.includes('henüz açıklanmadı'),r.err)
r=await tryq('c',`select get_exam_leaderboard('${L}') j`); chk('non-participant embargoed -> error',!r.ok)
r=await tryq('adm',`select get_exam_leaderboard('${L}') j`); chk('admin may view embargoed leaderboard',r.ok)
r=await tryq('a',`select get_attempt_ranking('${AT_B}') j`); chk("other user's ranking blocked",!r.ok,r.err)
r=await tryq('a',`select get_attempt_ranking('${AT_A}') j`); chk('own ranking embargo flag',r.ok&&r.rows[0].j.embargo===true&&!('rank' in r.rows[0].j))
r=await tryq('a',`select get_attempt_review('${AT_A}') j`); chk('review blocked during embargo',!r.ok||r.rows[0].j.embargo===true, r.err??'')
r=await tryq('a',`select get_attempt_results_list() j`); chk('results list hides counts during embargo',r.ok&&(()=>{const l=r.rows[0].j.find?r.rows[0].j:r.rows[0].j.items??r.rows[0].j; const live=(Array.isArray(l)?l:[]).find(x=>x.exam_title==='Live'); return live&&live.embargo===true&&live.correct_count==null})(), JSON.stringify(r.rows[0]?.j).slice(0,120))
r=await tryq('a',`select admin_publish_exam_results('${L}') j`); chk('non-admin cannot publish',!r.ok,r.err)
r=await tryq('a',`select get_exam_leaderboard('${P}') j`); chk('practice exam leaderboard OK for participant',r.ok)
r=await tryq('c',`select get_exam_leaderboard('${P}') j`); chk('non-participant blocked on practice leaderboard',!r.ok,r.err)
r=await tryq('adm',`select admin_publish_exam_results('${L}') j`); chk('admin can publish early',r.ok,r.err??'')
r=await tryq('a',`select get_exam_leaderboard('${L}') j`); chk('after publish: participant sees leaderboard',r.ok)
const j=r.rows?.[0]?.j
if (j) {
  const names=j.entries.map(e=>e.display_name)
  chk('hidden user shown as Gizli Kullanıcı to others',names.includes('Gizli Kullanıcı')&&!names.includes('Berk'),names.join(','))
  chk('no submitted_at / user ids leaked',!JSON.stringify(j).includes('submitted_at')&&!JSON.stringify(j).includes(U.b))
  chk('in-progress attempt excluded',j.total_participants===2,String(j.total_participants))
}
r=await tryq('b',`select get_exam_leaderboard('${L}') j`); chk('hidden user sees own real name',r.ok&&r.rows[0].j.entries.some(e=>e.is_current_user&&e.display_name==='Berk'))
r=await tryq('a',`select get_attempt_ranking('${AT_A}') j`); chk('own ranking after publish',r.ok&&r.rows[0].j.embargo===false&&r.rows[0].j.rank===2,JSON.stringify(r.rows[0]?.j))
r=await tryq('a',`select score, correct_count from exam_attempts where id='${AT_A}'`); chk('direct read still blocked after publish (RPC only)',!r.ok)
// profile toggle by owner
await as('a',async()=>{ await sql(`update profiles set show_in_leaderboard=false where id='${U.a}'`) })
r=await tryq('b',`select get_exam_leaderboard('${L}') j`); chk('toggle off hides name from others',r.ok&&!r.rows[0].j.entries.some(e=>e.display_name==='Ayşe'))
r=await tryq('a',`select get_exam_leaderboard('${L}') j`); chk('toggle off still shows own name',r.ok&&r.rows[0].j.entries.some(e=>e.is_current_user&&e.display_name==='Ayşe'))
r=await tryq('a',`update profiles set show_in_leaderboard=false where id='${U.b}' returning id`); chk("cannot change others' toggle",r.ok&&r.rows.length===0)
r=await tryq('a',`update profiles set role='admin' where id='${U.a}'`); chk('no self-promotion',!r.ok)

}
