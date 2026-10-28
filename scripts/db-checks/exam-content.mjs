// Phase 3: atomic saves, frozen content, lifecycle locks
export default async function run({ db, q, chk, opts, std, topic }) {
const mk=async(txt,c='A')=> (await q('adm',`select admin_create_question('${std}','${topic}','${txt}','expl',  'easy',true,${opts(c)}) id`)).rows[0].id
const Q1=await mk('Soru 1'), Q2=await mk('Soru 2','B'), Q3=await mk('Soru 3')
const legacyQ='c1000000-0000-4000-8000-000000000001' // Anayasa Hukuku seed question (legacy subject)
const ex=(o={})=>JSON.stringify({title:'Deneme',duration_minutes:60,exam_mode:'practice',is_active:false,...o})
const save=(who,id,o,ids)=>q(who,`select admin_save_exam(${id?`'${id}'`:'null'}, '${ex(o)}'::jsonb, array[${ids.map(i=>`'${i}'`).join(',')}]::uuid[]) id`)

let r=await save('a',null,{},[Q1]); chk('non-admin cannot save',!r.ok,r.err)
r=await save('adm',null,{},[Q1,Q2]); chk('admin creates draft with 2 questions',r.ok); const E1=r.rows[0].id
chk('questions linked in order',(await db.query(`select string_agg(question_id::text, ',' order by sort_order) s from exam_questions where exam_id='${E1}'`)).rows[0].s===`${Q1},${Q2}`)
// atomicity: bogus question id mid-save
r=await save('adm',E1,{title:'Changed'},[Q2,'99999999-9999-4999-8999-999999999999']); chk('bad question id -> error',!r.ok,r.err)
const st=(await db.query(`select e.title,(select count(*) from exam_questions where exam_id=e.id) n from exams e where id='${E1}'`)).rows[0]
chk('failed save rolled back (title + links intact)',st.title==='Deneme'&&Number(st.n)===2,JSON.stringify(st))
r=await save('adm',E1,{},[Q1,Q1]); chk('duplicate question rejected',!r.ok,r.err)
// publish validations
const E0=(await save('adm',null,{},[])).rows[0].id
r=await save('adm',E0,{is_active:true},[]); chk('publish w/o questions blocked w/ message',!r.ok&&r.err.includes('Yayımlanamaz: Denemede en az bir soru olmalı'),r.err)
r=await save('adm',E0,{is_active:true},[legacyQ]); chk('publish with out-of-scope question blocked',!r.ok&&r.err.includes('Yayımlanamaz:') && r.err.includes('standart 19 ders'),r.err)
await db.exec(`update questions set is_active=false where id='${Q3}'`)
r=await save('adm',E0,{is_active:true},[Q3]); chk('publish with inactive question blocked',!r.ok&&r.err.includes('Yayımlanamaz:') && r.err.includes('1 soru pasif durumda'),r.err)
await db.exec(`update questions set is_active=true where id='${Q3}'`)
r=await save('adm',E0,{is_active:true,exam_mode:'scheduled',scheduled_start_at:new Date(Date.now()-3600e3).toISOString()},[Q3]); chk('publish scheduled with past start blocked',!r.ok&&r.err.includes('Yayımlanamaz:') && r.err.includes('Başlangıç zamanı geçmişte'),r.err)
r=await save('adm',E0,{is_active:true,duration_minutes:0},[Q3]); chk('zero duration blocked',!r.ok,r.err)
// direct inserts bypassing RPC
r=await q('adm',`update exams set is_active=true where id='${E0}'`); chk('direct publish of empty exam blocked',!r.ok,r.err)
// valid publish -> frozen
r=await save('adm',E1,{is_active:true},[Q1,Q2]); chk('valid publish ok',r.ok,r.err)
const fr=(await db.query(`select content_frozen_at is not null f,(select count(*) from exam_question_snapshots where exam_id=e.id) n from exams e where id='${E1}'`)).rows[0]
chk('content frozen with 2 snapshots',fr.f&&Number(fr.n)===2,JSON.stringify(fr))
r=await q('adm',`insert into exam_question_snapshots (exam_id,question_id,sort_order,question_text,options) values ('${E1}','${Q3}',9,'x','[]')`); chk('snapshots not writable via API',!r.ok)
r=await q('a',`select * from exam_question_snapshots`); chk('students cannot read snapshots/answer key',!r.ok)
// editing published exam questions
r=await q('adm',`insert into exam_questions (exam_id,question_id,sort_order) values ('${E1}','${Q3}',3)`); chk('direct question add on published exam blocked',!r.ok,r.err)
// student A starts
r=await q('a',`select start_exam_attempt('${E1}') id`); chk('A starts attempt',r.ok,r.err); const AT_A=r.rows[0].id
const sess=(await q('a',`select get_exam_session('${AT_A}') j`)).rows[0].j
chk('session has no answer key',!JSON.stringify(sess).includes('is_correct')&&!JSON.stringify(sess).includes('correct_option'))
const origCorrect=(await db.query(`select id from question_options where question_id='${Q1}' and is_correct`)).rows[0].id
// admin edits bank question AFTER publish: new text + different correct answer
const newOpts=opts('C')
r=await q('adm',`select admin_update_question('${Q1}','${std}','${topic}','EDITED TEXT','new expl','easy',true,${newOpts})`); chk('bank edit still allowed',r.ok,r.err)
r=await q('b',`select start_exam_attempt('${E1}') id`); const AT_B=r.rows[0].id
const sessB=(await q('b',`select get_exam_session('${AT_B}') j`)).rows[0].j
chk('late participant gets the frozen version (old text)',sessB.questions.find(x=>x.id===Q1).question_text==='Soru 1',sessB.questions.find(x=>x.id===Q1).question_text)
chk('A and B see identical content',JSON.stringify(sessB.questions.map(x=>[x.question_text,x.options.map(o=>o.option_text)]))===JSON.stringify(sess.questions.map(x=>[x.question_text,x.options.map(o=>o.option_text)])))
// A answers original-correct option for Q1 and submits
r=await q('a',`select save_attempt_answer('${AT_A}','${Q1}','${origCorrect}')`); chk('answer w/ frozen option accepted',r.ok,r.err)
r=await q('a',`select save_attempt_answer('${AT_A}','${Q1}','${(await db.query(`select id from question_options where question_id='${Q2}' limit 1`)).rows[0].id}')`); chk("option from another question rejected",!r.ok,r.err)
r=await q('a',`select submit_exam_attempt('${AT_A}') j`); chk('submit ok',r.ok,r.err)
const sc=(await db.query(`select correct_count, score from exam_attempts where id='${AT_A}'`)).rows[0]
chk('scoring uses frozen key (not edited bank)',sc.correct_count===1,JSON.stringify(sc))
// review shows frozen text
const rv=(await q('a',`select get_attempt_review('${AT_A}') j`)).rows[0]?.j
chk('review shows frozen text',JSON.stringify(rv).includes('Soru 1')&&!JSON.stringify(rv).includes('EDITED TEXT'))
// started exam edits
r=await save('adm',E1,{is_active:true,duration_minutes:90},[Q1,Q2]); chk('duration change on started exam blocked',!r.ok&&r.err.includes('değiştirilemez'),r.err)
r=await save('adm',E1,{is_active:true},[Q2,Q1]); chk('question reorder on started exam blocked',!r.ok,r.err)
r=await save('adm',E1,{is_active:true,title:'Yeni başlık'},[Q1,Q2]); chk('title change on started exam allowed',r.ok,r.err)
r=await q('adm',`delete from exam_questions where exam_id='${E1}'`); chk('direct delete of started exam links blocked',!r.ok)
// unpublished, never started exam: can be edited, refreezes
const E2=(await save('adm',null,{is_active:true},[Q2,Q3])).rows[0].id
r=await save('adm',E2,{is_active:true},[Q3]); chk('published unstarted exam: change questions via save (auto unpublish/republish)',r.ok,r.err)
const s2=(await db.query(`select (select count(*) from exam_question_snapshots where exam_id='${E2}') n, is_active a, content_frozen_at is not null f from exams where id='${E2}'`)).rows[0]
chk('re-frozen with new set',Number(s2.n)===1&&s2.a&&s2.f,JSON.stringify(s2))
r=await save('adm',E2,{is_active:false},[Q3]); chk('unpublish clears freeze',r.ok&&!(await db.query(`select content_frozen_at is not null f from exams where id='${E2}'`)).rows[0].f)
// scheduled flow + results publish control
const fut=new Date(Date.now()+86400e3).toISOString()
const E3=(await save('adm',null,{exam_mode:'scheduled',scheduled_start_at:fut,is_active:true},[Q2])).rows[0].id; chk('scheduled future exam publishes',!!E3)
r=await q('adm',`select admin_publish_exam_results('${E3}') j`); chk('admin results publish still works',r.ok,r.err)
r=await q('a',`select admin_publish_exam_results('${E3}') j`); chk('non-admin results publish blocked',!r.ok)
await db.exec(`alter table exams disable trigger exams_guard_lifecycle; update exams set scheduled_start_at=now()-interval '10 minutes', lobby_open_at=now()-interval '1 hour' where id='${E3}'; alter table exams enable trigger exams_guard_lifecycle`).catch(e=>console.log('setup',e.message))
r=await q('adm',`select admin_publish_exam_results('${E3}') j`); chk('results publish still works after exam start',r.ok,r.err)
r=await q('adm',`update exams set duration_minutes=10 where id='${E3}'`); chk('started scheduled exam duration locked',!r.ok,r.err)
r=await q('adm',`update exams set content_frozen_at=null where id='${E1}'`); chk('freeze marker not client-writable',(await db.query(`select content_frozen_at is not null f from exams where id='${E1}'`)).rows[0].f)

}
