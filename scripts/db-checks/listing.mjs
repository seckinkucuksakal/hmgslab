// Phase 4: keyset pagination, batched exam list, search semantics
export default async function run({ db, U, as, q, chk, opts, std, topic }) {
const Q=(await q('adm',`select admin_create_question('${std}','${topic}','Q','e','easy',true,${opts('A')}) id`)).rows[0].id
const mkExam=async(title,o={})=>(await q('adm',`select admin_save_exam(null,'${JSON.stringify({title,duration_minutes:60,is_active:true,...o})}'::jsonb,array['${Q}']::uuid[]) id`)).rows[0].id
const P1=await mkExam('P1'), P2=await mkExam('P2')
// 45 finalized attempts for A with many timestamp ties
await db.exec(`insert into exam_attempts (user_id,exam_id,status,submitted_at,duration_minutes_snapshot,correct_count,incorrect_count,blank_count,score)
 select '${U.a}','${P1}','submitted', timestamp with time zone '2026-01-01 10:00:00+00' + ((g/5) * interval '1 minute'), 60, 1,0,0,1 from generate_series(1,45) g`)
const page=async(cur)=>{ const r=await q('a',`select get_attempt_results_page(20, ${cur?`'${cur.submitted_at}'::timestamptz,'${cur.id}'::uuid`:'null,null'}) j`); return r.rows[0].j }
let ids=[], cur=null, pages=0
for(;;){ const j=await page(cur); pages++; ids.push(...j.items.map(i=>i.id)); if(pages===1){ // new newer result arrives between pages
   await db.exec(`insert into exam_attempts (user_id,exam_id,status,submitted_at,duration_minutes_snapshot,correct_count,incorrect_count,blank_count,score) values ('${U.a}','${P1}','submitted',now(),60,1,0,0,1)`) }
  if(!j.next_cursor) break; cur=j.next_cursor }
chk('45 results across 3 pages (older than 20 reachable)',pages===3&&ids.length===45,`pages=${pages} n=${ids.length}`)
chk('no duplicates, no skips despite ties and new insert',new Set(ids).size===45)
const cnt=(await db.query(`select count(*) c from exam_attempts where user_id='${U.a}'`)).rows[0].c
chk('new insert not leaked into later pages (total=46 in db)',Number(cnt)===46)
let r=await q('b',`select get_attempt_results_page(20,null,null) j`); chk("other user sees none of A's results",r.rows[0].j.items.length===0)
r=await q('a',`select get_attempt_results_page(20,now(),null) j`); chk('half cursor rejected',!r.ok)
// embargo preserved
const fut=new Date(Date.now()+86400e3).toISOString()
const S=await mkExam('Live',{exam_mode:'scheduled',scheduled_start_at:fut})
await db.exec(`alter table exams disable trigger user; update exams set scheduled_start_at=now()-interval '3 hours', scheduled_end_at=now()-interval '2 hours', lobby_open_at=now()-interval '4 hours', late_entry_until=now()-interval '170 minutes', results_publish_at=now()+interval '1 day' where id='${S}'; alter table exams enable trigger user`)
await db.exec(`insert into exam_attempts (user_id,exam_id,status,submitted_at,duration_minutes_snapshot,correct_count,incorrect_count,blank_count,score) values ('${U.a}','${S}','submitted',now()+interval '1 minute',60,7,3,0,7)`)
r=await q('a',`select get_attempt_results_page(5,null,null) j`); const top=r.rows[0].j.items[0]
chk('embargoed result hides counts in page',top.embargo===true&&top.correct_count==null&&top.completion_percent==null,JSON.stringify(top))
// exam list: expired in-progress attempt
await db.exec(`insert into exam_attempts (user_id,exam_id,status,started_at,duration_minutes_snapshot) values ('${U.b}','${P1}','in_progress',now()-interval '3 hours',60)`)
await db.exec(`insert into attempt_questions (attempt_id,question_id,sort_order) select id,'${Q}',1 from exam_attempts where user_id='${U.b}' and exam_id='${P1}' and status='in_progress'`)
r=await q('b',`select get_student_exam_list() j`); const L=r.rows[0].j; const p1=L.find(x=>x.title==='P1')
chk('expired attempt not shown as running; points to finalized result',p1.in_progress_attempt_id===null&&p1.finalized_attempt_id!==null,JSON.stringify(p1))
chk('attempt actually finalized as expired',(await db.query(`select status from exam_attempts where id='${p1.finalized_attempt_id}'`)).rows[0].status==='expired')
chk('list includes practice + scheduled with live_state',L.length===3&&L.find(x=>x.title==='Live').live_state!=='practice',L.map(x=>x.live_state).join(','))
// active attempt shows
await db.exec(`insert into exam_attempts (user_id,exam_id,status,started_at,duration_minutes_snapshot) values ('${U.b}','${P2}','in_progress',now()-interval '5 minutes',60)`)
r=await q('b',`select get_student_exam_list() j`); chk('running attempt listed as in progress',r.rows[0].j.find(x=>x.title==='P2').in_progress_attempt_id!==null)
r=await q('adm',`select get_student_exam_list() j`); chk('other users have no attempt state',r.rows[0].j.every(x=>!x.in_progress_attempt_id))

// 650 questions inserted at identical created_at (tie), oldest one has a unique needle
await db.exec(`insert into questions (subject_id,topic_id,question_text,difficulty,created_at)
 select '${std}','${topic}', case when g=1 then 'İLK soru yuzde 100% ve a_b özel' else 'Soru ' || g end, 'easy', timestamptz '2026-01-01' + (g/50) * interval '1 second' from generate_series(1,650) g`)
const esc=(v)=>v.replace(/[\\%_]/g,c=>'\\'+c)
const search=async(term,page,size=25)=>(await db.query(`select id, count(*) over() total from questions where ($1::text = '' or question_text ilike $2) order by created_at desc, id desc offset $3 limit $4`,[term,'%'+esc(term)+'%',page*size,size])).rows
let rs=await search('İLK',0); chk('question older than newest 500 is found by DB search',rs.length===1)
rs=await search('100%',0); chk('literal % matched, not a wildcard',rs.length===1)
rs=await search('a_b',0); chk('literal _ matched',rs.length===1)
rs=await search('%',0); chk('"%"-only search matches literally (1 row, not 650)',rs.length===1,String(rs.length))
rs=await search('',0); chk('total count exposed (all questions incl. admin-created? >=650)',Number(rs[0].total)>=650,rs[0].total)
const all=[]; for(let p=0;p<Math.ceil(Number(rs[0].total)/25);p++) all.push(...(await search('',p)).map(x=>x.id))
chk('paging through every page yields each question exactly once despite created_at ties',all.length===Number(rs[0].total)&&new Set(all).size===all.length,`${all.length}/${new Set(all).size}`)

}
