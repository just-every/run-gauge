import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {createServer} from 'node:http'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {recordMilestoneAcceptance,harness} from './gauge-harness.mjs'

// BOUNDARY-001: actual built-worker forms/downloads and a test-only network-edge
// accounting receiver. The app never substitutes a simulated provider outcome.
const h=await harness({currency:'USD',timezone:'America/New_York'})
let browser,receiver
try{
 const {cmd,state,request,owner}=h,zone='America/New_York'
 const lead=await cmd('save:people',{name:'Morgan Operations',timezone:zone}),worker=await cmd('save:people',{name:'Avery Designer',timezone:zone}),unknown=await cmd('save:people',{name:'Casey Contractor',timezone:zone,contractor:true})
 const staff=await h.invite('handoff-worker'),manager=await h.invite('handoff-lead'),finance=await h.invite('handoff-finance'),agent=await h.invite('handoff-agent')
 for(const [user,role,person] of [[staff,'staff',worker],[manager,'lead',lead],[finance,'finance',lead]])await cmd('grant',{operatorId:user.id,personId:person.id,role,enabled:true})
 const client=await cmd('save:clients',{name:'Cascade Studio'}),project=await cmd('save:engagements',{name:'October specialist handoff',clientId:client.id,leadId:lead.id,members:[worker.id,unknown.id],scope:'Approved services and actuals for the accountant',timezone:zone})
 await cmd('grant',{operatorId:agent.id,role:'agent',enabled:true,purpose:'billing',engagementIds:[project.id]})
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Identity delivery',remainingSeconds:7200})
 const terms=await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:500000,effortSeconds:7200,roundingSeconds:1,reason:'Approved October services'});await cmd('budget:approve',terms)
 await cmd('save:rates',{personId:worker.id,service:'Design',effective:'2026-01-01',costMinor:5000,billMinor:15000})
 const input={personId:worker.id,engagementId:project.id,taskId:task.id,service:'Design',timezone:zone,notes:'Actual approved campaign delivery',billable:true,start:'2026-10-06T09:00:00-04:00',end:'2026-10-06T10:00:00-04:00'}
 let known=await cmd('time:save',input,staff.cookie);known=await cmd('time:submit',known,staff.cookie);await cmd('time:approve',known,manager.cookie)
 let missing=await cmd('time:save',{...input,personId:unknown.id,service:'Specialist research',notes:'Declared cost not yet supplied'});missing=await cmd('time:submit',missing);await cmd('time:approve',missing,manager.cookie)
 let expense=await cmd('expense:save',{engagementId:project.id,personId:worker.id,taskId:task.id,date:'2026-10-06',description:'Approved project materials',amountMinor:1250,reimbursable:true},staff.cookie);expense=await cmd('expense:submit',expense,staff.cookie);await cmd('expense:approve',expense,manager.cookie)
 let packet=await cmd('packet:create',{engagementId:project.id,title:'October approved billing inputs',sources:[`time:${known.id}`,`expenses:${expense.id}`]});packet=await cmd('packet:approve',packet)
 let adjustment=await cmd('packet:adjust',{...packet,sourceId:known.id,correctedAmountMinor:12000,reason:'Reviewed commercial reduction'});await cmd('packet:approve',adjustment)
 const before=await state(),snapshots=Object.fromEntries(['time','expenses','packets'].map(kind=>[kind,before.data[kind]]))
 const sources=[...before.data.time.map(r=>({kind:'time',id:r.id,revision:r.revision})),...before.data.expenses.map(r=>({kind:'expenses',id:r.id,revision:r.revision})),...before.data.packets.map(r=>({kind:'packets',id:r.id,revision:r.revision}))]
 await cmd('handoff:prepare',{recipient:'Accountant test receiver',purpose:'accounting',reason:'Stale selected revision',sources:[{...sources[0],revision:'stale'}]},owner,409)
 await cmd('handoff:prepare',{recipient:'Accountant test receiver',purpose:'accounting',reason:'No exact source revision',sources:[{kind:sources[0].kind,id:sources[0].id}]},owner,400)
 await cmd('handoff:prepare',{recipient:'Accountant test receiver',purpose:'accounting',reason:'Duplicate source review',sources:[sources[0],sources[0]]},owner,400)
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 await context.addCookies(finance.cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
 const capture=async (name,focus=page.locator('#specialist-handoffs'))=>{if(!process.env.GAUGE_HANDOFF_SHOTS)return;await mkdir(process.env.GAUGE_HANDOFF_SHOTS,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}`);await focus.scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.GAUGE_HANDOFF_SHOTS}/${name}-${width}.png`,fullPage:true});await page.screenshot({path:`${process.env.GAUGE_HANDOFF_SHOTS}/${name}-viewport-${width}.png`})}}
 await page.goto(h.origin+'/app/billing')
 const form=page.locator('form').filter({has:page.locator('[name=action][value="handoff:prepare"]')})
 await form.locator('[name=recipient]').fill('Cascade accountant · October inputs');await form.locator('[name=purpose]').selectOption('accounting');await form.locator('[name=reason]').fill('Finance reviewed exact approved labor, expenses and billing-preparation sources')
 for(const box of await form.locator('[name=handoffSources]').all())await box.check()
 await capture('BOUNDARY-001-prepare');await form.getByRole('button',{name:'Prepare approved inputs',exact:true}).click()
 let handoff=(await state()).data.specialistHandoffs[0]
 assert(handoff);assert.equal(handoff.value.status,'awaiting-result');assert.equal(handoff.value.approvedBy,finance.id)
 const download=await request(`/api/gauge/handoffs/${handoff.id}`,finance.cookie);assert.equal(download.status,200)
 const artifact=await download.text();assert.equal(createHash('sha256').update(artifact).digest('hex'),handoff.value.artifactHash)
 const parsed=JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'],{input:artifact,encoding:'utf8'}))
 assert.equal(parsed.length,6);assert.equal(parsed.filter(r=>r.category==='labor').length,2)
 assert.equal(parsed.find(r=>r.sourceId===known.id&&r.category==='labor').amountMinor,'5000')
 assert.equal(parsed.find(r=>r.sourceId===missing.id).amountKnown,'false');assert.equal(parsed.find(r=>r.sourceId===missing.id).amountMinor,'')
 assert.equal(parsed.filter(r=>r.category==='expense').reduce((n,r)=>n+Number(r.amountMinor),0),1250)
 assert.equal(parsed.filter(r=>r.category==='revenue-input').reduce((n,r)=>n+Number(r.amountMinor),0),13250)
 assert(parsed.some(r=>r.amountMinor==='-3000'),'Signed adjustment stays a negative input, never positive revenue')
 for(const source of sources)assert(parsed.some(r=>r.sourceId===source.id&&r.sourceRevision===source.revision))
 const labor=handoff.value.controlTotals.find(t=>t.category==='labor');assert.equal(labor.amountMinor,null);assert.equal(labor.knownAmountMinor,5000);assert.equal(labor.unknownAmountCount,1);assert.equal(labor.durationSeconds,7200)
 assert.equal((await request(`/api/gauge/handoffs/${handoff.id}`)).status,401)
 assert.equal((await request('/app/billing',finance.cookie)).status,200);await capture('BOUNDARY-001-awaiting-result',page.locator('#specialist-handoffs article').last())
 // Test receiver consumes the downloaded bytes, independently of app internals.
 receiver=createServer(async(req,res)=>{const chunks=[];for await(const part of req)chunks.push(part);const csv=Buffer.concat(chunks).toString();assert.equal(csv,artifact);const received=JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'],{input:csv,encoding:'utf8'}));res.setHeader('content-type','application/json');res.end(JSON.stringify({handoffId:received[0].handoffId,artifactHash:createHash('sha256').update(csv).digest('hex'),lines:received.map(r=>({id:r.id,status:r.amountKnown==='false'?'rejected':'accepted',...(r.amountKnown==='false'?{reason:'Supply the declared contractor cost'}:{}),currency:r.currency,amountMinor:r.amountKnown==='false'?null:Number(r.amountMinor),durationSeconds:r.durationSeconds===''?null:Number(r.durationSeconds)}))}))})
 await new Promise(resolve=>receiver.listen(0,'127.0.0.1',resolve))
 const outcome=await(await fetch(`http://127.0.0.1:${receiver.address().port}`,{method:'POST',body:artifact})).json()
 const badResults=[{...outcome,artifactHash:'wrong'}, {...outcome,lines:outcome.lines.slice(1)}, {...outcome,lines:outcome.lines.map((l,i)=>i===1?outcome.lines[0]:l)}, {...outcome,lines:outcome.lines.map((l,i)=>i?l:{...l,amountMinor:123})}, {...outcome,lines:outcome.lines.map(l=>l.status==='rejected'?{...l,reason:''}:l)}]
 for(const result of badResults){const r=await h.post('/api/gauge/command',{action:'handoff:record-result',key:randomUUID(),id:handoff.id,revision:handoff.revision,result},finance.cookie);assert([400,409].includes(r.status));assert.equal((await state()).data.specialistHandoffs[0].revision,handoff.revision,'Malformed receiver results change no data')}
 const resultForm=page.locator('form').filter({has:page.locator('[name=action][value="handoff:record-result"]')})
 await resultForm.locator('[name=file]').setInputFiles({name:'accountant-receiver.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(outcome))})
 await resultForm.getByRole('button',{name:'Record result',exact:true}).click()
 const recorded=(await state()).data.specialistHandoffs[0]
 assert.equal(recorded.value.result.acceptedCount,5);assert.equal(recorded.value.result.rejectedCount,1);assert.equal(recorded.value.status,'recorded-with-rejections')
 assert.deepEqual(recorded.value.result.rejectedTotals.map(t=>[t.category,t.currency,t.amountMinor,t.unknownAmountCount]),[['labor','USD',null,1]])
 await capture('BOUNDARY-001-reconciled-rejections',page.locator('#specialist-handoffs article').last())
 const section=page.locator('#specialist-handoffs');assert((await section.innerText()).includes(outcome.lines.find(l=>l.status==='rejected').reason),'The receiver rejection remains actionable on the page')
 assert.equal(recorded.value.delivery,'manual-export');assert.equal(recorded.value.financialEffect,'none');assert.equal(recorded.value.result.verification,'user-recorded')
 assert.equal(await(await request(`/api/gauge/handoffs/${handoff.id}`,owner)).text(),artifact,'Recording outcomes never changes the approved artifact')
 await cmd('handoff:record-result',{...recorded,result:outcome},finance.cookie,409)
 // Native request keys make exact retries safe, while another result is refused.
 const payroll=await cmd('handoff:prepare',{recipient:'Payroll test receiver',purpose:'payroll',reason:'Approved labor input, never wages or tax filing',sources:sources.filter(s=>s.kind==='time')})
 const payrollRow=(await state()).data.specialistHandoffs.find(r=>r.id===payroll.id),result={handoffId:payroll.id,artifactHash:payrollRow.value.artifactHash,lines:payrollRow.value.lines.map(l=>({id:l.id,status:'accepted',currency:l.currency,amountMinor:l.amountMinor,durationSeconds:l.durationSeconds}))}
 const payload={action:'handoff:record-result',key:randomUUID(),...payroll,result}
 const first=await(await h.post('/api/gauge/command',payload,owner)).json();assert.deepEqual(await(await h.post('/api/gauge/command',payload,owner)).json(),first)
 for(const user of [staff,manager,agent]){
  assert.equal((await state(user.cookie)).data.specialistHandoffs.length,0)
  assert.equal((await request(`/api/gauge/handoffs/${handoff.id}`,user.cookie)).status,403)
  assert.equal((await request(`/api/gauge/history/specialistHandoffs/${handoff.id}`,user.cookie)).status,403)
  await cmd('handoff:prepare',{recipient:'Unauthorized',purpose:'accounting',reason:'Refused',sources},user.cookie,403)
  await cmd('handoff:record-result',{...recorded,result:outcome},user.cookie,403)
 }
 await cmd('grant',{operatorId:finance.id,personId:lead.id,role:'finance',enabled:false})
 assert.equal((await request(`/api/gauge/handoffs/${handoff.id}`,finance.cookie)).status,403)
 const after=await state();for(const kind of ['time','expenses','packets'])assert.deepEqual(after.data[kind],snapshots[kind],'Handoff outcomes do not perform accounting, payroll, tax or source mutations')
 const history=await(await request(`/api/gauge/history/specialistHandoffs/${handoff.id}`,owner)).json();assert(history.history.some(r=>r.value.status==='awaiting-result'&&!r.value.result))
 await expensePolicyJourney(h,page)
 await revenueScheduleJourney(h,page)
 console.log('PASS BOUNDARY-001: exact approved labor/expense/revenue input export, unknown and signed reconciliation, real test-receiver acceptance/rejection, honest labels, immutable results, replay and scoped privacy')
}finally{await browser?.close();if(receiver)await new Promise(resolve=>receiver.close(resolve));await h.dispose()}


// Reviewed operational recognition through native commands and the existing handoff page.
async function revenueScheduleJourney(h,page){
 const {cmd,owner,request,state}=h
 const worker=await cmd('save:people',{name:'Journal delivery lead',timezone:'America/New_York'})
 const client=await cmd('save:clients',{name:'Journal prepaid client'})
 const project=async(name,mode='fixed')=>{
  const engagement=await cmd('save:engagements',{name,clientId:client.id,leadId:worker.id,members:[worker.id],scope:'Accountant-reviewed delivery',timezone:'America/New_York'})
  const budget=await cmd('budget:approve',await cmd('save:budgets',{engagementId:engagement.id,mode,amountMinor:1200000,effortSeconds:360000,roundingSeconds:60,reason:'Signed delivery terms'}))
  return {engagement,budget}
 }
 const accounts={receivable:'1100 Receivable',deferred:'2200 Deferred',unbilled:'1150 Unbilled',revenue:'4000 Service revenue'}
 const schedule=async(p,mode)=>cmd('revenue:schedule',{engagementId:p.engagement.id,budgetId:p.budget.id,budgetRevision:p.budget.revision,mode,accounts,accountant:'Appointed synthetic accountant',policy:'Monthly delivery approved by finance; operational inputs only',reason:'Owner records the accountant instruction'})
 const p=await project('Prepaid monthly delivery'),s=await schedule(p,'service-delivery')
 await schedule(p,'service-delivery').then(()=>assert.fail('A project cannot obtain a second recognition schedule'),e=>assert.match(e.message,/already has a revenue schedule/))
 const charge=await cmd('fixed:approve',await cmd('fixed:prepare',{engagementId:p.engagement.id,budgetId:p.budget.id,budgetRevision:p.budget.revision,chargeType:'deposit',cumulativeBasisPoints:10000,name:'Prepaid fixed delivery',date:'2026-09-30',reason:'Prepaid SOW'}))
 const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:p.engagement.id,title:'Prepaid full project',sources:[`fixedCharges:${charge.id}`]}))
 await cmd('invoice:issue',{...packet,issueDate:'2026-09-30',dueDate:'2026-10-30',billTo:'Prepaid client',remitTo:'Agency account',reference:'Prepaid monthly delivery'})
 const prepare=(date,amountMinor)=>cmd('revenue:prepare',{scheduleId:s.id,scheduleRevision:s.revision,date,amountMinor,evidence:'Reviewed monthly delivery report'})
 const octoberDraft=await prepare('2026-10-31',400000)
 const october=await cmd('revenue:approve',{...octoberDraft,reason:'Finance reviewed October delivery and balanced accounts'})
 const row=async(id)=>(await state()).data.revenueRecognitions.find(r=>r.id===id)
 const first=(await row(october.id)).value
 assert.deepEqual(first.balances,{billedMinor:1200000,recognizedMinor:400000,deferredMinor:800000,unbilledMinor:0})
 assert.deepEqual(first.journal.map(l=>[l.account,l.debitMinor,l.creditMinor]),[[accounts.receivable,1200000,0],[accounts.deferred,0,800000],[accounts.revenue,0,400000]])
 await prepare('2026-10-31',400000).then(()=>assert.fail('Monthly delivery cannot be recognized twice'),e=>assert.match(e.message,/already reserved or recognized/))
 await cmd('revenue:approve',{...october,reason:'Cannot approve twice'},owner,409)
 const stalePolicyDraft=await prepare('2026-11-30',500000),originalOctober=await row(october.id)
 const policyRecorder=await h.invite('synthetic-gauge-5603');await cmd('grant',{operatorId:policyRecorder.id,personId:worker.id,role:'finance',enabled:true})
 const policyInput={...s,accountant:'Appointed synthetic accountant',policy:'Revised accountant monthly-delivery instruction',reason:'Owner records revised accountant evidence without rewriting prior journals'}
 await cmd('revenue:policy',policyInput,policyRecorder.cookie,403)
 const revisedPolicy=await cmd('revenue:policy',{...policyInput,amountMinor:9999999,accounts:{revenue:'Unapproved account'}})
 const policyHistory=await(await request('/api/gauge/history/revenueSchedules/'+s.id,owner)).json()
 assert(policyHistory.history.some(r=>r.revision===s.revision&&r.value.policy==='Monthly delivery approved by finance; operational inputs only'),'The original accountant policy remains in audited revision history')
 const currentPolicy=(await state()).data.revenueSchedules.find(r=>r.id===s.id)
 assert.equal(currentPolicy.value.amountMinor,1200000);assert.deepEqual(currentPolicy.value.accounts,accounts,'Policy updates cannot change approved terms or journal accounts')
 await cmd('revenue:policy',policyInput,owner,409)
 await cmd('revenue:approve',{...stalePolicyDraft,reason:'Old policy draft cannot approve'},owner,409)
 await cmd('revenue:withdraw',{...stalePolicyDraft,reason:'Reprepare under the revised accountant policy'})
 Object.assign(s,revisedPolicy)
 assert.deepEqual(await row(october.id),originalOctober,'Policy revision preserves the approved original journal')
 const november=await cmd('revenue:approve',{...await prepare('2026-11-30',500000),reason:'Reviewed November delivery'})
 assert.equal((await row(november.id)).value.policy,policyInput.policy)
 assert.deepEqual((await row(november.id)).value.balances,{billedMinor:1200000,recognizedMinor:900000,deferredMinor:300000,unbilledMinor:0})
 await cmd('revenue:prepare',{scheduleId:s.id,scheduleRevision:s.revision,date:'2026-12-31',amountMinor:400000,evidence:'Over schedule value'},owner,409)
 const december=await cmd('revenue:approve',{...await prepare('2026-12-31',300000),reason:'Reviewed final delivery'})
 assert.equal((await row(december.id)).value.balances.deferredMinor,0)
 // A journal draft freezes its invoice and prior-recognition basis. A competing approval makes it stale.
 const timeProject=await project('Unbilled approved time','hourly'),ts=await schedule(timeProject,'time')
 const task=await cmd('save:tasks',{engagementId:timeProject.engagement.id,name:'Approved delivery',remainingSeconds:0})
 await cmd('save:rates',{personId:worker.id,service:'*',effective:'2026-01-01',billMinor:20000,costMinor:10000})
 const entries=[]
 for(const day of ['2026-10-01','2026-10-02']){
  const t=await cmd('time:approve',await cmd('time:submit',await cmd('time:save',{personId:worker.id,engagementId:timeProject.engagement.id,taskId:task.id,service:'Delivery',notes:'Approved work',timezone:'America/New_York',billable:true,start:day+'T09:00:00-04:00',end:day+'T10:00:00-04:00'})))
  entries.push(t)
 }
 const timeDrafts=[]
 for(const t of entries)timeDrafts.push(await cmd('revenue:prepare',{scheduleId:ts.id,scheduleRevision:ts.revision,date:'2026-10-31',sourceId:t.id,sourceRevision:t.revision,evidence:'Reviewed approved time'}))
 const timeRecognition=await cmd('revenue:approve',{...timeDrafts[0],reason:'Review approved time economics'})
 assert.equal((await row(timeRecognition.id)).value.balances.unbilledMinor,20000)
 await cmd('revenue:approve',{...timeDrafts[1],reason:'Stale prior journal'},owner,409)
 await cmd('revenue:withdraw',{...timeDrafts[1],reason:'Reprepare against the new approved balance'})
 const second=await cmd('revenue:prepare',{scheduleId:ts.id,scheduleRevision:ts.revision,date:'2026-10-31',sourceId:entries[1].id,sourceRevision:entries[1].revision,evidence:'Reviewed current prior balance'})
 await cmd('revenue:approve',{...second,reason:'Reviewed refreshed journal'})
 // Later billing clears unbilled value without inventing another delivery.
 const hourlyPacket=await cmd('packet:approve',await cmd('packet:create',{engagementId:timeProject.engagement.id,title:'Approved October work',sources:entries.map(t=>'time:'+t.id)}))
 const unbilledOriginal=await row(second.id)
 const invoice=await cmd('invoice:issue',{...hourlyPacket,issueDate:'2026-11-01',dueDate:'2026-12-01',billTo:'Journal prepaid client',remitTo:'Agency',reference:'Approved hourly delivery'})
 const reconcileInput={scheduleId:ts.id,scheduleRevision:ts.revision,journalType:'reconciliation',date:'2026-11-01',evidence:'Issued invoice reconciled to previously approved time'}
 const reconciled=await cmd('revenue:approve',{...await cmd('revenue:prepare',reconcileInput),reason:'Reviewed invoice without new delivery'})
 const refreshed=(await row(reconciled.id)).value
 assert.deepEqual(refreshed.balances,{billedMinor:40000,recognizedMinor:40000,deferredMinor:0,unbilledMinor:0})
 assert.equal(refreshed.amountMinor,0)
 assert.deepEqual(refreshed.journal.map(l=>[l.account,l.debitMinor,l.creditMinor]),[[accounts.receivable,40000,0],[accounts.unbilled,0,40000]])
 assert(refreshed.sources.some(r=>r.kind==='invoices'&&r.id===invoice.id&&r.revision===invoice.revision))
 assert.deepEqual(await row(second.id),unbilledOriginal,'A reconciliation preserves the approved delivery snapshot')
 await cmd('revenue:prepare',reconcileInput,owner,409)
 await cmd('revenue:prepare',{...reconcileInput,date:'2026-11-02'},owner,409)
 // A signed correction reverses only the linked delivery; the original remains immutable.
 const correctedOriginal=await row(december.id)
 const correctionInput={scheduleId:s.id,scheduleRevision:s.revision,journalType:'correction',date:'2027-01-01',sourceId:december.id,sourceRevision:december.revision,correctedAmountMinor:200000,evidence:'Accountant reviewed final delivery reduction'}
 await cmd('revenue:prepare',{...correctionInput,sourceRevision:'stale'},owner,409)
 await cmd('revenue:prepare',{...correctionInput,correctedAmountMinor:400000},owner,409)
 const reviewer=await h.invite('journal-correction-reviewer');await cmd('grant',{operatorId:reviewer.id,personId:worker.id,role:'finance',enabled:true})
 const nonFinance=await h.invite('synthetic-gauge-5601');await cmd('grant',{operatorId:nonFinance.id,personId:worker.id,role:'lead',enabled:true})
 const correctionDraft=await cmd('revenue:prepare',correctionInput)
 await cmd('revenue:approve',{...correctionDraft,reason:'A correction always needs an independent reviewer'},owner,403)
 await cmd('revenue:approve',{...correctionDraft,reason:'A non-finance role cannot review a correction'},nonFinance.cookie,403)
 const manualBefore=await state(),networkBefore=h.providerRequests.length
 assert.equal((await row(correctionDraft.id)).value.status,'draft')
 assert.equal((await h.scheduled(Date.parse('2027-01-02T12:00:00.000Z'))).status,200,'The scheduler executes without posting journals')
 const manualAfter=await state()
 for(const kind of ['revenueRecognitions','specialistHandoffs','providerJobs'])assert.deepEqual(manualAfter.data[kind],manualBefore.data[kind],'Scheduled work never approves, exports or posts operational journals')
 assert.equal(h.providerRequests.length,networkBefore,'No provider call is made by scheduled operational recognition')
 const policy=await cmd('approval:limit',{reviewAboveMinor:50000,reason:'Require an independent reviewer for sensitive revenue corrections'})
 await cmd('revenue:approve',{...correctionDraft,reason:'Preparer cannot approve above the review limit'},owner,403)
 const correction=await cmd('revenue:approve',{...correctionDraft,reason:'Independent finance review of the delivery correction'},reviewer.cookie)
 await cmd('approval:limit',{...policy,reviewAboveMinor:null,reason:'End the synthetic correction review limit'})
 assert.equal(h.providerRequests.length,networkBefore,'Journal approval makes no provider call')
 const corrected=(await row(correction.id)).value
 assert.equal(corrected.amountMinor,-100000)
 assert.deepEqual(corrected.balances,{billedMinor:1200000,recognizedMinor:1100000,deferredMinor:100000,unbilledMinor:0})
 assert.deepEqual(corrected.journal.map(l=>[l.account,l.debitMinor,l.creditMinor]),[[accounts.deferred,0,100000],[accounts.revenue,100000,0]])
 assert.deepEqual(await row(december.id),correctedOriginal)
 assert.equal(corrected.sourceId,december.id);assert.equal(corrected.sourceRevision,december.revision)
 await cmd('revenue:prepare',correctionInput,owner,409)
 await cmd('revenue:prepare',{...correctionInput,sourceId:correction.id,sourceRevision:correction.revision},owner,409)
 await cmd('revenue:prepare',{...correctionInput,scheduleId:ts.id,scheduleRevision:ts.revision,sourceId:timeRecognition.id,sourceRevision:timeRecognition.revision},owner,400)
 const signedHandoff=await cmd('handoff:prepare',{recipient:'Appointed accountant',purpose:'accounting',reason:'Reviewed reconciliation and signed delivery correction',sources:[reconciled,correction].map(r=>({kind:'revenueRecognitions',id:r.id,revision:r.revision}))})
 const signedRows=JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'],{input:await(await request('/api/gauge/handoffs/'+signedHandoff.id,owner)).text(),encoding:'utf8'}))
 assert.deepEqual(signedRows.map(l=>Number(l.amountMinor)),[0,-100000])
 assert.equal(JSON.parse(signedRows[1].details).sourceId,december.id)
 const signed=(await state()).data.specialistHandoffs.find(r=>r.id===signedHandoff.id)
 await cmd('handoff:record-result',{...signedHandoff,result:{handoffId:signed.id,artifactHash:signed.value.artifactHash,lines:signed.value.lines.map(l=>({id:l.id,status:'accepted',currency:l.currency,amountMinor:l.amountMinor,durationSeconds:null}))}})
 assert.equal((await state()).data.specialistHandoffs.find(r=>r.id===signed.id).value.result.acceptedTotals[0].amountMinor,-100000)
 const mp=await project('Accepted milestone recognition'),ms=await schedule(mp,'milestone')
 const milestone=await cmd('milestone:approve',await cmd('save:milestones',{engagementId:mp.engagement.id,name:'Delivered handover',due:'2026-10-31',amountMinor:100000}))
 await cmd('revenue:prepare',{scheduleId:ms.id,scheduleRevision:ms.revision,date:'2026-12-02',sourceId:milestone.id,sourceRevision:milestone.revision,evidence:'Unaccepted milestone'},owner,409)
 const accepted=await recordMilestoneAcceptance(h,milestone.id)
 const md=await cmd('revenue:prepare',{scheduleId:ms.id,scheduleRevision:ms.revision,date:'2026-12-02',sourceId:accepted.id,sourceRevision:accepted.revision,evidence:'Recorded client acceptance and finance authorization'})
 const mr=await cmd('revenue:approve',{...md,reason:'Reviewed accepted milestone value'})
 assert.equal((await row(mr.id)).value.amountMinor,100000)
 const handoff=await cmd('handoff:prepare',{recipient:'Appointed accountant',purpose:'accounting',reason:'Reviewed balanced monthly operational journals',sources:[october,november,december].map(r=>({kind:'revenueRecognitions',id:r.id,revision:r.revision}))})
 const artifact=await request('/api/gauge/handoffs/'+handoff.id,owner),bytes=await artifact.text()
 assert.equal(artifact.status,200)
 const parsed=JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'],{input:bytes,encoding:'utf8'}))
 assert.deepEqual(parsed.map(l=>Number(l.amountMinor)),[400000,500000,300000])
 for(const line of parsed){const details=JSON.parse(line.details);assert.equal(details.journal.reduce((n,l)=>n+l.debitMinor-l.creditMinor,0),0);assert.equal(line.category,'recognition');assert.match(details.basis,/not provider-verified/)}
 const hr=(await state()).data.specialistHandoffs.find(r=>r.id===handoff.id)
 const result={handoffId:hr.id,artifactHash:hr.value.artifactHash,lines:hr.value.lines.map((l,i)=>({id:l.id,status:i===1?'rejected':'accepted',...(i===1?{reason:'Accountant requests November delivery detail'}:{}),currency:l.currency,amountMinor:l.amountMinor,durationSeconds:null}))}
 await cmd('handoff:record-result',{...handoff,result:{...result,lines:result.lines.map((l,i)=>i?l:{...l,amountMinor:1})}},owner,400)
 await cmd('handoff:record-result',{...handoff,result})
 const final=(await state()).data.specialistHandoffs.find(r=>r.id===handoff.id)
 assert.equal(final.value.result.acceptedTotals[0].amountMinor,700000);assert.equal(final.value.result.rejectedTotals[0].amountMinor,500000)
 assert.equal(final.value.result.verification,'user-recorded')
 assert.equal(await(await request('/api/gauge/handoffs/'+handoff.id,owner)).text(),bytes)
 const staff=await h.invite('journal-staff');await cmd('grant',{operatorId:staff.id,personId:worker.id,role:'staff',enabled:true})
 assert.deepEqual((await state(staff.cookie)).data.revenueRecognitions,[])
 assert.equal((await request('/api/gauge/history/revenueRecognitions/'+october.id,staff.cookie)).status,403)
 await cmd('revenue:schedule',{engagementId:p.engagement.id},staff.cookie,403)
 await cmd('revenue:approve',{...octoberDraft,reason:'Unauthorized'},staff.cookie,403)
 await page.context().clearCookies();await page.context().addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
 await page.goto(h.origin+'/app/billing')
 const section=page.locator('#specialist-handoffs')
 assert((await section.innerText()).includes('Operational revenue journals'))
 assert((await section.innerText()).includes('Accountant requests November delivery detail'))
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready)
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Revenue handoff fits '+width)
  // The existing billing screen uses text-labeled controls, including navigation and downloads.
  for(const control of await section.locator('button,a').all())assert((await control.innerText()).trim(),'Handoff controls have visible labels')
  if(process.env.GAUGE_HANDOFF_SHOTS){await mkdir(process.env.GAUGE_HANDOFF_SHOTS,{recursive:true});await section.screenshot({path:process.env.GAUGE_HANDOFF_SHOTS+'/FINANCE-005-'+width+'.png'})}
 }
 // A separate read-only accountant grant can inspect accounting exports but cannot edit time or fetch payroll.
 await cmd('time:policy',{lockThrough:'2026-08-31',reason:'Finance reviewed completed August time'})
 const closePreview=await cmd('period:preview',{month:'2026-08'})
 const closeDraft=await cmd('period:prepare',{...closePreview.input,fingerprint:closePreview.fingerprint,acknowledgeWip:true,wipReconciliation:'No August invoices or work; later WIP retained',reason:'Reviewed August operational close'})
 const closed=await cmd('period:approve',closeDraft)
 const accountant=await h.invite('journal-accountant')
 await cmd('grant',{operatorId:accountant.id,personId:worker.id,role:'accountant',enabled:true})
 const ac=await request('/api/gauge/accountant',accountant.cookie);assert.equal(ac.status,200)
 const inputs=await ac.json();assert(inputs.handoffs.some(r=>r.id===handoff.id));assert.equal(inputs.notice.includes('No authority'),true)
 assert(inputs.closes.some(r=>r.id===closed.id))
 const closeDownload=await request('/api/gauge/closes/'+closed.id,accountant.cookie);assert.equal(closeDownload.status,200);assert.equal((await closeDownload.json()).value.month,'2026-08')
 assert.equal((await request('/api/gauge/accountant',accountant.cookie,{method:'POST'})).status,405)
 assert.equal((await request('/api/gauge/handoffs/'+handoff.id,accountant.cookie)).status,200)
 const payroll=(await state()).data.specialistHandoffs.find(r=>r.value.purpose==='payroll')
 assert.equal((await request('/api/gauge/handoffs/'+payroll.id,accountant.cookie)).status,403)
 for(const path of ['/api/gauge/state','/api/gauge/audit/export','/api/gauge/archives/unknown','/api/gauge/history/time/'+entries[0].id,'/api/gauge/invoice-documents/unknown','/api/gauge/report.csv?from=2026-10-01&to=2026-10-31'])assert.equal((await request(path,accountant.cookie)).status,403,'Closed accountant read list refuses '+path)
 for(const action of ['time:save','invoice:issue','revenue:approve','grant','invite','apikey:create'])await cmd(action,{},accountant.cookie,403)
 assert.equal((await request('/app/action',accountant.cookie,{method:'POST',headers:{origin:h.origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({action:'time:save',key:randomUUID()}).toString()})).status,403)
 await page.context().clearCookies();await page.context().addCookies(accountant.cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(h.origin+'/app/review');assert.equal(await page.getByRole('heading',{name:'Accountant inputs',exact:true}).count(),1)
  assert.equal(await page.locator('form[method=post]').count(),0)
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Accountant inputs fit '+width)
  if(process.env.GAUGE_HANDOFF_SHOTS)await page.screenshot({path:process.env.GAUGE_HANDOFF_SHOTS+'/GOVERN-003-accountant-'+width+'.png',fullPage:true})
 }
 await page.context().clearCookies();await page.context().addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(h.origin+'/app/access')
  assert.equal(await page.locator('select[name=role] option[value=accountant]').count(),1)
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Access fits '+width)
  if(process.env.GAUGE_HANDOFF_SHOTS){await page.screenshot({path:process.env.GAUGE_HANDOFF_SHOTS+'/GOVERN-003-access-'+width+'.png',fullPage:true});await page.locator('select[name=role]').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.GAUGE_HANDOFF_SHOTS+'/GOVERN-003-access-viewport-'+width+'.png'})}
 }
 await cmd('grant',{operatorId:accountant.id,personId:worker.id,role:'accountant',enabled:false})
 assert.equal((await request('/api/gauge/handoffs/'+handoff.id,accountant.cookie)).status,403)
 assert.equal((await request('/api/gauge/accountant',accountant.cookie)).status,403)
 // A separately scoped resource manager can staff only the owner's named roster and projects.
 const planner=await h.invite('journal-resource-manager')
 const workerRow=(await state()).data.people.find(r=>r.id===worker.id)
 await cmd('save:people',{...workerRow,...workerRow.value,skills:[{name:'Journal planning',proficiency:4}]})
 await cmd('save:calendars',{personId:worker.id,from:'2027-02-01',to:'2027-02-05',dailySeconds:28800,weekdays:'1,2,3,4,5',holidays:[],timezone:workerRow.value.timezone})
 const hiddenProject=await project('Private unrelated planning project')
 const hiddenBooking=await cmd('save:staffing',{engagementId:hiddenProject.engagement.id,personId:worker.id,from:'2027-02-01',to:'2027-02-01',dailySeconds:7200,commitment:'committed',service:'Private work',billable:true})
 const grantInput={operatorId:planner.id,personId:worker.id,role:'resource-manager',enabled:true,engagementIds:[p.engagement.id],planningPeople:[worker.id],reason:'Owner explicitly approves this project and roster for staffing'}
 await cmd('grant',{...grantInput,engagementIds:[]},owner,400)
 await cmd('grant',grantInput)
 const planning=await(await request('/api/gauge/state?from=2027-02-01&to=2027-02-01',planner.cookie)).json()
 assert.deepEqual(planning.data.engagements.map(r=>r.id),[p.engagement.id])
 assert.equal(Object.hasOwn(planning,'utilization'),false)
 assert.equal(Object.hasOwn(planning,'lineage'),false)
 assert.deepEqual(planning.data.people.map(r=>r.id),[worker.id])
 for(const [kind,rows] of Object.entries(planning.data))if(!['people','engagements','clients','calendars','leave','staffing','resourceRequests'].includes(kind))assert.deepEqual(rows,[],'The closed planning read scope excludes '+kind)
 assert.equal(planning.capacity[0].days[0].remainingSeconds,21600,'Global committed work reduces scoped planning availability')
 assert.deepEqual(planning.capacity[0].days[0].committedSources,[])
 assert.equal(planning.data.staffing.some(r=>r.id===hiddenBooking.id),false)
 const privateFilter=await cmd('field:define',{scope:'people',name:'Private staffing restriction',type:'text',visibility:'finance-only',reason:'Finance-only staffing requirement'})
 const privateRequestInput={engagementId:p.engagement.id,role:'Private qualification',skill:'Journal planning',minProficiency:3,from:'2027-02-03',to:'2027-02-03',dailySeconds:3600,service:'Delivery',billable:true,nativeFilters:{[privateFilter.id]:'Restricted qualification'}}
 const privateRequest=await cmd('save:resourceRequests',privateRequestInput)
 await cmd('save:resourceRequests',{...privateRequest,...privateRequestInput,nativeFilters:{}},planner.cookie,403)
 assert.equal((await request('/api/gauge/resources/'+privateRequest.id,planner.cookie)).status,403)
 const resourceRequest=await cmd('save:resourceRequests',{engagementId:p.engagement.id,role:'Delivery specialist',skill:'Journal planning',minProficiency:3,from:'2027-02-01',to:'2027-02-01',dailySeconds:3600,service:'Delivery',billable:true},planner.cookie)
 const candidates=await(await request('/api/gauge/resources/'+resourceRequest.id,planner.cookie)).json()
 assert.deepEqual(candidates.candidates.map(c=>c.personId),[worker.id])
 assert.equal(candidates.candidates[0].days[0].remainingSeconds,21600)
 assert.equal(Object.hasOwn(candidates.candidates[0],'costRates'),false)
 assert.equal(Object.hasOwn(candidates.candidates[0],'costMinor'),false)
 await cmd('resource:fill',{...resourceRequest,personId:worker.id,fingerprint:candidates.fingerprint},planner.cookie)
 const planned=(await state()).data.staffing.find(r=>r.value.resourceRequestId===resourceRequest.id)
 assert.equal(planned.value.dailySeconds,3600)
 const move=await cmd('staffing:preview',{...planned,operation:'move',personId:worker.id,from:'2027-02-02',to:'2027-02-02'},planner.cookie)
 await cmd('staffing:apply',{...move.input,fingerprint:move.fingerprint},planner.cookie)
 await cmd('save:staffing',{engagementId:hiddenProject.engagement.id,personId:worker.id,from:'2027-02-03',to:'2027-02-03',dailySeconds:3600,commitment:'tentative',service:'Delivery'},planner.cookie,403)
 const outsider=(await state()).data.people.find(r=>r.id!==worker.id)
 await cmd('save:staffing',{engagementId:p.engagement.id,personId:outsider.id,from:'2027-02-03',to:'2027-02-03',dailySeconds:3600,commitment:'tentative',service:'Delivery'},planner.cookie,403)
 for(const action of ['invoice:issue','time:save','grant','invite','apikey:create','handoff:prepare','period:approve','save:rates','save:people'])await cmd(action,{},planner.cookie,403)
 for(const path of ['/api/gauge/handoffs/'+handoff.id,'/api/gauge/report.csv','/api/gauge/history/staffing/'+planned.id,'/api/gauge/audit/export','/api/gauge/invoice-documents/'+invoice.id])assert.equal((await request(path,planner.cookie)).status,403)
 await page.context().clearCookies();await page.context().addCookies(planner.cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(h.origin+'/app/capacity?from=2027-02-01')
  assert.equal(await page.getByRole('heading',{name:'Staffing',exact:true}).count(),1)
  assert.equal(await page.locator('form [name=action][value="save:staffing"]').count(),1)
  assert.equal(await page.locator('form [name=action][value="time:save"]').count(),0)
  assert.equal(await page.getByRole('link',{name:'Download utilization calculations CSV',exact:true}).count(),0)
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Scoped planning fits '+width)
  const next=page.getByRole('link',{name:'Next week',exact:true})
  await next.focus();assert.equal(await next.evaluate(el=>getComputedStyle(el,'::after').visibility),'visible','Icon tooltip appears immediately on focus')
  await next.blur();await next.hover();await page.waitForTimeout(350);assert.equal(await next.evaluate(el=>getComputedStyle(el,'::after').visibility),'visible','Icon tooltip appears after hover delay')
  if(process.env.GAUGE_HANDOFF_SHOTS)await page.screenshot({path:process.env.GAUGE_HANDOFF_SHOTS+'/GOVERN-003-resource-manager-'+width+'.png',fullPage:true})
 }
 // Narrowing takes effect on the next API and candidate request, without a new sign-in.
 await cmd('grant',{...grantInput,engagementIds:[mp.engagement.id],reason:'Owner narrows the planning scope'})
 assert.equal((await request('/api/gauge/resources/'+resourceRequest.id,planner.cookie)).status,403)
 assert.deepEqual((await(await request('/api/gauge/state',planner.cookie)).json()).data.engagements.map(r=>r.id),[mp.engagement.id])
 await cmd('grant',{...grantInput,enabled:false})
 assert.equal((await request('/api/gauge/state',planner.cookie)).status,403)
 assert.equal((await request('/app/capacity',planner.cookie)).status,403)
 // Losing the granting owner's active authority ends the grant on the very next request.
 const grantingOwner=await h.invite('synthetic-gauge-5602','owner')
 await cmd('grant',grantInput,grantingOwner.cookie)
 assert.equal((await request('/api/gauge/resources/'+resourceRequest.id,planner.cookie)).status,200)
 const disabled=await h.post('/auth/operator/status',{operatorId:grantingOwner.id,status:'inactive'},owner)
 assert.equal(disabled.status,200,await disabled.text())
 for(const path of ['/api/gauge/state','/api/gauge/resources/'+resourceRequest.id,'/app/capacity'])assert.equal((await request(path,planner.cookie)).status,403,'Inactive granting owner fences '+path)
 await cmd('save:staffing',{engagementId:p.engagement.id,personId:worker.id,from:'2027-02-03',to:'2027-02-03',dailySeconds:3600,commitment:'tentative',service:'Delivery'},planner.cookie,403)
 assert(h.providerRequests.every(r=>r.url==='https://api.resend.com/emails'),'The journey makes authentication mail calls only; no accounting provider is called')
 console.log('PASS accountant access: read-only exact accounting downloads, payroll and raw-data refusals, native form and command mutation refusals, immediate revocation and 1440/390')
 console.log('PASS revenueScheduleJourney: prepaid monthly delivery, all three policies, deferred and unbilled, exact balanced journal reconciliation, stale reviews, duplicate refusals, role privacy and 1440/390')
}

