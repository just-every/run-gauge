import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {portability} from './gauge-portability.mjs'
import {harness} from './gauge-harness.mjs'
const h=await harness(),{cmd,state,request,post,owner}=h
let count=0
async function flow(name,fn){await fn();console.log(`PASS ${name}`);count++}
try{
 let p,lead,other,eng,task,budget,entry,staff,leadUser,financeUser,packet,receipt
 const record=async(k,id)=>(await state()).data[k].find(r=>r.id===id)
 await flow('ENGAGEMENT-001 real empty account to scoped engagement',async()=>{
  assert.equal((await state()).data.engagements.length,0)
  p=await cmd('save:people',{name:'Staff',timezone:'Australia/Brisbane'});lead=await cmd('save:people',{name:'Lead',timezone:'Australia/Brisbane'});other=await cmd('save:people',{name:'Unrelated lead',timezone:'Australia/Brisbane'})
  const client=await cmd('save:clients',{name:'Agency client'});eng=await cmd('save:engagements',{name:'Delivery',clientId:client.id,leadId:lead.id,members:[p.id],scope:'Approved client scope',timezone:'Australia/Brisbane'});task=await cmd('save:tasks',{engagementId:eng.id,name:'Design',remainingSeconds:14400});assert.equal((await record('engagements',eng.id)).value.scope,'Approved client scope')
 })
 await flow('ACCESS-001 native personas, scoped data and direct transport denials',async()=>{
  staff=await h.invite('staff');leadUser=await h.invite('lead');financeUser=await h.invite('finance');const outsider=await h.invite('unrelated')
  for(const [user,personId,role]of [[staff,p.id,'staff'],[leadUser,lead.id,'lead'],[financeUser,lead.id,'finance'],[outsider,other.id,'lead']])await cmd('grant',{operatorId:user.id,personId,role,enabled:true})
  assert.equal((await request('/api/gauge/state')).status,401);assert.equal((await state(outsider.cookie)).data.engagements.length,0)
  assert.equal((await request('/app/billing',staff.cookie)).status,404)
  await cmd('save:rates',{personId:p.id,effective:'2026-01-01',costMinor:1,billMinor:1},staff.cookie,403)
  assert.equal((await post('/api/gauge/command',{action:'save:clients',key:randomUUID(),name:'Bad'},staff.cookie)).status,403)
 })
 await flow('BUDGET-001 immutable approved terms and additive change orders',async()=>{
  budget=await cmd('save:budgets',{engagementId:eng.id,mode:'hourly',amountMinor:200000,effortSeconds:72000,roundingSeconds:60,reason:'Initial approved terms'});await cmd('budget:approve',budget,leadUser.cookie)
  await cmd('save:budgets',{...await record('budgets',budget.id),engagementId:eng.id,mode:'hourly'},owner,400)
  const change=await cmd('save:budgets',{engagementId:eng.id,mode:'hourly',amountMinor:220000,effortSeconds:79200,roundingSeconds:60,reason:'Client approved extra scope'});await cmd('budget:approve',change);assert.equal((await state()).data.budgets.filter(r=>r.value.status==='approved').length,2)
  assert.equal((await request(`/api/gauge/history/budgets/${budget.id}`,staff.cookie)).status,403,'staff read no terms history');assert.equal((await request(`/api/gauge/history/budgets/${budget.id}`,leadUser.cookie)).status,200)
 })
 await flow('RATE-001 effective-dated private rates',async()=>{await cmd('save:rates',{personId:'',service:'Design',effective:'2026-01-01',costMinor:2000,billMinor:5000});await cmd('save:rates',{personId:p.id,service:'*',effective:'2026-01-01',costMinor:9000,billMinor:20000});await cmd('save:rates',{personId:p.id,service:'Design',effective:'2026-01-01',costMinor:5000,billMinor:10000});assert.deepEqual((await state(staff.cookie)).data.rates,[])})
 await flow('TIME-001 persistent timer, exact manual duration, parallel exclusion and idempotence',async()=>{
  const args={personId:p.id,engagementId:eng.id,taskId:task.id,service:'Design',timezone:'Australia/Brisbane',notes:'=SUM(1,2)',billable:true,start:'2026-10-01T09:00:00+10:00',end:'2026-10-01T10:00:01+10:00'}
  const parallel=await Promise.all([post('/api/gauge/command',{action:'time:save',key:randomUUID(),...args},staff.cookie),post('/api/gauge/command',{action:'time:save',key:randomUUID(),...args},staff.cookie)]);assert.deepEqual(parallel.map(r=>r.status).sort(),[200,409]);entry=(await state()).data.time[0]
  await cmd('time:save',{...args,id:entry.id,revision:entry.revision,personId:lead.id},leadUser.cookie,403)
  const key=randomUUID(),timerArgs={action:'timer:start',key,...args};delete timerArgs.start;delete timerArgs.end
  const twins=await Promise.all([post('/api/gauge/command',timerArgs,staff.cookie),post('/api/gauge/command',timerArgs,staff.cookie)]);assert(twins.every(r=>r.status===200));const timer=await twins[0].json();await cmd('timer:start',{...args},staff.cookie,409);await new Promise(r=>setTimeout(r,1100));await cmd('timer:stop',timer,staff.cookie)
  assert.equal((await record('time',entry.id)).value.durationSeconds,3601)
 })
 await flow('TIME-002 return, correction and approval of exact revisions',async()=>{
  let submitted=await cmd('time:submit',entry,staff.cookie);await cmd('time:approve',entry,leadUser.cookie,409)
  let returned=await cmd('time:return',{...submitted,reason:'Clarify delivery'},leadUser.cookie)
  let corrected=await cmd('time:save',{...returned,...entry.value,notes:'=SUM(1,2)',start:'2026-10-01T09:00:00+10:00',end:'2026-10-01T10:00:01+10:00'},staff.cookie)
  submitted=await cmd('time:submit',corrected,staff.cookie);await cmd('time:approve',submitted,leadUser.cookie);entry=await record('time',entry.id)
  const reopened=await cmd('time:correct',{...entry,reason:'Approved correction audit'},leadUser.cookie)
  const updated=await cmd('time:save',{...reopened,...entry.value,notes:'=SUM(1,2)',start:'2026-10-01T09:00:00+10:00',end:'2026-10-01T10:00:01+10:00'},staff.cookie)
  const resubmitted=await cmd('time:submit',updated,staff.cookie);await cmd('time:approve',resubmitted,leadUser.cookie);entry=await record('time',entry.id)
  const history=await(await request(`/api/gauge/history/time/${entry.id}`,owner)).json();assert(history.history.some(r=>r.action==='time:correct'&&r.value.status==='approved'))
  assert.equal(entry.value.economics.billMinor,10167);const old=entry.value.economics.costMinor
  receipt={key:randomUUID(),personId:p.id,service:'*',effective:'2026-10-02',costMinor:9000,billMinor:15000};await cmd('save:rates',receipt,financeUser.cookie);assert.equal((await record('time',entry.id)).value.economics.costMinor,old)
  assert(!JSON.stringify(await state(staff.cookie)).includes('costMinor'))
 })
 await flow('COST-001 expense receipt custody, exact approval and attachment privacy',async()=>{
  let expense=await cmd('expense:save',{personId:p.id,engagementId:eng.id,date:'2026-10-01',description:'Receipt',amountMinor:1200,reimbursable:true},staff.cookie)
  const form=new FormData();for(const[k,v]of Object.entries({...expense,key:randomUUID(),action:'expense:file'}))form.set(k,String(v));form.set('file',new File(['private receipt bytes'],'receipt.txt',{type:'text/plain'}));const uploaded=await request('/api/gauge/command',staff.cookie,{method:'POST',headers:{origin:h.origin},body:form});assert.equal(uploaded.status,200);expense=await uploaded.json()
  const file=(await record('expenses',expense.id)).value.attachmentIds[0];const downloaded=await request(`/api/gauge/files/${file}`,staff.cookie);assert.equal(downloaded.status,200,'receipt access');assert.equal(await downloaded.text(),'private receipt bytes');assert.equal((await request(`/api/gauge/files/${file}`,leadUser.cookie)).status,403)
  expense=await cmd('expense:save',{...expense,...(await record('expenses',expense.id)).value,description:'Corrected receipt description',attachmentIds:['untrusted-replacement']},staff.cookie)
  assert.deepEqual((await record('expenses',expense.id)).value.attachmentIds,[file],'ordinary edits retain uploaded receipt links')
  let submitted=await cmd('expense:submit',expense,staff.cookie);const returned=await cmd('expense:return',{...submitted,reason:'Clarify the purchase'},leadUser.cookie)
  expense=await cmd('expense:save',{...returned,...(await record('expenses',expense.id)).value,description:'Reviewed receipt purchase'},staff.cookie);submitted=await cmd('expense:submit',expense,staff.cookie);await cmd('expense:approve',submitted,leadUser.cookie)
  assert.deepEqual((await record('expenses',expense.id)).value.attachmentIds,[file]);assert.equal(await(await request(`/api/gauge/files/${file}`,staff.cookie)).text(),'private receipt bytes')
 })
 await flow('CAPACITY-001 working calendar, leave and separate tentative staffing',async()=>{
  await cmd('save:calendars',{personId:p.id,from:'2026-10-01',to:'2026-11-30',dailySeconds:28800,weekdays:'1,2,3,4,5',timezone:'Australia/Brisbane'})
  await cmd('save:leave',{personId:p.id,from:'2026-10-01',to:'2026-10-01',dailySeconds:14400,note:'Leave'},staff.cookie)
  await cmd('save:staffing',{personId:p.id,engagementId:eng.id,from:'2026-10-01',to:'2026-10-01',dailySeconds:21600,commitment:'committed'},leadUser.cookie)
  await cmd('save:staffing',{personId:p.id,engagementId:eng.id,from:'2026-10-01',to:'2026-10-01',dailySeconds:7200,commitment:'tentative'},leadUser.cookie)
  const cap=(await state()).capacity.find(c=>c.personId===p.id);assert.equal(cap.tentativeSeconds,7200);assert.equal(cap.conflicts[0].seconds,7200);const leadCap=(await state(leadUser.cookie)).capacity.find(c=>c.personId===p.id);assert.equal(leadCap.availableSeconds,cap.availableSeconds)
  const sunday=await cmd('save:staffing',{personId:p.id,engagementId:eng.id,from:'2026-10-04',to:'2026-10-04',dailySeconds:10800,commitment:'committed'},leadUser.cookie)
  await cmd('save:staffing',{personId:p.id,engagementId:eng.id,from:'2026-10-04',to:'2026-10-04',dailySeconds:3600,commitment:'tentative'},leadUser.cookie)
  const contractor=await cmd('save:people',{name:'Contractor',contractor:true,timezone:'Australia/Brisbane'})
  await cmd('save:calendars',{personId:contractor.id,from:'2026-10-01',to:'2026-10-01',dailySeconds:7200,weekdays:'4',timezone:'Australia/Brisbane'})
  await cmd('save:leave',{personId:contractor.id,from:'2026-10-01',to:'2026-10-02',dailySeconds:3600,note:'Declared leave'})
  const unknown=await cmd('save:staffing',{personId:contractor.id,engagementId:eng.id,from:'2026-10-01',to:'2026-10-02',dailySeconds:7200,commitment:'committed'})
  const tentative=await cmd('save:staffing',{personId:contractor.id,engagementId:eng.id,from:'2026-10-02',to:'2026-10-02',dailySeconds:1800,commitment:'tentative'})
  const report=await state(),staffCap=report.capacity.find(c=>c.personId===p.id),weekend=staffCap.days.find(d=>d.date==='2026-10-04')
  assert.equal(staffCap.committedSeconds,32400);assert.equal(staffCap.tentativeSeconds,10800);assert.equal(weekend.availableSeconds,0);assert.equal(weekend.remainingSeconds,-10800);assert.equal(weekend.workingDay,false);assert.equal(weekend.tentativeSeconds,3600);assert(staffCap.conflicts.some(c=>c.date==='2026-10-04'&&c.seconds===10800&&c.sources.includes(sunday.id)))
  const contractorCap=report.capacity.find(c=>c.personId===contractor.id),missing=contractorCap.days.find(d=>d.date==='2026-10-02')
  assert.equal(contractorCap.contractor,true);assert.equal(contractorCap.availableSeconds,null);assert.equal(contractorCap.remainingSeconds,null);assert.equal(contractorCap.knownAvailableSeconds,3600);assert.equal(contractorCap.committedSeconds,14400);assert.equal(contractorCap.tentativeSeconds,1800)
  assert.equal(missing.availableSeconds,null);assert.equal(missing.remainingSeconds,null);assert.equal(missing.leaveSeconds,3600);assert.deepEqual(missing.committedSources,[unknown.id]);assert.deepEqual(missing.tentativeSources,[tentative.id]);assert.equal(contractorCap.conflicts.length,1);assert.equal(contractorCap.conflicts[0].seconds,3600)
  assert(report.exceptions.some(x=>x.type==='availability missing'&&x.personId===contractor.id&&x.demand.some(d=>d.committedSources.includes(unknown.id))))
 })
 await flow('ECONOMICS-001 approved actual cost and remaining effort',async()=>{const econ=(await state()).economics[0];assert.equal(econ.approvedSeconds,3601);assert.equal(econ.costMinor,6201);assert.equal(econ.remainingSeconds,14400);let unknown=await cmd('time:save',{personId:lead.id,engagementId:eng.id,taskId:task.id,service:'Unpriced service',timezone:'Australia/Brisbane',notes:'Approved work without a supplied cost',billable:true,start:'2026-10-02T09:00:00+10:00',end:'2026-10-02T10:00:00+10:00'});unknown=await cmd('time:submit',unknown);await cmd('time:approve',unknown);const updated=(await state()).economics[0];assert(updated.missingCostSources.includes(unknown.id));assert(updated.missingBillRateSources.includes(unknown.id))})
 await flow('BILLING-001 concurrent source reservations and fixed-fee eligibility',async()=>{
  const expense=(await state()).data.expenses[0];const args={action:'packet:create',engagementId:eng.id,title:'October',sources:[`time:${entry.id}`,`expenses:${expense.id}`]}
  const races=await Promise.all([post('/api/gauge/command',{...args,key:randomUUID()},owner),post('/api/gauge/command',{...args,key:randomUUID()},owner)]);assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);packet=(await state()).data.packets[0]
  await cmd('time:correct',{...entry,reason:'Cannot alter allocated work'},leadUser.cookie,409)
  const fixed=await cmd('save:budgets',{engagementId:eng.id,mode:'fixed',amountMinor:50000,effortSeconds:5000,roundingSeconds:60,reason:'Fixed delivery'});await cmd('budget:approve',fixed);const milestone=await cmd('save:milestones',{engagementId:eng.id,name:'Delivered',due:'2026-10-31',amountMinor:50000});await cmd('milestone:approve',milestone);assert.equal((await request(`/api/gauge/history/milestones/${milestone.id}`,staff.cookie)).status,403,'staff read no milestone history');await cmd('packet:create',{engagementId:eng.id,title:'Milestone preparation',sources:[`milestones:${milestone.id}`]})
 })
 await flow('BILLING-002 exact approval, formula-safe repeated exports and linked correction',async()=>{
  await cmd('packet:approve',packet);packet=await record('packets',packet.id);const first=await request(`/api/gauge/packets/${packet.id}`,owner),bytes=await first.text();assert(bytes.includes("'=SUM(1,2)"));assert.equal(await(await request(`/api/gauge/packets/${packet.id}`,owner)).text(),bytes);assert.equal((await request(`/api/gauge/packets/${packet.id}`,staff.cookie)).status,403)
  const adjustment=await cmd('packet:adjust',{id:packet.id,revision:packet.revision,sourceId:entry.id,correctedAmountMinor:10000,reason:'Reviewed reduction'});await cmd('packet:approve',adjustment);assert.equal((await record('packets',adjustment.id)).value.totalMinor,-167);const adjustmentCsv=await(await request(`/api/gauge/packets/${adjustment.id}`,owner)).text();const parsedTotal=Number(execFileSync('python3',['-c',"import csv,sys; rows=list(csv.reader(sys.stdin)); col=rows[1].index('amount minor'); print(sum(int(row[col]) for row in rows[2:] if row[0]!='TOTAL'))"],{input:adjustmentCsv,encoding:'utf8'}).trim());assert.equal(parsedTotal,-167);assert.equal(await(await request(`/api/gauge/packets/${packet.id}`,owner)).text(),bytes)
  const expense=(await state()).data.expenses[0],review=(await state()).correctionReviews.find(r=>r.packetId===adjustment.id)
  assert.equal(review.originalPacketId,packet.id);assert.equal(review.sources.find(l=>l.sourceId===expense.id).currentAmountMinor,1200)
  const secondArgs={action:'packet:adjust',id:review.packetId,revision:review.revision,sourceKind:'expenses',sourceId:expense.id,correctedAmountMinor:900,reason:'Review another original source'}
  const races=await Promise.all([post('/api/gauge/command',{...secondArgs,key:randomUUID()},owner),post('/api/gauge/command',{...secondArgs,key:randomUUID()},owner)]);assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);const second=await races.find(r=>r.status===200).json()
  await cmd('packet:adjust',{...secondArgs,id:packet.id,revision:packet.revision},owner,409);await cmd('packet:approve',second);assert.equal((await record('packets',second.id)).value.totalMinor,-300)
  const html=await(await request('/app/billing',owner)).text(),correctionForm=[...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map(m=>m[1]).find(f=>f.includes('value="packet:adjust"')&&f.includes(`name="id" value="${second.id}"`)&&f.includes(`name="sourceId" value="${entry.id}"`));assert(correctionForm,'latest packet offers every original source through its form')
  const form=new FormData();for(const m of correctionForm.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g))form.set(m[1],m[2]);form.set('correctedAmountDollars','105');form.set('reason','Successive reviewed time correction')
  assert.equal((await request('/app/action',owner,{method:'POST',headers:{origin:h.origin},body:form})).status,303)
  let third=(await state()).data.packets.find(p=>p.value.correctsPacketId===second.id);assert.equal(third.value.totalMinor,500,'delta uses the latest corrected time amount');await cmd('packet:approve',third);third=await record('packets',third.id)
  let cancelled=await cmd('packet:adjust',{...third,sourceId:expense.id,correctedAmountMinor:1000,reason:'Review then cancel'});await cmd('packet:cancel',cancelled)
  const fourth=await cmd('packet:adjust',{...third,sourceId:expense.id,correctedAmountMinor:1000,reason:'Reviewed final purchase amount'});assert.equal((await record('packets',fourth.id)).value.totalMinor,100);await cmd('packet:approve',fourth)
  await cmd('packet:create',{engagementId:eng.id,title:'Must not rebill original work',sources:[`expenses:${expense.id}`]},owner,409)
  assert.equal(await(await request(`/api/gauge/packets/${adjustment.id}`,owner)).text(),adjustmentCsv);assert.equal(await(await request(`/api/gauge/packets/${packet.id}`,owner)).text(),bytes)
 })
 await flow('REVIEW-001 grounded decisions, missing time and capacity exceptions',async()=>{const r=await state();assert(r.exceptions.some(x=>x.type==='missing time'));assert(r.exceptions.some(x=>x.type==='capacity conflict'&&x.sources.length));for(const section of ['review','engagements','time','expenses','capacity','rates','billing','imports','access']){const page=await request(`/app/${section}`,owner);assert.equal(page.status,200,section);assert(!(await page.text()).includes(h.vars.SESSION_SECRET))}})
 await flow('MOVE-001 Harvest preview, partial rollback, native reconciliation, idempotence and untouched undo',async()=>{
  const root=new URL('./fixtures/harvest/',import.meta.url),files={};for(const name of ['clients.csv','people.csv','projects.csv','time.csv'])files[name]=await readFile(new URL(name,root),'utf8');const pack={manifest:JSON.parse(await readFile(new URL('manifest.json',root),'utf8')),files}
  const before=(await state()).data.time.length,preview=await cmd('import:preview',{package:pack});assert.equal((await state()).data.time.length,before);assert.equal(preview.totals['c-1/2026-09'].seconds,43200)
  let job=await cmd('import:create',{package:pack,fingerprint:preview.fingerprint});assert.equal(job.state,'applying');job=await cmd('import:rollback',{id:job.id});while(job.state==='rolling_back')job=await cmd('import:resume',{id:job.id});assert.equal((await state()).data.time.length,before)
  job=await cmd('import:create',{package:pack,fingerprint:preview.fingerprint});while(job.state==='applying'||job.state==='queued')job=await cmd('import:resume',{id:job.id});assert.equal(job.state,'completed');assert.equal((await state()).data.time.length,before+12)
  const original=await request(`/api/gauge/imports/${job.id}`,owner);assert.equal(original.status,200);assert((await original.text()).includes('retained'));assert.equal((await request(`/api/gauge/imports/${job.id}`,staff.cookie)).status,403)
  const imported=(await state()).data.time.find(r=>r.value.source?.externalId==='t-1');assert.equal(imported.value.start,null);assert.equal(imported.value.status,'draft')
  const importedPerson=imported.value.personId;await cmd('grant',{operatorId:staff.id,personId:importedPerson,role:'staff',enabled:true});const staffData=await state(staff.cookie);assert(staffData.data.time.length===12);assert(!JSON.stringify(staffData).includes('costMinor'));await cmd('grant',{operatorId:staff.id,personId:p.id,role:'staff',enabled:true})
  let repeat=await cmd('import:create',{package:pack,fingerprint:preview.fingerprint});while(repeat.state==='applying'||repeat.state==='queued')repeat=await cmd('import:resume',{id:repeat.id});assert.equal((await state()).data.time.length,before+12)
  // Undo the reimport first, then the source owner: reused claims never duplicate native rows.
  repeat=await cmd('import:undo',{id:repeat.id});while(repeat.state==='undoing')repeat=await cmd('import:resume',{id:repeat.id})
  job=await cmd('import:undo',{id:job.id});while(job.state==='undoing')job=await cmd('import:resume',{id:job.id});assert.equal((await state()).data.time.length,before)
  const changedPack=structuredClone(pack);changedPack.manifest.namespace='synthetic-edited';const changedPreview=await cmd('import:preview',{package:changedPack});let editedJob=await cmd('import:create',{package:changedPack,fingerprint:changedPreview.fingerprint});while(editedJob.state==='applying')editedJob=await cmd('import:resume',{id:editedJob.id})
  const importedTask=(await state()).data.tasks.find(r=>r.value.source?.namespace==='harvest:synthetic-edited');await cmd('save:tasks',{...importedTask,...importedTask.value,remainingSeconds:300})
  let refused=false;for(let n=0;n<10&&!refused;n++){const response=await post('/api/gauge/command',{action:n===0?'import:undo':'import:resume',id:editedJob.id,key:randomUUID()},owner);if(response.status===409)refused=true;else assert.equal(response.status,200)}assert(refused,'edited import refuses destructive undo');assert.equal((await record('tasks',importedTask.id)).value.remainingSeconds,300)
 })
 await flow('ACCESS-001 revocation and minimal replay acknowledgements',async()=>{
  await cmd('grant',{operatorId:financeUser.id,personId:p.id,role:'staff',enabled:true});const replay=await cmd('save:rates',receipt,financeUser.cookie);assert.deepEqual(Object.keys(replay).sort(),['id','revision','saved']);assert(!JSON.stringify(replay).includes('costMinor'))
  await cmd('grant',{operatorId:staff.id,personId:p.id,role:'staff',enabled:false});assert.equal((await request('/api/gauge/state',staff.cookie)).status,403);await cmd('time:submit',entry,staff.cookie,403)
 })
 await h.close();await flow('MOVE-001 complete D1 archive restore, corruption and occupied refusal',()=>portability(h.directory))
 console.log(`${count} Gauge public-door flows passed`)
}finally{await h.dispose()}
