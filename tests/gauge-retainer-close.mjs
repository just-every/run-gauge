import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

// RETAINER-004: completed July/August/September periods stand in for the
// contract's October/November example, without advancing the real close clock.
export async function retainerCloseJourney(h,browser,{client,lead,worker,staff,manager,agent}) {
 const {cmd,request}=h,zone='America/New_York',from='2026-07-01',to='2026-10-31'
 const report=async(cookie=h.owner)=>{const r=await request(`/api/gauge/state?from=${from}&to=${to}`,cookie);assert.equal(r.status,200);return r.json()}
 const finance=await h.invite('retainer-close-finance'),financePerson=await cmd('save:people',{name:'Retainer finance reviewer',timezone:zone})
 await cmd('grant',{operatorId:finance.id,personId:financePerson.id,role:'finance',enabled:true})
 const colleague=await cmd('save:people',{name:'Close source colleague',timezone:zone})
 const project=await cmd('save:engagements',{name:'Completed monthly service and corrections',clientId:client.id,leadId:lead.id,members:[worker.id,colleague.id],scope:'Monthly retained service with reviewed corrections',timezone:zone})
 const budget=await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:9000000,effortSeconds:144000,roundingSeconds:60,reason:'Approved service terms'});await cmd('budget:approve',budget)
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Completed retained delivery',remainingSeconds:0})
 const service='Close design'
 for(const person of [worker,colleague])await cmd('save:rates',{personId:person.id,service,effective:'2026-01-01',costMinor:12347,billMinor:23457})
 const terms={name:'Four-hour monthly close example',frequency:'monthly',unit:'hours',allowance:14400,services:[service],consumes:'billable',proration:'calendar',start:from,end:null,renewal:'automatic',noticeDays:0,rules:{carryCap:7200,carryPeriods:1,deficit:false,overage:'bill',overageRate:20000}}
 const saveTerms=async(terms,extra={})=>{const p=await cmd('retainer:preview',{engagementId:project.id,operation:'terms',terms,...extra},manager.cookie);return cmd('retainer:approve',{...p.input,fingerprint:p.fingerprint,reason:'Reviewed monthly agreement'},manager.cookie)}
 const retained=await saveTerms(terms,{from,to:'2026-10-31'})
 const actual=async(person,day,start,end,serviceName=service,cookie=staff.cookie)=>{let row=await cmd('time:save',{personId:person.id,engagementId:project.id,taskId:task.id,service:serviceName,timezone:zone,start:`${day}T${start}:00-04:00`,end:`${day}T${end}:00-04:00`,billable:true,notes:person.id===worker.id?'Own retained service':'Restricted colleague close source'},cookie);row=await cmd('time:submit',row,cookie);return cmd('time:approve',row,manager.cookie)}
 const julySource=await actual(worker,'2026-07-08','09:00','10:00')
 const own=await actual(worker,'2026-08-24','09:00','13:00')
 const other=await actual(colleague,'2026-08-25','09:00','13:00',service,h.owner)
 let data=await report()
 const [jul,aug,sep]=data.data.retainerPeriods.filter(p=>p.value.rootId===retained.id).sort((a,b)=>a.value.periodStart.localeCompare(b.value.periodStart))
 const balance=(data,id)=>data.retainerBalances.find(b=>b.periodId===id)
 const row=(data,kind,id)=>{const found=data.data[kind].find(r=>r.id===id);assert(found,`${kind} ${id} is visible`);return found}
 assert.equal(balance(data,aug.id).rollover,7200);assert.equal(balance(data,aug.id).consumed,28800);assert.equal(balance(data,aug.id).overage,7200);assert.equal(balance(data,aug.id).overageMinor,40000)
 assert.deepEqual(balance(data,aug.id).allocation.filter(a=>a.sourceId===own.id).map(a=>[a.allowancePeriodId,a.quantity]),[[jul.id,7200],[aug.id,7200]])
 const closeInput=p=>({id:p.id,revision:p.revision,reason:'Reconciled completed period and FIFO sources'})
 for(const user of [manager,staff,agent])await cmd('retainer:close',closeInput(jul),user.cookie,403)
 await cmd('retainer:close',closeInput(aug),finance.cookie,409)
 await cmd('retainer:close',{...closeInput(jul),revision:jul.revision+1},finance.cookie,409)
 const julyRequest={...closeInput(jul),key:crypto.randomUUID()}
 const julyAcknowledgement=await cmd('retainer:close',julyRequest,finance.cookie)
 assert.deepEqual(await cmd('retainer:close',julyRequest,finance.cookie),julyAcknowledgement,'Exact close request replay returns the original close')
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage(),url=h.origin+`/app/engagements?edit=${project.id}`
 const login=async cookie=>{await context.clearCookies();await context.addCookies(cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))}
 const capture=async(name,target=page.locator('#retainer-corrections'))=>{if(!process.env.GAUGE_RETAINER_CLOSE_SHOTS)return;await mkdir(process.env.GAUGE_RETAINER_CLOSE_SHOTS,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);await target.scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.GAUGE_RETAINER_CLOSE_SHOTS}/${name}-viewport-${width}.png`});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}`)}}
 const actionForm=(action,target=page)=>target.locator('form').filter({has:page.locator(`[name=action][value="${action}"]`)})
 const prepare=async(kind,extra={},cookie=finance.cookie,expected=200)=>{const result=await cmd('retainer:adjust-prepare',{id:aug.id,revision:aug.revision,kind,reason:'Reviewed linked period correction',...extra},cookie,expected);return expected===200?row(await report(),'retainerAdjustments',result.id):result}
 const approve=(adjustment,cookie=finance.cookie,expected=200)=>cmd('retainer:adjust-approve',{id:adjustment.id,revision:adjustment.revision},cookie,expected)
 const cancel=adjustment=>cmd('retainer:adjust-cancel',{id:adjustment.id,revision:adjustment.revision,reason:'Withdraw superseded correction'},finance.cookie)
 const adjustmentForm=kind=>actionForm('retainer:adjust-prepare',page.locator(`#retainer-close-${aug.id}`)).filter({has:page.locator(`[name=kind][value="${kind}"]`)})
 try{
  await login(finance.cookie);await page.goto(url)
  const closeForm=actionForm('retainer:close',page.locator('#retainer-corrections')).filter({has:page.locator(`[name=id][value="${aug.id}"]`)})
  await closeForm.evaluate(el=>{el.closest('details').open=true})
  await closeForm.locator('[name=reason]').fill('Finance reconciled August delivery and original rules');await capture('close-review',closeForm);await closeForm.getByRole('button',{name:'Close period',exact:true}).click()
  data=await report();const closed=row(data,'retainerCloses',data.data.retainerCloses.find(c=>c.value.periodId===aug.id).id),julyClose=data.data.retainerCloses.find(c=>c.value.periodId===jul.id)
  const frozen=structuredClone(closed),julyFrozen=structuredClone(julyClose)
  assert.deepEqual(julyClose.value.statement.fifoState.carried,[{periodId:jul.id,remaining:10800,expires:1}])
  assert.equal(closed.value.statement.consumed,28800);assert.equal(closed.value.statement.overageMinor,40000)
  assert.deepEqual(closed.value.sources.map(r=>r.id).sort(),[own.id,other.id].sort());assert.equal(closed.value.terms.id,retained.id);assert.equal(closed.value.period.id,aug.id)
  await capture('close-frozen',page.locator(`#retainer-close-${aug.id}`))
  await cmd('retainer:close',closeInput(aug),finance.cookie,409)
  for(const source of [julySource,own,other]){
   await cmd('time:correct',{id:source.id,revision:source.revision,reason:'Closed source must stay immutable'},manager.cookie,409)
   await cmd('retainer:allocate',{id:source.id,revision:source.revision,retainerRootId:retained.id,reason:'Closed source cannot be reassigned'},manager.cookie,409)
  }
  const currentMonth=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).slice(0,7)+'-01'
  const future=await saveTerms({...terms,name:'Current unfinished period',start:currentMonth,services:['Future close service']})
  data=await report();const current=data.data.retainerPeriods.find(p=>p.value.retainerId===future.id)
  await cmd('retainer:close',closeInput(current),finance.cookie,409)

  const originalOverage=await cmd('packet:create',{engagementId:project.id,title:'Frozen August overage',sources:[`retainerPeriods:${aug.id}`]},finance.cookie)
  await cmd('packet:approve',originalOverage,finance.cookie)
  const originalBytes=await(await request(`/api/gauge/packets/${originalOverage.id}`,finance.cookie)).text()
  let late=await actual(worker,'2026-08-27','09:00','10:00')
  late=await cmd('retainer:allocate',{...late,retainerRootId:retained.id,reason:'Uncaptured late work belongs to this closed family'},manager.cookie)
  data=await report();assert.equal(balance(data,aug.id).consumed,28800);assert.equal(balance(data,sep.id).consumed,0)
  for(const user of [manager,staff,agent])await prepare('late',{sourceId:late.id},user.cookie,403)
  await page.goto(url);const lateForm=adjustmentForm('late');await lateForm.evaluate(el=>{el.closest('details').open=true})
  await lateForm.locator('[name=sourceId]').selectOption(late.id);await lateForm.locator('[name=reason]').fill('Approved late August hour belongs to the next open period');await lateForm.getByRole('button',{name:'Prepare adjustment',exact:true}).click()
  data=await report();const lateAdjustment=data.data.retainerAdjustments.find(a=>a.value.sourceId===late.id)
  assert(lateAdjustment);assert.equal(lateAdjustment.value.periodId,sep.id);assert.equal(lateAdjustment.value.originPeriodId,aug.id);assert.equal(lateAdjustment.value.closeId,closed.id);assert.equal(lateAdjustment.value.sourceRevision,late.revision);assert.equal(lateAdjustment.value.status,'prepared');assert.equal(lateAdjustment.value.preview.nextPeriodId,sep.id)
  assert.equal(balance(data,sep.id).consumed,0);assert.equal(balance(data,sep.id).remaining,14400);assert.equal(balance(data,sep.id).projectedRemaining,10800);assert(!balance(data,sep.id).adjustmentIds.includes(lateAdjustment.id));assert(balance(data,sep.id).linkedAdjustments.some(a=>a.id===lateAdjustment.id&&a.status==='prepared'))
  await capture('close-late-prepared',page.locator(`#retainer-adjustment-${lateAdjustment.id}`))
  for(const user of [manager,staff,agent])await approve(lateAdjustment,user.cookie,403)
  await actionForm('retainer:adjust-approve',page.locator(`#retainer-adjustment-${lateAdjustment.id}`)).getByRole('button',{name:'Approve adjustment',exact:true}).click()
  data=await report();assert.equal(balance(data,sep.id).consumed,3600);assert.equal(balance(data,sep.id).remaining,10800);assert.equal(balance(data,sep.id).sources.filter(id=>id===late.id).length,1);assert.equal(balance(data,aug.id).sources.includes(late.id),false);assert(balance(data,sep.id).adjustmentIds.includes(lateAdjustment.id))
  assert.deepEqual(balance(data,sep.id).allocation.filter(a=>a.sourceId===late.id).map(a=>[a.allowancePeriodId,a.quantity]),[[sep.id,3600]])
  await approve(lateAdjustment,finance.cookie,409);await prepare('late',{sourceId:late.id},finance.cookie,409)
  await cmd('time:correct',{id:late.id,revision:late.revision,reason:'Posted linked source stays fixed'},manager.cookie,409)
  await capture('close-late-approved',page.locator(`#retainer-adjustment-${lateAdjustment.id}`))

  await cmd('approval:limit',{reviewAboveMinor:10000,reason:'Retainer cash corrections above $100 need another approver'})
  await page.goto(url);const waiverForm=adjustmentForm('waiver');await waiverForm.evaluate(el=>{el.closest('details').open=true})
  await waiverForm.locator('[name=quantity]').fill('3600');await waiverForm.locator('[name=reason]').fill('Waive one of the original two August overage hours');await waiverForm.getByRole('button',{name:'Prepare adjustment',exact:true}).click()
  data=await report();const waiver=data.data.retainerAdjustments.find(a=>a.value.originPeriodId===aug.id&&a.value.kind==='waiver')
  assert.equal(waiver.value.quantity,3600);assert.equal(waiver.value.allowanceDelta,0);assert.equal(waiver.value.cashDeltaMinor,-20000);assert.equal(waiver.value.preview.cashDeltaMinor,-20000);assert.equal(waiver.value.preview.nextRemaining,10800)
  assert.match(waiver.value.preview.cashLabel,/external/i)
  await approve(waiver,finance.cookie,403)
  const selfForm=new FormData();for(const [key,value] of Object.entries({action:'retainer:adjust-approve',id:waiver.id,revision:String(waiver.revision),engagementId:project.id,key:crypto.randomUUID()}))selfForm.set(key,value)
  assert.equal((await request('/app/action',finance.cookie,{method:'POST',headers:{origin:h.origin},body:selfForm})).status,403)
  assert.equal(await actionForm('retainer:adjust-approve',page.locator(`#retainer-adjustment-${waiver.id}`)).count(),0)
  await capture('close-waiver-independent-review',page.locator(`#retainer-adjustment-${waiver.id}`))
  await login(h.owner);await page.goto(url);await actionForm('retainer:adjust-approve',page.locator(`#retainer-adjustment-${waiver.id}`)).getByRole('button',{name:'Approve adjustment',exact:true}).click()
  data=await report();const approvedWaiver=row(data,'retainerAdjustments',waiver.id)
  assert.equal(approvedWaiver.value.status,'approved');assert.notEqual(approvedWaiver.value.createdBy,approvedWaiver.value.approvedBy);assert(approvedWaiver.value.approvedAt);assert.equal(balance(data,sep.id).remaining,10800)
  await capture('close-waiver-approved',page.locator(`#retainer-adjustment-${waiver.id}`))
  await prepare('waiver',{quantity:7200},finance.cookie,409)
  await prepare('refund',{amountMinor:-1},finance.cookie,400)
  await login(finance.cookie);await page.goto(url)
  for(const [kind,values] of [['refund',{amountDollars:'100'}],['pause',{amountDollars:'0'}],['renewal',{quantity:'14400',amountDollars:'25'}],['cancellation',{amountDollars:'0'}]]){
   const form=adjustmentForm(kind);await form.evaluate(el=>{el.closest('details').open=true})
   for(const [name,value] of Object.entries(values))await form.locator(`[name=${name}]`).fill(value)
   await form.locator('[name=reason]').fill('Finance reviews the allowance and external cash adjustment')
   await capture(`close-${kind}-editor`,form)
   await form.evaluate(el=>{el.closest('details').open=false})
  }
  const refund=await prepare('refund',{amountMinor:10000});assert.equal(refund.value.cashDeltaMinor,-10000);await approve(refund)
  const policyReviewed=await prepare('refund',{amountMinor:10001});await approve(policyReviewed,finance.cookie,403)
  let policy=(await report()).data.approvalPolicies[0];await cmd('approval:limit',{id:policy.id,revision:policy.revision,reviewAboveMinor:20000,reason:'Raised the current cash review limit'})
  await approve(policyReviewed)
  const stale=await prepare('refund',{amountMinor:1000})
  await actual(worker,'2026-08-29','09:00','10:00')
  await approve(stale,h.owner,409);await cancel(stale)

  // Lifecycle changes post only after review, retain cash as an external effect,
  // and never silently bill the paused/cancelled next-period overage.
  const pause=await prepare('pause',{amountMinor:0});data=await report();assert.equal(balance(data,sep.id).remaining,10800);assert.equal(balance(data,sep.id).adjustments,0);assert.equal(balance(data,sep.id).projectedAdjustments,-14400);assert.equal(balance(data,sep.id).projectedRemaining,-3600);await approve(pause,finance.cookie,403);await approve(pause,h.owner)
  data=await report();assert.equal(balance(data,sep.id).remaining,-3600);assert.equal(balance(data,sep.id).adjustments,-14400);assert.equal(balance(data,sep.id).projectedAdjustments,0);assert.equal(balance(data,sep.id).overageMinor,null)
  const renewal=await prepare('renewal',{quantity:7200,amountMinor:2500});await approve(renewal,h.owner)
  data=await report();assert.equal(balance(data,sep.id).remaining,3600)
  const cancellation=await prepare('cancellation',{amountMinor:0});await approve(cancellation,h.owner)
  data=await report();assert.equal(balance(data,sep.id).remaining,-3600);assert.equal(balance(data,sep.id).overageMinor,null)
  const cancelledOctober=data.data.retainerPeriods.find(p=>p.value.rootId===retained.id&&p.value.periodStart==='2026-10-01');assert.equal(balance(data,cancelledOctober.id).opening,0);assert.equal(balance(data,cancelledOctober.id).overageMinor,null)
  await cmd('retainer:preview',{engagementId:project.id,operation:'periods',retainerId:retained.id,from:'2026-11-01',to:'2026-11-30'},manager.cookie,409)
  const resume=await prepare('renewal',{quantity:14400,amountMinor:0});await approve(resume,h.owner)
  const next=await cmd('retainer:preview',{engagementId:project.id,operation:'periods',retainerId:retained.id,from:'2026-10-01',to:'2026-10-31'},manager.cookie)
  await cmd('retainer:approve',{...next.input,fingerprint:next.fingerprint,reason:'Renewed after explicit cancellation'},manager.cookie)
  await saveTerms({...terms,start:'2026-11-01',rules:{...terms.rules,carryCap:3600,carryPeriods:2,overageRate:35000}},{previousId:retained.id})
  data=await report();assert.deepEqual(row(data,'retainerCloses',closed.id),frozen);assert.deepEqual(row(data,'retainerCloses',julyClose.id),julyFrozen);assert.equal(balance(data,aug.id).overageMinor,40000);assert.equal(balance(data,aug.id).consumed,28800)
  assert.equal(await(await request(`/api/gauge/packets/${originalOverage.id}`,finance.cookie)).text(),originalBytes,'Late work, waivers and revised rules never rewrite the closed overage artifact')

  // A value source lacking frozen approval economics cannot become a late debit.
  const unknown=await saveTerms({...terms,name:'Unpriced value correction',start:'2026-08-01',unit:'value',allowance:100000,services:['Unpriced close service'],rules:{carryCap:0,carryPeriods:0,deficit:false,overage:'bill',overageRate:12500}},{from:'2026-08-01',to:'2026-09-30'})
  data=await report();const valuePeriod=data.data.retainerPeriods.find(p=>p.value.retainerId===unknown.id&&p.value.periodStart==='2026-08-01')
  await cmd('retainer:close',closeInput(valuePeriod),finance.cookie)
  const unpriced=await actual(worker,'2026-08-28','09:00','10:00','Unpriced close service')
  await cmd('retainer:adjust-prepare',{id:valuePeriod.id,revision:valuePeriod.revision,kind:'late',sourceId:unpriced.id,reason:'Unknown frozen value must remain held'},finance.cookie,409)
  data=await report();assert(!data.data.retainerAdjustments.some(a=>a.value.sourceId===unpriced.id))

  const valueRenewalAck=await cmd('retainer:adjust-prepare',{id:valuePeriod.id,revision:valuePeriod.revision,kind:'renewal',quantity:300000,amountMinor:0,reason:'Reviewed value allowance increase'},finance.cookie)
  const valueRenewal=row(await report(),'retainerAdjustments',valueRenewalAck.id)
  await approve(valueRenewal,finance.cookie,403);await approve(valueRenewal,h.owner)
  const unpricedHours=await saveTerms({...terms,name:'Unpriced hours require review',start:'2026-08-01',services:['Unpriced allowance'],rules:{carryCap:0,carryPeriods:0,deficit:false,overage:'held',overageRate:0}},{from:'2026-08-01',to:'2026-09-30'})
  data=await report();const heldPeriod=data.data.retainerPeriods.find(p=>p.value.retainerId===unpricedHours.id&&p.value.periodStart==='2026-08-01')
  await cmd('retainer:close',closeInput(heldPeriod),finance.cookie)
  const heldPauseAck=await cmd('retainer:adjust-prepare',{id:heldPeriod.id,revision:heldPeriod.revision,kind:'pause',amountMinor:0,reason:'Unpriced allowance change requires independent review'},finance.cookie)
  const heldPause=row(await report(),'retainerAdjustments',heldPauseAck.id);assert.equal(heldPause.value.preview.reviewMinor,null)
  await approve(heldPause,finance.cookie,403);await approve(heldPause,h.owner)
  data=await report()
  // Value waivers round the cumulative credit, so splitting cannot over-credit a cent.
  const centsService='Cumulative value waiver'
  await cmd('save:rates',{personId:worker.id,service:centsService,effective:'2026-01-01',costMinor:0,billMinor:1})
  const centsTerms=await saveTerms({...terms,name:'Cent-exact value waiver',start:'2026-06-01',unit:'value',allowance:1,services:[centsService],rules:{carryCap:0,carryPeriods:0,deficit:false,overage:'bill',overageRate:5000}},{from:'2026-06-01',to:'2026-07-31'})
  await actual(worker,'2026-06-15','09:00','12:00',centsService)
  data=await report();const centsPeriod=data.data.retainerPeriods.find(p=>p.value.retainerId===centsTerms.id&&p.value.periodStart==='2026-06-01')
  assert.equal(balance(data,centsPeriod.id).overage,2);assert.equal(balance(data,centsPeriod.id).overageMinor,1)
  await cmd('retainer:close',closeInput(centsPeriod),finance.cookie)
  const centWaivers=[]
  for(const expected of [-1,0]){
   const saved=await cmd('retainer:adjust-prepare',{id:centsPeriod.id,revision:centsPeriod.revision,kind:'waiver',quantity:1,reason:'Partial original-rate value overage waiver'},finance.cookie)
   const adjustment=row(await report(),'retainerAdjustments',saved.id);assert.equal(adjustment.value.cashDeltaMinor,expected)
   await approve(adjustment);centWaivers.push(adjustment)
  }
  assert.equal(centWaivers.reduce((total,r)=>total+r.value.cashDeltaMinor,0),-1,'Two partial waivers credit exactly the original rounded overage')
  data=await report()
  const history=await request(`/api/gauge/history/retainerCloses/${closed.id}`,finance.cookie);assert.equal(history.status,200);assert.equal((await history.json()).history.length,0,'An immutable close never acquires superseded revisions')
  const adjustmentHistory=await request(`/api/gauge/history/retainerAdjustments/${waiver.id}`,finance.cookie);assert.equal(adjustmentHistory.status,200);const changes=(await adjustmentHistory.json()).history;assert(changes.some(r=>r.action==='retainer:adjust-approve'&&r.value.status==='prepared'))
  const figure=data.lineage.find(f=>f.id===`retainer:${sep.id}:remaining`);assert(figure.sources.some(s=>s.kind==='retainerAdjustments'&&s.id===lateAdjustment.id));assert(figure.sources.some(s=>s.kind==='time'&&s.id===late.id));assert(figure.sources.some(s=>s.kind==='retainerCloses'&&s.id===closed.id))
  const csv=async cookie=>{const scoped=await report(cookie),response=await request(`/api/gauge/report.csv?from=${from}&to=${to}&fingerprint=${scoped.fingerprint}`,cookie);assert.equal(response.status,200);return response.text()}
  const financeCSV=await csv(finance.cookie);assert(financeCSV.includes(lateAdjustment.id));assert(financeCSV.includes(waiver.id))
  for(const user of [manager,staff]){
   const scoped=await report(user.cookie),closes=scoped.data.retainerCloses.filter(c=>c.value.engagementId===project.id),adjustments=scoped.data.retainerAdjustments.filter(a=>a.value.engagementId===project.id)
   assert(closes.some(c=>c.id===closed.id));assert(!closes.some(c=>c.value.periodId===valuePeriod.id));assert(!/"(?:cashDeltaMinor|overageMinor|overageRate|costMinor|billMinor)":/.test(JSON.stringify({closes,adjustments})))
   const scopedCSV=await csv(user.cookie);assert(!scopedCSV.includes(`retainer-adjustment:${waiver.id}:cash`));assert(!/cashDeltaMinor|costMinor/.test(scopedCSV))
   const scopedHistory=await request(`/api/gauge/history/retainerCloses/${closed.id}`,user.cookie);assert.equal(scopedHistory.status,200);assert(!/"(?:cashDeltaMinor|overageMinor|overageRate|costMinor|billMinor)":/.test(await scopedHistory.text()))
   const scopedAdjustmentHistory=await request(`/api/gauge/history/retainerAdjustments/${waiver.id}`,user.cookie);assert.equal(scopedAdjustmentHistory.status,200);assert(!/"(?:cashDeltaMinor|overageMinor|overageRate|costMinor|billMinor)":/.test(await scopedAdjustmentHistory.text()))
   if(user===staff){assert(!closes.some(c=>c.value.periodId===valuePeriod.id));assert(closes.every(c=>c.value.sources.every(s=>s.value.personId===worker.id)));assert(!JSON.stringify({closes,adjustments}).includes('Restricted colleague close source'));assert(balance(scoped,aug.id).sources.includes(own.id));assert(!balance(scoped,aug.id).sources.includes(other.id));assert(balance(scoped,sep.id).linkedAdjustments.some(a=>a.id===lateAdjustment.id&&a.sourceId===late.id))}
  }
  const agentState=await report(agent.cookie);assert.equal(agentState.data.retainerCloses.length,0);assert.equal(agentState.data.retainerAdjustments.length,0);assert.equal((await request(`/api/gauge/history/retainerCloses/${closed.id}`,agent.cookie)).status,403)
  await login(finance.cookie);await page.goto(url);await capture('close-final-state',page.locator(`#retainer-close-${aug.id}`))
  await login(staff.cookie);await page.goto(url);await capture('close-own-source-state',page.locator(`#retainers [id="${sep.id}"]`));await capture('close-own-closed-state',page.locator(`#retainers [id="${aug.id}"]`))
  console.log('PASS RETAINER-004: single chronological close, frozen FIFO/source/rule versions, linked late work once, projected then posted effects, partial governed waiver, refunds, stale previews, pause/cancellation/renewal, unknown-value hold, scoped history and CSV')
 }finally{await context.close()}
}
