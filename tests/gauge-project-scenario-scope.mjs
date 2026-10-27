import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'

// FINANCE-003 scope: explicit future effort and native replacement terms, not a
// percentage adjustment hiding unchanged staffing. Through built HTTP doors.
export async function scopeScenarioJourney(h,browser) {
 const {cmd,request,owner}=h,asOf=new Date().toISOString().slice(0,10)
 const day=n=>new Date(Date.parse(asOf)+n*86400000).toISOString().slice(0,10)
 const read=async()=>{const r=await request(`/api/gauge/state?from=${day(-1)}&to=${day(4)}&asOf=${asOf}`,owner);assert.equal(r.status,200);return r.json()}
 const person=await cmd('save:people',{name:'Morgan Rivera',timezone:'UTC'})
 const client=await cmd('save:clients',{name:'Acorn scope review',paymentTermsDays:15,collectionPercent:75})
 await cmd('save:rates',{personId:person.id,service:'*',effective:day(-30),billMinor:12000,costMinor:6000})
 await cmd('save:calendars',{personId:person.id,from:day(-1),to:day(4),dailySeconds:8*3600,weekdays:'0,1,2,3,4,5,6',timezone:'UTC'})
 const projects=[],bookings=[],tasks=[],budgets=[]
 for(const name of ['Acorn discovery','Acorn launch']) {
  const e=await cmd('save:engagements',{name,clientId:client.id,leadId:person.id,members:[person.id],scope:'Full discovery and delivery',timezone:'UTC'});projects.push(e)
  budgets.push(await cmd('budget:approve',await cmd('save:budgets',{engagementId:e.id,mode:'hourly',amountMinor:200000,effortSeconds:20*3600,roundingSeconds:60,reason:'Original scope'})))
  bookings.push(await cmd('save:staffing',{engagementId:e.id,personId:person.id,service:'Design',from:day(-1),to:day(3),dailySeconds:2*3600,commitment:'committed'}))
  tasks.push(await cmd('save:tasks',{engagementId:e.id,name:'Future discovery',remainingSeconds:6*3600,from:day(1),to:day(3)}))
 }
 const before=(await read()).data
 const changes=projects.map((e,i)=>({type:'scope',...e,scope:'Focused discovery',allocations:[{...bookings[i],effectiveFrom:day(1),dailySeconds:3600}],tasks:[{...tasks[i],remainingSeconds:3*3600}],terms:{mode:'hourly',amountMinor:100000,effortSeconds:3*3600,roundingSeconds:60,expenseBudgetMinor:3000,expenseDate:day(3),reason:'Focused delivery and travel'}}))
 const input={asOf,changes},preview=await cmd('projectScenario:preview',input)
 for(const e of projects) {
  const b=preview.baseline.projects.find(p=>p.engagementId===e.id),s=preview.scenario.projects.find(p=>p.engagementId===e.id)
  assert.equal(b.etcCostMinor,6*6000);assert.equal(s.etcCostMinor,3*6000)
  assert.equal(b.eacFeesMinor,6*12000);assert.equal(s.eacFeesMinor,3*12000+3000)
  assert.equal(s.eacCostMinor,3*6000+3000);assert.equal(s.marginMinor,3*6000)
  const delta=preview.deltas.find(p=>p.engagementId===e.id)
  assert.equal(delta.eacFeesMinor,-33000);assert.equal(delta.eacCostMinor,-15000);assert.equal(delta.marginMinor,-18000)
 }
 assert.equal(preview.baseline.capacity[0].committedSeconds,12*3600);assert.equal(preview.scenario.capacity[0].committedSeconds,6*3600)
 assert.equal(preview.scenario.capacity[0].utilizationPercent,25)
 assert.equal(preview.scenario.cash.months.reduce((n,m)=>n+m.expectedMinor,0),2*39000*.75)
 assert.deepEqual(preview.baseline.dates.map(p=>p.tasks),preview.scenario.dates.map(p=>p.tasks),'Scope effort does not silently move task dates')
 // SALES-005: exact internal change versions retain the financial comparison but
 // never acquire live effect authority, including through the scenario door.
 const reviewer=await h.invite('synthetic-gauge-scope-reviewer')
 await cmd('grant',{operatorId:reviewer.id,personId:person.id,role:'finance',enabled:true})
 const extra={...changes[0],scope:'Full scope plus an extra prototype',allocations:[{...changes[0].allocations[0],dailySeconds:4*3600}],tasks:[{...changes[0].tasks[0],remainingSeconds:12*3600}],terms:{mode:'hourly',amountMinor:260000,effortSeconds:32*3600,roundingSeconds:60,reason:'Extra prototype requested'}}
 const changeInput={asOf,changes:[extra]},changePreview=await cmd('change:preview',changeInput)
 assert.deepEqual(changePreview.scopeDifference,{before:'Full discovery and delivery',after:'Full scope plus an extra prototype'})
 assert.equal(changePreview.termsDifference.before.id,budgets[0].id);assert.equal(changePreview.termsDifference.before.value.amountMinor,200000);assert.equal(changePreview.termsDifference.after.amountMinor,260000)
 assert.equal(changePreview.deltas[0].eacFeesMinor,72000);assert.equal(changePreview.deltas[0].eacCostMinor,36000);assert.equal(changePreview.deltas[0].marginMinor,36000)
 let change=await cmd('change:prepare',{...changeInput,fingerprint:changePreview.fingerprint,name:'Extra discovery review',reason:'Client requested an alternative'})
 const changeRecord=async id=>(await read()).data.projectScenarios.find(r=>r.id===id)
 assert.equal((await changeRecord(change.id)).value.reviewStatus,'pending')
 await cmd('change:review',{...change,outcome:'approved',reason:'Self review'},owner,403)
 await cmd('projectScenario:adopt',{...change,asOf,selectedIds:[projects[0].id],fingerprint:changePreview.fingerprint,reason:'Bypass client acceptance'},owner,409)
 change=await cmd('change:review',{...change,outcome:'declined',reason:'Need a revised scope and effort'},reviewer.cookie)
 const declined=await changeRecord(change.id)
 assert.equal(declined.value.reviewStatus,'declined')
 const revisedInput={asOf,changes:[{...extra,scope:'Full scope plus a smaller prototype',allocations:[{...extra.allocations[0],dailySeconds:3*3600}],tasks:[{...extra.tasks[0],remainingSeconds:9*3600}]}]},revisedPreview=await cmd('change:preview',revisedInput)
 assert.equal(revisedPreview.deltas[0].eacFeesMinor,36000);assert.equal(revisedPreview.deltas[0].marginMinor,18000)
 let revised=await cmd('change:prepare',{...revisedInput,previousId:change.id,fingerprint:revisedPreview.fingerprint,name:'Revised discovery review',reason:'Updated internal request'})
 await cmd('change:review',{...change,outcome:'approved',reason:'Superseded'},reviewer.cookie,409)
 revised=await cmd('change:review',{...revised,outcome:'approved',reason:'Exact scope, dates and margin reviewed'},reviewer.cookie)
 const reviewed=await changeRecord(revised.id)
 assert.equal(reviewed.value.previousId,change.id);assert.equal(reviewed.value.number,2)
 assert.equal(reviewed.value.reviewLabel,'Internal approval');assert.match(reviewed.value.notice,/Internal/);assert.equal(reviewed.value.reviewStatus,'approved');assert.equal(reviewed.value.status,'prepared')
 assert.deepEqual(reviewed.value.baseline,changePreview.baseline);assert.deepEqual(reviewed.value.scenario,revisedPreview.scenario)
 assert.deepEqual(await changeRecord(change.id),declined,'Earlier declined version is immutable')
 for(const kind of ['engagements','budgets','tasks','staffing','rates','time'])assert.deepEqual((await read()).data[kind],before[kind],`Pending client change leaves ${kind} unchanged`)
 await cmd('projectScenario:adopt',{...revised,asOf,selectedIds:[projects[0].id],fingerprint:changePreview.fingerprint,reason:'Internal approval is not client acceptance'},owner,409)
 const approvalAudit=await(await request(`/api/gauge/audit?recordId=${revised.id}`,owner)).json()
 assert(approvalAudit.entries.some(e=>e.approval?.label==='Internal approval'))
 const approvalExport=await(await request('/api/gauge/audit/export',owner)).json()
 assert(approvalExport.entries.filter(e=>e.recordId===revised.id&&e.data?.reviewStatus==='approved').every(e=>e.data.reviewLabel==='Internal approval'&&e.view.approval.label==='Internal approval'))
 const approvalHistory=await(await request(`/api/gauge/history/projectScenarios/${revised.id}`,owner)).json()
 assert(approvalHistory.history.every(r=>r.value.notice.includes('Internal')))
 const approvalContext=await browser.newContext({ignoreHTTPSErrors:true}),approvalPage=await approvalContext.newPage()
 try{
  await approvalContext.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  for(const width of [1440,390]){
   await approvalPage.setViewportSize({width,height:1000});await approvalPage.goto(`${h.origin}/app/audit?recordId=${revised.id}`)
   assert.match(await approvalPage.locator('main').innerText(),/Internal approval by/)
   assert(await approvalPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Internal approval audit fits ${width}`)
   if(process.env.GAUGE_SCENARIO_SHOTS){await mkdir(process.env.GAUGE_SCENARIO_SHOTS,{recursive:true});await approvalPage.screenshot({path:`${process.env.GAUGE_SCENARIO_SHOTS}/internal-approval-${width}.png`,fullPage:true})}
  }
 }finally{await approvalContext.close()}
 // SALES-005 conservative direct-review carrier: private comparisons never leave native finance.
 const clientRecipient=await h.invite('synthetic-gauge-92502'),otherRecipient=await h.invite('synthetic-gauge-92503')
 const clientRead=async(path,token,cookie=clientRecipient.cookie)=>request(path,cookie,{headers:{'x-gauge-review-token':token}})
 const directReview=async(record,outcome)=>{
  const releaseInput={...record,key:randomUUID(),contact:'synthetic-gauge-92502@example.test',description:'Extra prototype only; no automatic business effects',days:7,reason:'Owner explicitly releases this exact internally reviewed version'}
  for(const cookie of [clientRecipient.cookie,otherRecipient.cookie])await cmd('change:release-review',releaseInput,cookie,403)
  await cmd('change:release-review',{...releaseInput,contact:'synthetic-gauge-scope-second-role@example.test'},owner,409)
  for(const days of [0,31])await cmd('change:release-review',{...releaseInput,days},owner,400)
  const outbound=h.providerRequests.length,release=await cmd('change:release-review',releaseInput)
  assert.equal((await cmd('change:release-review',releaseInput)).token,undefined)
  const source=await changeRecord(record.id),review=source.value.clientReview,path=`/api/gauge/client-changes/${record.id}/${review.id}`
  const stored=await h.db.prepare('SELECT token_hash FROM g_change_review_authority WHERE review_id=?').bind(review.id).first()
  assert.equal(stored.token_hash,createHash('sha256').update(release.token).digest('hex'))
  for(const cookie of [otherRecipient.cookie,owner,reviewer.cookie])assert.equal((await clientRead(path,release.token,cookie)).status,403)
  assert.equal((await clientRead(path,'synthetic-gauge-wrong')).status,403)
  const response=await clientRead(path,release.token);assert.equal(response.status,200)
  const document=await response.json()
  assert.deepEqual(Object.keys(document).sort(),['id','revision','reviewId','version','description','document','documentDigest','expiresAt','decision'].sort())
  assert.equal(document.description,releaseInput.description);assert.equal(document.decision,null)
  const input={key:randomUUID(),revision:source.revision,outcome,signatureName:'Synthetic Gauge Client',consent:true,reason:`Client explicitly ${outcome} exact version ${source.value.number}`}
  const respond=(body,origin=h.origin)=>request(path,clientRecipient.cookie,{method:'POST',headers:{origin,'content-type':'application/json','x-gauge-review-token':release.token},body:JSON.stringify(body)})
  assert.equal((await respond(input,'https://untrusted.example.test')).status,403)
  assert.equal((await respond({...input,reason:''})).status,400)
  assert.equal((await respond({...input,revision:'stale'})).status,409)
  const saved=await respond(input);assert.equal(saved.status,200,await saved.clone().text());const result=await saved.json()
  assert.deepEqual(await(await respond(input)).json(),result)
  assert.equal((await respond({...input,reason:'Different content under the same key'})).status,409)
  const decision=(await changeRecord(record.id)).value.clientDecision
  assert.deepEqual({outcome:decision.outcome,reason:decision.reason,operatorId:decision.operatorId,fingerprint:decision.fingerprint},{outcome,reason:input.reason,operatorId:clientRecipient.id,fingerprint:source.value.fingerprint})
  assert.match(decision.notice,/not adopted/)
  assert.equal((await(await clientRead(path,release.token)).json()).decision.reason,input.reason)
  assert.equal(h.providerRequests.length,outbound,'Change review sends nothing')
  assert(!JSON.stringify((await read()).data).includes(release.token),'Shown-once token is absent from business records')
  const audit=await(await request(`/api/gauge/audit?recordId=${record.id}`,owner)).json()
  assert(audit.entries.some(e=>e.action==='change:respond'&&e.actor.id===clientRecipient.id&&e.requestKey===input.key&&e.previousRevision===source.revision&&e.revision===result.revision&&e.result.clientDecision.reason===input.reason))
  await cmd('projectScenario:adopt',{...result,asOf,selectedIds:[projects[0].id],fingerprint:source.value.fingerprint,reason:'Direct response still grants no adoption'},owner,409)
  await cmd('change:revoke-review',{...result,reviewId:review.id,reason:'Owner closes exact review'})
  assert.equal((await clientRead(path,release.token)).status,403)
  return result
 }
 revised=await directReview(revised,'rejected')
 const withdrawn=await cmd('change:withdraw' ,{...revised,reason:'Client review and signed evidence still needed'})
 assert.equal((await changeRecord(withdrawn.id)).value.status,'withdrawn')
 await cmd('change:review',{...withdrawn,outcome:'approved',reason:'Withdrawn versions cannot approve'},reviewer.cookie,409)
 const samePerson=await h.invite('synthetic-gauge-scope-second-role')
 await cmd('grant',{operatorId:samePerson.id,personId:person.id,role:'finance',enabled:true})
 let personPrepared=await cmd('change:prepare',{...changeInput,previousId:revised.id,fingerprint:changePreview.fingerprint,name:'Person-bound internal review',reason:'One person cannot review through another role'},reviewer.cookie)
 await cmd('change:review',{...personPrepared,outcome:'approved',reason:'Second account for the same person'},samePerson.cookie,403)
 assert.equal((await h.post('/auth/operator/role',{operatorId:reviewer.id,role:'owner'},owner)).status,200)
 await h.post('/auth/magic-link',{email:'synthetic-gauge-scope-reviewer@example.test'})
 const confirmation=new URL(h.mails.at(-1).text.match(/https:\/\/\S+\/auth\/confirm\?token=\S+/)[0])
 const signed=await h.post('/auth/confirm',{token:confirmation.searchParams.get('token')});assert.equal(signed.status,303)
 reviewer.cookie=signed.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')
 await cmd('change:review',{...personPrepared,outcome:'approved',reason:'Same preparing person now also holds owner role'},reviewer.cookie,403)
 personPrepared=await cmd('change:review',{...personPrepared,outcome:'approved',reason:'A different owner independently approves this revised version'})
 personPrepared=await directReview(personPrepared,'accepted')
 for(const kind of ['engagements','budgets','tasks','staffing','rates','time'])assert.deepEqual((await read()).data[kind],before[kind],`Client response changes no ${kind}`)
 await cmd('change:withdraw',{...personPrepared,reason:'Identity refusal proved without business effects'})
 const pending=await cmd('change:prepare',{...changeInput,previousId:personPrepared.id,fingerprint:changePreview.fingerprint,name:'Stale review candidate',reason:'Exercise current basis fence'})
 const prepared=await cmd('projectScenario:prepare',{...input,fingerprint:preview.fingerprint,name:'Acorn focused scope',reason:'Compare smaller delivery'})
 for(const kind of ['engagements','budgets','tasks','staffing','rates','time'])assert.deepEqual((await read()).data[kind],before[kind],`FINANCE-003 scope preparation isolates ${kind}`)
 // Per-source validation and already approved commitments remain native rules.
 for(const invalid of [
  {...changes[0],revision:'old'},
  {...changes[0],allocations:[{...changes[0].allocations[0],effectiveFrom:asOf}]},
  {...changes[0],allocations:[{...changes[0].allocations[0],id:bookings[1].id,revision:bookings[1].revision}]},
  {...changes[0],tasks:[{...changes[0].tasks[0],revision:'old'}]}
 ])await cmd('projectScenario:preview',{asOf,changes:[invalid]},owner,409)
 await cmd('projectScenario:preview',{asOf,changes:[{...changes[0],allocations:[{...changes[0].allocations[0],dailySeconds:-1}]}]},owner,400)
 const selection={...prepared,asOf,selectedIds:[projects[0].id]},selected=await cmd('projectScenario:preview',selection)
 const approval={...selection,key:randomUUID(),fingerprint:selected.fingerprint,reason:'Approve Acorn discovery scope only'}
 const adopted=await cmd('projectScenario:adopt',approval);assert.deepEqual(await cmd('projectScenario:adopt',approval),adopted)
 await cmd('change:review',{...pending,outcome:'approved',reason:'Changed work cannot approve stale inputs'},reviewer.cookie,409)
 const after=await read()
 assert.equal(after.data.engagements.find(e=>e.id===projects[0].id).value.scope,'Focused discovery')
 assert.deepEqual(after.data.engagements.find(e=>e.id===projects[1].id),before.engagements.find(e=>e.id===projects[1].id))
 assert.deepEqual(after.data.budgets.find(b=>b.id===budgets[0].id),before.budgets.find(b=>b.id===budgets[0].id),'Prior terms remain intact')
 const terms=after.data.budgets.filter(b=>b.value.engagementId===projects[0].id&&b.id!==budgets[0].id)
 assert.equal(terms.length,1);assert.equal(terms[0].value.status,'approved');assert.equal(terms[0].value.amountMinor,100000)
 assert.equal(after.data.tasks.find(t=>t.id===tasks[0].id).value.remainingSeconds,3*3600)
 assert.deepEqual(after.data.tasks.find(t=>t.id===tasks[1].id),before.tasks.find(t=>t.id===tasks[1].id))
 const historical=after.data.staffing.find(s=>s.id===bookings[0].id),future=after.data.staffing.find(s=>s.value.engagementId===projects[0].id&&s.id!==bookings[0].id)
 assert.equal(historical.value.to,asOf);assert.equal(historical.value.dailySeconds,2*3600)
 assert.equal(future.value.from,day(1));assert.equal(future.value.to,day(3));assert.equal(future.value.dailySeconds,3600)
 assert.deepEqual(after.data.staffing.find(s=>s.id===bookings[1].id),before.staffing.find(s=>s.id===bookings[1].id))
 for(const p of selected.scenario.projects) {
  const actual=after.forecast.engagements.find(e=>e.engagementId===p.engagementId)
  for(const key of ['etcCostMinor','eacCostMinor','eacFeesMinor','marginMinor'])assert.equal(actual[key],p[key],`FINANCE-003 adopted scope ${key}`)
 }
 const record=after.data.projectScenarios.find(s=>s.id===prepared.id)
 assert.deepEqual(record.value.approvedComparison.scenario,selected.scenario);assert.equal(record.value.adoptionReason,approval.reason)
 const history=await(await request(`/api/gauge/history/engagements/${projects[0].id}`,owner)).json()
 assert(history.history.some(r=>r.value.scope==='Full discovery and delivery'))
 // Fixed-fee scope cannot erase approved milestones; extra unscheduled fees are
 // explicitly incomplete instead of invented cash or a false margin.
 const fixed=await cmd('save:engagements',{name:'Acorn fixed scope',clientId:client.id,leadId:person.id,members:[person.id],scope:'Fixed delivery',timezone:'UTC'})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:fixed.id,mode:'fixed',amountMinor:50000,effortSeconds:3600,roundingSeconds:60,reason:'Agreed fixed fee'}))
 await cmd('milestone:approve',await cmd('save:milestones',{engagementId:fixed.id,name:'Delivery',amountMinor:50000,due:day(3)}))
 const fixedChange={type:'scope',...fixed,scope:'Additional delivery',terms:{mode:'fixed',amountMinor:70000,effortSeconds:7200,roundingSeconds:60,reason:'Extra scope'}}
 const incomplete=await cmd('projectScenario:preview',{asOf,changes:[fixedChange]})
 assert.equal(incomplete.scenario.projects[0].complete,false);assert.equal(incomplete.scenario.projects[0].marginMinor,null)
 assert.equal(incomplete.scenario.projects[0].unscheduledMinor,20000);assert.equal(incomplete.scenario.cash.months.reduce((n,m)=>n+m.invoicesMinor,0),50000)
 assert(incomplete.scenario.projects[0].incomplete.some(x=>x.includes('no approved milestone')))
 await cmd('projectScenario:preview',{asOf,changes:[{...fixedChange,terms:{...fixedChange.terms,amountMinor:40000}}]},owner,409)
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 try {
  await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000});await page.goto(`${h.origin}/app/engagements?edit=${projects[0].id}`)
   assert.match(await page.locator('main').innerText(),/Focused discovery/)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Scope fits ${width}`)
   if(process.env.GAUGE_SCENARIO_SHOTS){await mkdir(process.env.GAUGE_SCENARIO_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.GAUGE_SCENARIO_SHOTS}/scope-adopted-${width}.png`,fullPage:false})}
  }
 } finally {await context.close()}
 await acceptedChangeJourney(h,browser)
 console.log('PASS FINANCE-003 scope: two-project effort/terms/cost/margin/cash/utilization, isolated baseline, exact selected native adoption, historical and unselected preservation, fixed commitment/incomplete and invalid source checks; 1440/390')
}

// SALES-005: one explicit client decision on immutable terms, then one owner adoption.
export async function acceptedChangeJourney(h,browser){
 const {cmd,request,owner}=h,asOf=new Date().toISOString().slice(0,10),day=n=>new Date(Date.parse(asOf)+n*86400000).toISOString().slice(0,10)
 const state=async()=>{const r=await request(`/api/gauge/state?asOf=${asOf}`,owner);assert.equal(r.status,200);return r.json()}
 const person=await cmd('save:people',{name:'Synthetic Gauge Change Lead',timezone:'UTC'})
 const client=await cmd('save:clients',{name:'Synthetic Gauge Change Client'})
 await cmd('save:rates',{personId:person.id,service:'*',effective:day(-1),costMinor:6000,billMinor:12000})
 await cmd('save:calendars',{personId:person.id,from:asOf,to:day(4),dailySeconds:8*3600,weekdays:'0,1,2,3,4,5,6',timezone:'UTC'})
 const project=await cmd('save:engagements',{name:'Signed scope project',clientId:client.id,leadId:person.id,members:[person.id],scope:'Original delivery',timezone:'UTC'})
 const budget=await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:200000,effortSeconds:72000,roundingSeconds:60,reason:'Prior accepted terms'}))
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Prototype',from:day(1),to:day(3),remainingSeconds:21600})
 const booking=await cmd('save:staffing',{engagementId:project.id,personId:person.id,service:'Design',from:day(1),to:day(3),dailySeconds:7200,commitment:'committed'})
 const finance=await h.invite('synthetic-gauge-95501');await cmd('grant',{operatorId:finance.id,personId:person.id,role:'finance',enabled:true})
 const recipient=await h.invite('synthetic-gauge-95502'),outsider=await h.invite('synthetic-gauge-95503')
 let invitation=await cmd('client:invite-project',{engagementId:project.id,contact:'synthetic-gauge-95502@example.test',days:30,reason:'Exact project review'})
 const before=await state(),originalBudget=before.data.budgets.find(r=>r.id===budget.id),baseline=before.forecast.engagements.find(r=>r.engagementId===project.id)
 assert.equal(baseline.eacFeesMinor,72000);assert.equal(baseline.marginMinor,36000)
 const source={type:'scope',...project,scope:'Original delivery plus prototype',allocations:[{...booking,effectiveFrom:day(1),dailySeconds:14400}],tasks:[{...task,remainingSeconds:43200}],terms:{mode:'hourly',amountMinor:260000,effortSeconds:115200,roundingSeconds:60,reason:'Additional prototype'}}
 const prepare=async(change,previousId)=>{const input={asOf,changes:[change]},preview=await cmd('change:preview',input);let row=await cmd('change:prepare',{...input,fingerprint:preview.fingerprint,previousId,name:'Prototype scope change',reason:'Client requested extra work'});await cmd('change:adopt',{...row,reason:'Pending review cannot change anything'},owner,409);row=await cmd('change:review',{...row,outcome:'approved',reason:'Independent internal review'},finance.cookie);return row}
 const record=async id=>(await state()).data.projectScenarios.find(r=>r.id===id)
 const release=async row=>{const outbound=h.providerRequests.length,result=await cmd('change:release-review',{...row,contact:'synthetic-gauge-95502@example.test',description:'Review exact prototype scope, price and dates',reason:'Explicit owner release'});assert.equal(h.providerRequests.length,outbound);return result}
 let rejected=await prepare(source),released=await release(rejected),row=await record(rejected.id)
 const readPath=r=>`/api/gauge/client-changes/${r.id}/${r.value.clientReview.id}`,pagePath=r=>`/app/client-changes/${r.id}/${r.value.clientReview.id}`
 let path=readPath(row)
 assert.equal((await request(path,outsider.cookie)).status,403)
 assert.equal((await request(pagePath(row),outsider.cookie)).status,403)
 const read=await request(path,recipient.cookie);assert.equal(read.status,200);const document=await read.json()
 assert.deepEqual(document.document.scope,{before:'Original delivery',after:'Original delivery plus prototype'})
 assert.equal(document.document.terms.before.amountMinor,200000);assert.equal(document.document.terms.after.amountMinor,260000)
 assert.equal(document.document.terms.after.currency,'USD');assert.deepEqual(document.document.dates.after[0].tasks,[{id:task.id,from:day(1),to:day(3),name:'Prototype'}])
 const serialized=JSON.stringify(document);for(const field of ['costMinor','marginMinor','preparedBy','reviewReason','token_hash'])assert(!serialized.includes(field),field)
 const response=async(r,input,cookie=recipient.cookie)=>request(readPath(r),cookie,{method:'POST',headers:{origin:h.origin,'content-type':'application/json'},body:JSON.stringify(input)})
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 try{
  await context.addCookies(recipient.cookie.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(`${h.origin}/app/client-projects/${project.id}`)
   await page.getByRole('link',{name:/Review change/}).click();assert.equal(new URL(page.url()).pathname,pagePath(row))
   if(width===1440){assert.match(await page.locator('main').innerText(),/USD 2,600.00|USD 2600.00|\$2,600.00/);assert.match(await page.locator('main').innerText(),/Original delivery plus prototype/)}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Client change fits ${width}`)
   if(process.env.GAUGE_SCENARIO_SHOTS){await mkdir(process.env.GAUGE_SCENARIO_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.GAUGE_SCENARIO_SHOTS}/client-change-review-${width}.png`,fullPage:true})}
  }
  await page.selectOption('[name=outcome]','rejected');await page.fill('[name=reason]','Prototype is too large; revise it');await page.getByRole('button',{name:'Save decision'}).click()
  assert.match(await page.locator('main').innerText(),/Response saved: rejected/)
  row=await record(row.id);assert.equal(row.value.clientDecision.reason,'Prototype is too large; revise it');assert.equal(row.value.clientDecision.signature,null)
  await cmd('change:adopt',{id:row.id,revision:row.revision,reason:'Rejected work cannot be adopted'},owner,409)
  const revisionSource={...source,scope:'Original delivery plus a smaller prototype',allocations:[{...source.allocations[0],dailySeconds:10800}],tasks:[{...task,remainingSeconds:32400}],terms:{...source.terms,amountMinor:230000,effortSeconds:82800}}
  const accepted=await prepare(revisionSource,row.id),acceptedRelease=await release(accepted),acceptedRow=await record(accepted.id)
  assert.equal((await request(path,recipient.cookie)).status,409,'Superseded rejection is never a current acceptance door')
  const exact={key:randomUUID(),revision:acceptedRow.revision,outcome:'accepted',reason:'Smaller prototype and exact terms accepted',signatureName:'Synthetic Gauge Sponsor',consent:true}
  assert.equal((await response(acceptedRow,{...exact,consent:false})).status,400)
  assert.equal((await response(acceptedRow,{...exact,signatureName:''})).status,400)
  assert.equal((await response(acceptedRow,{...exact,revision:'stale'})).status,409)
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(h.origin+pagePath(acceptedRow))
   assert.equal((await page.locator('[name=revision]').inputValue()),acceptedRow.revision)
   if(process.env.GAUGE_SCENARIO_SHOTS)await page.screenshot({path:`${process.env.GAUGE_SCENARIO_SHOTS}/client-change-accept-${width}.png`,fullPage:true})
  }
  await page.selectOption('[name=outcome]','accepted');await page.fill('[name=reason]',exact.reason);await page.fill('[name=signatureName]',exact.signatureName);await page.check('[name=consent]');await page.getByRole('button',{name:'Save decision'}).click()
  assert.match(await page.locator('main').innerText(),/Response saved: accepted/)
  const signed=await record(accepted.id),decision=signed.value.clientDecision
  assert.equal(decision.reason,exact.reason);assert.equal(decision.operatorId,recipient.id);assert.equal(decision.signature.name,exact.signatureName);assert.equal(decision.signature.method,'native-email-confirmed');assert.equal(decision.signature.consent,true)
  assert.equal(decision.signature.documentDigest,signed.value.clientReview.documentDigest);assert.equal(decision.documentDigest,documentDigest(signed.value.clientReview.document));assert.equal(decision.fingerprint,signed.value.fingerprint)
  assert.equal(decision.changeRevision,acceptedRow.revision);assert.equal(signed.value.previousId,row.id)
  const pending=await state();assert.equal(pending.forecast.engagements.find(r=>r.engagementId===project.id).eacFeesMinor,72000,'Pending and rejected work never changes forecast')
  for(const kind of ['engagements','budgets','tasks','staffing'])assert.deepEqual(pending.data[kind],before.data[kind],`Consent alone changes no ${kind}`)
  await cmd('change:adopt',{id:signed.id,revision:signed.revision,reason:'Finance cannot adopt'},finance.cookie,403)
  await cmd('change:adopt',{id:signed.id,revision:signed.revision,reason:'Recipient cannot adopt'},recipient.cookie,403)
  const adoption={id:signed.id,revision:signed.revision,key:randomUUID(),reason:'Owner adopts exactly the signed smaller increment'}
  const [a,b]=await Promise.all([cmd('change:adopt',adoption),cmd('change:adopt',adoption)]);assert.deepEqual(a,b)
  await cmd('change:adopt',{...adoption,key:randomUUID()},owner,409)
  await cmd('change:adopt',{...adoption,reason:'Changed reuse'},owner,409)
  const after=await state(),forecast=after.forecast.engagements.find(r=>r.engagementId===project.id)
  assert.equal(forecast.eacFeesMinor,108000);assert.equal(forecast.marginMinor,54000);assert.equal(forecast.eacFeesMinor-baseline.eacFeesMinor,36000)
  assert.equal(after.data.engagements.find(r=>r.id===project.id).value.scope,revisionSource.scope)
  assert.equal(after.data.staffing.find(r=>r.id===booking.id).value.dailySeconds,10800);assert.equal(after.data.tasks.find(r=>r.id===task.id).value.remainingSeconds,32400)
  assert.deepEqual(after.data.budgets.find(r=>r.id===budget.id),originalBudget)
  const adoptedBudgets=after.data.budgets.filter(r=>r.value.engagementId===project.id&&r.id!==budget.id);assert.equal(adoptedBudgets.length,1);assert.equal(adoptedBudgets[0].value.amountMinor,230000);assert.equal(adoptedBudgets[0].value.acceptedChange.changeId,signed.id);assert.equal(adoptedBudgets[0].value.acceptedChange.priorTermsId,budget.id)
  assert.deepEqual((await record(row.id)).value.clientDecision,row.value.clientDecision)
  assert.equal(after.data.invoices.length,before.data.invoices.length);assert.equal(after.data.packets.length,before.data.packets.length)
  const audit=await(await request(`/api/gauge/audit?recordId=${signed.id}`,owner)).json();assert.equal(audit.entries.filter(r=>r.action==='change:adopt').length,1)
  assert(audit.entries.some(r=>r.action==='change:respond'&&r.actor.id===recipient.id&&r.result.clientDecision.reason===exact.reason))
  assert.equal((await request(readPath(signed),recipient.cookie)).status,200,'Signed adopted terms remain inspectable')
  await cmd('client:revoke-project',{...invitation,reason:'Project access ends now'})
  assert.equal((await request(readPath(signed),recipient.cookie)).status,403,'Portal withdrawal stops the keyless change door')
  assert.equal((await request(readPath(signed),recipient.cookie,{headers:{'x-gauge-review-token':acceptedRelease.token}})).status,200,'Separately released exact key remains independently scoped')
  await cmd('change:revoke-review',{id:a.id,revision:a.revision,reviewId:signed.value.clientReview.id,reason:'End separately released review'})
  assert.equal((await request(readPath(signed),recipient.cookie,{headers:{'x-gauge-review-token':acceptedRelease.token}})).status,403)

  console.log('PASS SALES-005 portal exact revision, rejection reason, signed consent, prior terms, independent forecast increment, once-only owner adoption and private-field refusals')
 }finally{await context.close()}
}
const documentDigest=value=>createHash('sha256').update(canonical(value)).digest('hex')
const canonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value)