// Native employee reimbursement and client recovery remain independent public doors.
async function expensePolicyJourney(h,page){
 const {cmd,state,request,owner}=h,person=await cmd('save:people',{name:'synthetic-gauge-7101',timezone:'America/New_York'}),client=await cmd('save:clients',{name:'Expense client'}),project=await cmd('save:engagements',{name:'Travel policy',clientId:client.id,leadId:person.id,members:[person.id],scope:'Travel receipts and unit claims',timezone:'America/New_York'})
 const staff=await h.invite('synthetic-gauge-7102'),lead=await h.invite('synthetic-gauge-7103')
 await cmd('grant',{operatorId:staff.id,personId:person.id,role:'staff',enabled:true});await cmd('grant',{operatorId:lead.id,personId:person.id,role:'lead',enabled:true})
 const row=async(k,id)=>(await state()).data[k].find(r=>r.id===id)
 const base={engagementId:project.id,personId:person.id,date:'2026-10-06',category:'Travel',vendor:'Rail vendor',description:'Travel receipt',incurredCurrency:'CAD',amountMinor:10000,taxMinor:1000,markupBasisPoints:2000,reimbursable:true,clientBillable:true,policyException:'Late booking required by delivery'}
 let receipt=await cmd('expense:save',base,staff.cookie)
 const upload=new FormData();for(const[k,v]of Object.entries({...receipt,key:randomUUID(),action:'expense:file'}))upload.set(k,String(v));upload.set('file',new File(['synthetic-gauge-7104 receipt'],'travel.txt',{type:'text/plain'}))
 const uploaded=await request('/api/gauge/command',staff.cookie,{method:'POST',headers:{origin:h.origin},body:upload});assert.equal(uploaded.status,200);receipt=await uploaded.json()
 const file=(await row('expenses',receipt.id)).value.attachmentIds[0]
 receipt=await cmd('expense:submit',receipt,staff.cookie)
 await cmd('expense:approve',{...receipt,reason:'Lead cannot authorize policy economics'},lead.cookie,403)
 await cmd('expense:approve',{...receipt,revision:'stale',reason:'Stale review'},owner,409)
 await cmd('expense:approve',{...receipt,reason:'No exchange rate yet'},owner,409)
 const beforeFx=(await state()).margin.find(x=>x.engagementId===project.id);assert.equal(beforeFx.provisionalCostMinor,null,'Missing FX is unknown, never zero')
 await cmd('fx:approve',{currency:'CAD',rate:'0.7500',effective:'2026-10-01',source:'Published synthetic rate',reason:'Owner approves incurred travel conversion'})
 receipt=await cmd('expense:approve',{...receipt,reason:'Finance reviews receipt and exception, authorizes 20 percent recovery'})
 const frozen=await row('expenses',receipt.id);assert.equal(frozen.value.amountMinor,8250);assert.equal(frozen.value.reimbursementMinor,8250);assert.equal(frozen.value.clientRecoveryMinor,9900);assert.equal(frozen.value.fx.rate,'0.7500')
 await cmd('fx:approve',{currency:'CAD',rate:'0.8000',effective:'2026-10-07',source:'Published synthetic rate',reason:'Forward rate change'})
 await cmd('expense:rate',{unit:'mileage',currency:'USD',effective:'2026-10-01',unitMinor:70,reason:'Finance approves mileage'})
 await cmd('expense:rate',{unit:'per-diem',currency:'USD',effective:'2026-10-01',unitMinor:6000,reason:'Finance approves daily allowance'})
 const claims=[]
 for(const [unit,quantity,expected]of [['mileage',120,8400],['per-diem',2,12000],['per-diem',1.5,9000]]){
  let claim=await cmd('expense:save',{...base,incurredCurrency:'USD',description:unit,category:unit,unit,quantity,amountMinor:0,taxMinor:0,markupBasisPoints:0,clientBillable:false,policyException:''},staff.cookie)
  claim=await cmd('expense:approve',{...await cmd('expense:submit',claim,staff.cookie),reason:'Finance approves exact unit claim'})
  assert.equal((await row('expenses',claim.id)).value.amountMinor,expected);claims.push(await row('expenses',claim.id))
 }
 await cmd('expense:rate',{unit:'mileage',currency:'USD',effective:'2026-10-07',unitMinor:80,reason:'Tomorrow mileage rate'})
 await cmd('expense:rate',{unit:'per-diem',currency:'USD',effective:'2026-10-07',unitMinor:6500,reason:'Tomorrow daily rate'})
 assert.deepEqual(await row('expenses',receipt.id),frozen);assert.equal((await row('expenses',claims[0].id)).value.amountMinor,8400);assert.equal((await row('expenses',claims[1].id)).value.amountMinor,12000)
 await cmd('expense:rate',{unit:'mileage',currency:'USD',effective:'2026-10-08',unitMinor:80,reason:'Unauthorized'},staff.cookie,403)
 const sources=[frozen,...claims].map(r=>({kind:'expenses',id:r.id,revision:r.revision})),handoffInput={purpose:'reimbursement',recipient:'Payroll travel desk',reason:'Reviewed employee reimbursements only',sources}
 await cmd('handoff:prepare',{...handoffInput,sources:[{...sources[0],revision:'stale'}]},owner,409)
 let handoff=await cmd('handoff:prepare',handoffInput);const exported=await row('specialistHandoffs',handoff.id)
 assert.equal(exported.value.lines.reduce((n,l)=>n+l.amountMinor,0),37650);assert.equal(exported.value.controlTotals.length,3);assert(exported.value.lines.every(l=>l.category==='reimbursement'))
 const bytes=await(await request('/api/gauge/handoffs/'+handoff.id,owner)).text();assert.equal(createHash('sha256').update(bytes).digest('hex'),exported.value.artifactHash)
 await cmd('handoff:prepare',handoffInput,owner,409)
 const outcome={handoffId:handoff.id,artifactHash:exported.value.artifactHash,lines:exported.value.lines.map((l,i)=>({id:l.id,currency:l.currency,amountMinor:l.amountMinor,durationSeconds:null,quantity:l.details.quantity,unit:l.details.unit,status:i===2?'rejected':'accepted',...(i===2?{reason:'Daily allowance needs payroll review'}:{})}))}
 await cmd('handoff:record-result',{...handoff,result:{...outcome,artifactHash:'0'.repeat(64)}},owner,409)
 const wrong=structuredClone(outcome);wrong.lines[1].quantity=121;await cmd('handoff:record-result',{...handoff,result:wrong},owner,400)
 handoff=await cmd('handoff:record-result',{...handoff,result:outcome});const reconciled=await row('specialistHandoffs',handoff.id);assert.equal(reconciled.value.result.verification,'user-recorded');assert.equal(reconciled.value.result.rejectedCount,1)
 await cmd('handoff:record-result',{...handoff,result:outcome},owner,409)
 let packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:'Allowed travel recovery',sources:['expenses:'+receipt.id]}))
 const invoice=await cmd('invoice:issue',{...packet,issueDate:'2026-10-07',dueDate:'2026-11-06',billTo:'Expense client',remitTo:'Agency',reference:'Travel recovery'})
 assert.equal((await row('invoices',invoice.id)).value.totalMinor,9900)
 await cmd('packet:create',{engagementId:project.id,title:'Duplicate recovery',sources:['expenses:'+receipt.id]},owner,409)
 await cmd('packet:create',{engagementId:project.id,title:'Employee-only mileage',sources:['expenses:'+claims[0].id]},owner,400)
 await cmd('handoff:adjust-reimbursement',{...handoff,sourceId:outcome.lines[0].id,correctedMinor:8251,reason:'Cannot reimburse above approved cost'},owner,400)
 const correction=await cmd('handoff:adjust-reimbursement',{...handoff,sourceId:outcome.lines[0].id,correctedMinor:8000,reason:'Payroll records a reviewed employee adjustment'})
 const corrected=await row('specialistHandoffs',correction.id);assert.equal(corrected.value.lines[0].amountMinor,-250);assert.equal(corrected.value.adjustmentOf,handoff.id);assert.equal(await(await request('/api/gauge/handoffs/'+handoff.id,owner)).text(),bytes)
 await cmd('handoff:adjust-reimbursement',{...handoff,sourceId:outcome.lines[0].id,correctedMinor:7000,reason:'Duplicate adjustment branch'},owner,409)
 const correctionResult={handoffId:correction.id,artifactHash:corrected.value.artifactHash,lines:corrected.value.lines.map(l=>({id:l.id,currency:l.currency,amountMinor:l.amountMinor,durationSeconds:null,quantity:l.details.quantity,unit:l.details.unit,status:'accepted'}))}
 await cmd('handoff:record-result',{...correction,result:correctionResult})
 assert.equal((await row('invoices',invoice.id)).value.totalMinor,9900,'Employee correction does not change client recovery')
 assert.equal((await request('/api/gauge/handoffs/'+handoff.id,staff.cookie)).status,403);assert.equal((await request('/api/gauge/files/'+file,lead.cookie)).status,200,'The lead is the receipt owner in this fixture')
 const outsider=await h.invite('synthetic-gauge-7105');await cmd('grant',{operatorId:outsider.id,personId:(await cmd('save:people',{name:'Other worker',timezone:'America/New_York'})).id,role:'staff',enabled:true})
 assert.equal((await request('/api/gauge/files/'+file,outsider.cookie)).status,403);assert.deepEqual((await state(staff.cookie)).data.specialistHandoffs,[]);assert.equal(Object.hasOwn((await state(staff.cookie)).data.expenses.find(r=>r.id===receipt.id).value,'clientRecoveryMinor'),false);assert.equal(Object.hasOwn((await state(staff.cookie)).data.expenses.find(r=>r.id===receipt.id).value,'financeReviewNote'),false)
 await page.context().clearCookies();await page.context().addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
 await page.goto(h.origin+'/app/expenses');await page.setViewportSize({width:390,height:1000})
 const nativeForm=page.locator('form').filter({has:page.locator('[name=action][value="expense:save"]')})
 await nativeForm.locator('[name=engagementId]').selectOption(project.id);await nativeForm.locator('[name=personId]').selectOption(person.id);await nativeForm.locator('[name=date]').fill('2026-10-06');await nativeForm.locator('[name=description]').fill('Native reimbursement without client recovery');await nativeForm.locator('[name=amountDollars]').fill('10.00');await nativeForm.locator('[name=clientBillable]').uncheck();await nativeForm.locator('[name=reimbursable]').check();await nativeForm.getByRole('button',{name:'Save',exact:true}).click()
 const nativeExpense=(await state()).data.expenses.find(r=>r.value.description==='Native reimbursement without client recovery');assert(nativeExpense);assert.equal(nativeExpense.value.reimbursable,true);assert.equal(nativeExpense.value.clientBillable,false,'Unchecked native flag remains false independently of employee reimbursement')
 for(const screen of ['expenses','billing','access'])for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(h.origin+'/app/'+screen);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),screen+' fits '+width)
  for(const control of await page.locator('button,a').all()){if(!await control.isVisible())continue;const label=(await control.innerText()).trim();if(!label){assert(await control.getAttribute('aria-label'),'Icon control has an accessible label: '+await control.evaluate(el=>el.outerHTML));assert(await control.getAttribute('data-tooltip'),'Icon control has a tooltip');await control.focus();assert.equal(await control.evaluate(el=>getComputedStyle(el,'::after').visibility),'visible');await control.blur();await control.hover();await page.waitForTimeout(350);assert.equal(await control.evaluate(el=>getComputedStyle(el,'::after').visibility),'visible')}}
  if(process.env.GAUGE_HANDOFF_SHOTS){await page.screenshot({path:process.env.GAUGE_HANDOFF_SHOTS+'/COST-002-'+screen+'-'+width+'.png',fullPage:true});const focus=screen==='billing'?page.locator('#specialist-handoffs'):screen==='access'?page.locator('section').filter({has:page.getByRole('heading',{name:'Expense unit rates',exact:true})}).last():page.locator('section').filter({has:page.getByRole('heading',{name:'Expense',exact:true})}).last();await focus.screenshot({path:process.env.GAUGE_HANDOFF_SHOTS+'/COST-002-'+screen+'-detail-'+width+'.png'})}
 }
 console.log('PASS expensePolicyJourney: receipt exception, exact finance review, frozen FX, tax and markup, 120 miles, per diem, separate once-only reimbursement, quantity-bound results, once-only invoice and scoped reads at 1440 and 390')
}
