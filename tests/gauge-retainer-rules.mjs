import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { harness } from './gauge-harness.mjs'

// RETAINER-002 / RETAINER-003: public commands, statement, draft/approve/download and immutable
// versions. Called by the existing retainer journey, sharing its built app.
export async function retainerRulesJourney(h,browser,{client,lead,worker,staff,manager}) {
 const {cmd,state,request}=h,zone='America/New_York'
 await cmd('save:rates',{personId:worker.id,service:'Design',effective:'2026-07-01',costMinor:9000,billMinor:15000})
 const engagement=await cmd('save:engagements',{name:'Studio service subscription',clientId:client.id,leadId:lead.id,members:[worker.id],scope:'Ongoing design delivery',timezone:zone})
 const budget=await cmd('save:budgets',{engagementId:engagement.id,mode:'hourly',amountMinor:9000000,effortSeconds:1000000,roundingSeconds:60,reason:'Separate ad hoc scope'});await cmd('budget:approve',budget)
 const task=await cmd('save:tasks',{engagementId:engagement.id,name:'Subscription design',remainingSeconds:3600})
 const terms={name:'40-hour monthly design',frequency:'monthly',unit:'hours',allowance:144000,services:['Design'],consumes:'billable',proration:'calendar',start:'2026-08-01',end:null,renewal:'automatic',noticeDays:0,rules:{carryCap:28800,carryPeriods:1,deficit:false,overage:'bill',overageRate:20000}}
 const preview=(t,extra={})=>cmd('retainer:preview',{engagementId:engagement.id,operation:'terms',terms:t,...extra},manager.cookie)
 const save=p=>cmd('retainer:approve',{...p.input,fingerprint:p.fingerprint,reason:'Agreed service subscription and rollover'},manager.cookie)
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 const login=async cookie=>{await context.clearCookies();await context.addCookies(cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))}
 const capture=async(name,target=page.locator('#retainers'))=>{if(!process.env.GAUGE_RETAINER_SHOTS)return;await mkdir(process.env.GAUGE_RETAINER_SHOTS,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);await target.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}`);await page.screenshot({path:`${process.env.GAUGE_RETAINER_SHOTS}/${name}-${width}.png`,fullPage:true});await page.screenshot({path:`${process.env.GAUGE_RETAINER_SHOTS}/${name}-viewport-${width}.png`})}}
 try{
  await login(manager.cookie);await page.goto(h.origin+`/app/engagements?edit=${engagement.id}`);await page.getByText('Set up a retainer',{exact:true}).click()
  const form=page.locator('form:visible').filter({has:page.locator('[name=operation][value=terms]')})
  await form.getByLabel('Retainer name',{exact:true}).fill(terms.name);await form.getByLabel('Allowance type',{exact:true}).selectOption('hours');await form.getByLabel('Included hours',{exact:true}).fill('40');await form.getByLabel('Eligible services (one per line)',{exact:true}).fill('Design');await form.getByLabel('Retainer start date',{exact:true}).fill(terms.start)
  await form.getByLabel('Hour carry-over cap',{exact:true}).fill('8');await form.getByLabel('Carry expiry (successor periods)',{exact:true}).fill('1');await form.getByLabel('Overage policy',{exact:true}).selectOption('bill');await form.getByLabel('Hour overage rate (USD/h)',{exact:true}).fill('200')
  await capture('rules-editor',form);await capture('rules-rule-fields',form.locator('fieldset'));await form.getByRole('button',{name:'Preview retainer',exact:true}).click();await capture('rules-preview')
  await page.getByLabel('Commercial approval reason',{exact:true}).fill('Approved 40 hours, eight-hour carry and $200 overage');await page.getByRole('button',{name:'Save retainer',exact:true}).click()
  let data=await state();const retained=data.data.retainers.find(t=>t.value.engagementId===engagement.id)
  assert.deepEqual(retained.value.terms.rules,terms.rules)
  const open=await cmd('retainer:preview',{engagementId:engagement.id,operation:'periods',retainerId:retained.id,from:'2026-09-01',to:'2026-10-31'},manager.cookie);await save(open)
  const periods=(await state()).data.retainerPeriods.filter(p=>p.value.rootId===retained.id).sort((a,b)=>a.value.periodStart.localeCompare(b.value.periodStart)),[aug,sep,oct]=periods
  const actual=async(day,hours,engagementId=engagement.id,taskId=task.id,service='Design')=>{let time=await cmd('time:save',{engagementId,taskId,personId:worker.id,service,timezone:zone,start:`${day}T06:00:00-04:00`,end:`${day}T${String(6+hours).padStart(2,'0')}:00:00-04:00`,billable:true,notes:'Subscription service delivery'},staff.cookie);time=await cmd('time:submit',time,staff.cookie);return cmd('time:approve',time,manager.cookie)}
  for(const day of ['03','04','05','06'])await actual(`2026-08-${day}`,8)
  const september=[];for(const day of ['01','02','03','04','07','08'])september.push(await actual(`2026-09-${day}`,8));september.push(await actual('2026-09-09',3))
  data=await state();const balance=id=>data.retainerBalances.find(b=>b.periodId===id),b=balance(sep.id)
  assert.equal(balance(aug.id).remaining,28800);assert.equal(b.rollover,28800);assert.equal(b.opening,172800);assert.equal(b.consumed,183600);assert.equal(b.remaining,-10800);assert.equal(b.overage,10800);assert.equal(b.overageMinor,60000)
  assert.deepEqual(b.allocation.filter(x=>x.sourceId===september[0].id).map(x=>[x.allowancePeriodId,x.quantity]),[[aug.id,28800]],'Oldest eight hours consumed before the new 40-hour allowance')
  assert.equal(balance(oct.id).rollover,0)
  await login(h.owner);await page.goto(h.origin+`/app/engagements?edit=${engagement.id}`);const row=page.locator(`#retainers [id="${sep.id}"]`);await row.getByText('FIFO source allocation',{exact:true}).click();await capture('rules-fifo-overage',row)
  const draftForm=row.locator('form').filter({has:page.locator('[name=action][value="packet:create"]')});await draftForm.getByRole('button',{name:'Draft overage packet',exact:true}).click()
  data=await state();const packet=data.data.packets.find(p=>p.value.lines.some(l=>l.sourceId===sep.id));assert.equal(packet.value.totalMinor,60000);assert.equal(packet.value.lines[0].durationSeconds,10800)
  await capture('rules-overage-draft',page.locator(`[id="${packet.id}"]`))
  const approvedPacket=await cmd('packet:approve',{id:packet.id,revision:packet.revision});const artifact=await request(`/api/gauge/packets/${approvedPacket.id}`,h.owner);assert.equal(artifact.status,200);const bytes=await artifact.text();assert(bytes.includes('60000'));assert(bytes.includes('Not an invoice'));assert.equal(await(await request(`/api/gauge/packets/${approvedPacket.id}`,h.owner)).text(),bytes)
  await cmd('packet:create',{engagementId:engagement.id,title:'Duplicate period charge',sources:[`retainerPeriods:${sep.id}`]},h.owner,409)
  await cmd('packet:create',{engagementId:engagement.id,title:'Included time cannot be billed',sources:[`time:${september[0].id}`]},h.owner,409)
  await page.goto(h.origin+'/app/billing');await capture('rules-overage-approved',page.locator(`[id="${packet.id}"]`))
  const historical=structuredClone((await state()).retainerBalances.filter(b=>periods.some(p=>p.id===b.periodId)))
  const version=await preview({...terms,start:'2026-11-01',rules:{...terms.rules,carryCap:7200,carryPeriods:2,overageRate:25000}},{previousId:retained.id});await save(version)
  assert.deepEqual((await state()).retainerBalances.filter(b=>periods.some(p=>p.id===b.periodId)),historical,'Editing current rules leaves all earlier period calculations unchanged')
  const latest=(await state()).data.retainers.find(t=>t.value.previousId===retained.id)
  const year=await cmd('retainer:preview',{engagementId:engagement.id,operation:'periods',retainerId:latest.id,from:'2026-11-01',to:'2027-10-31'},manager.cookie);await save(year)
  const following=await cmd('retainer:preview',{engagementId:engagement.id,operation:'periods',retainerId:latest.id,from:'2027-11-01',to:'2027-11-30'},manager.cookie);await save(following)
  await cmd('retainer:preview',{engagementId:engagement.id,operation:'periods',retainerId:latest.id,from:'2028-01-01',to:'2028-01-31'},manager.cookie,400)
  // Untouched carry expires with its original lot age, and cap drops newer excess.
  const expiry=await save(await preview({...terms,name:'Expiry example',services:['Unused service'],rules:{carryCap:28800,carryPeriods:1,deficit:false,overage:'held',overageRate:0}},{from:'2026-08-01',to:'2026-10-31'}))
  data=await state();const expiryOct=data.retainerBalances.find(b=>b.retainerId===expiry.id&&data.data.retainerPeriods.find(p=>p.id===b.periodId).value.periodStart==='2026-10-01')
  assert.equal(expiryOct.rollover,28800);assert.equal(expiryOct.expired,28800);assert.equal(expiryOct.forfeited,115200)
  // Declared deficits reduce the next entitlement and cannot also be billed.
  const deficit=await save(await preview({...terms,name:'Deficit example',services:['Deficit service'],allowance:3600,rules:{carryCap:0,carryPeriods:0,deficit:true,overage:'held',overageRate:0}},{from:'2026-08-01',to:'2026-09-30'}))
  for(const day of ['10','11','12','13'])await actual(`2026-08-${day}`,8,engagement.id,task.id,'Deficit service')
  data=await state();const deficitSep=data.retainerBalances.find(b=>b.retainerId===deficit.id&&data.data.retainerPeriods.find(p=>p.id===b.periodId).value.periodStart==='2026-09-01')
  assert.equal(deficitSep.deficitOpening,31*3600);assert.equal(deficitSep.opening,-30*3600);assert.equal(deficitSep.overageMinor,null)
  await cmd('packet:create',{engagementId:engagement.id,title:'Disallowed deficit billing',sources:[`retainerPeriods:${deficitSep.periodId}`]},h.owner,409)
  await cmd('retainer:preview',{engagementId:engagement.id,operation:'terms',terms:{...terms,rules:{...terms.rules,deficit:true}}},manager.cookie,400)
  // Value-unit rollover and agreed percentage overage use frozen approval cents.
  const value=await save(await preview({...terms,name:'Value example',unit:'value',allowance:100000,services:['Value design'],rules:{carryCap:20000,carryPeriods:1,deficit:false,overage:'bill',overageRate:12500}},{from:'2026-08-01',to:'2026-09-30'}))
  await cmd('save:rates',{personId:worker.id,service:'Value design',effective:'2026-01-01',costMinor:9000,billMinor:15000})
  for(const day of ['17','18','19','20'])await actual(`2026-08-${day}`,8,engagement.id,task.id,'Value design')
  data=await state();const v=data.retainerBalances.find(b=>b.retainerId===value.id&&data.data.retainerPeriods.find(p=>p.id===b.periodId).value.periodStart==='2026-08-01')
  assert.equal(v.consumed,480000);assert.equal(v.overage,380000);assert.equal(v.overageMinor,475000)
  await save(await preview({...terms,name:'Overlapping value design hours',services:['Value design']},{from:'2026-08-01',to:'2026-09-30'}))
  await cmd('packet:create',{engagementId:engagement.id,title:'Ambiguous source billing held',sources:[`retainerPeriods:${v.periodId}`]},h.owner,409)
  // An overage draft is rechecked against later approved consumption before approval.
  const fresh=await save(await preview({...terms,name:'Fresh design agreement',start:'2026-10-01',allowance:3600,services:['Strategy'],rules:{...terms.rules,carryCap:0,carryPeriods:0}},{from:'2026-10-01',to:'2026-10-31'}))
  const strategy=await cmd('time:save',{engagementId:engagement.id,taskId:task.id,personId:worker.id,service:'Strategy',timezone:zone,start:'2026-10-01T06:00:00-04:00',end:'2026-10-01T09:00:00-04:00',billable:true,notes:'Strategy delivery'},staff.cookie);const sub=await cmd('time:submit',strategy,staff.cookie);await cmd('time:approve',sub,manager.cookie)
  data=await state();const freshPeriod=data.data.retainerPeriods.find(p=>p.value.retainerId===fresh.id)
  const stale=await cmd('packet:create',{engagementId:engagement.id,title:'Reviewed two-hour overage',sources:[`retainerPeriods:${freshPeriod.id}`]})
  const next=await cmd('time:save',{engagementId:engagement.id,taskId:task.id,personId:worker.id,service:'Strategy',timezone:zone,start:'2026-10-02T06:00:00-04:00',end:'2026-10-02T07:00:00-04:00',billable:true,notes:'Further strategy delivery'},staff.cookie);const submitted=await cmd('time:submit',next,staff.cookie);await cmd('time:approve',submitted,manager.cookie)
  await cmd('packet:approve',stale,h.owner,409);await cmd('packet:cancel',stale)
  const refreshed=await cmd('packet:create',{engagementId:engagement.id,title:'Reviewed three-hour overage',sources:[`retainerPeriods:${freshPeriod.id}`]});await cmd('packet:approve',refreshed)
  assert.equal((await state()).data.packets.find(p=>p.id===refreshed.id).value.totalMinor,60000)
  console.log('PASS RETAINER-002: capped 8-of-40 hour FIFO rollover, original expiry, deficit carry, versioned hour/value overage rates, exact three-hour $600 packet, source reservation, repeated download and stale approval refusal')
 }finally{await context.close()}
}

export async function retainerScheduleJourney(h,browser,{client,lead,manager,staff,agent}){
 const {cmd,state,request}=h,zone='America/New_York'
 const worker=await cmd('save:people',{name:'Scheduled service specialist',timezone:zone})
 const project=await cmd('save:engagements',{name:'Scheduled monthly service',clientId:client.id,leadId:lead.id,members:[worker.id],scope:'Scheduled commercial fee and exact overage',timezone:zone})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:9000000,effortSeconds:720000,roundingSeconds:60,reason:'Separate ad hoc terms'}))
 await cmd('save:rates',{personId:worker.id,service:'Scheduled service',effective:'2026-01-01',costMinor:9000,billMinor:15000})
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Scheduled service delivery',remainingSeconds:3600})
 const calendar=(await state()).data.agencyCalendars.at(-1)
 await cmd('agency:calendar',{previousId:calendar.id,weekdays:[1,2,3,4,5],holidays:[],reason:'Contracted service working calendar'})
 const preview=await cmd('retainer:preview',{engagementId:project.id,operation:'terms',terms:{name:'Monthly 40-hour service',feeMinor:300000,frequency:'monthly',unit:'hours',allowance:144000,services:['Scheduled service'],consumes:'billable',proration:'calendar',start:'2026-08-01',end:null,renewal:'automatic',noticeDays:0,rules:{carryCap:28800,carryPeriods:1,deficit:false,overage:'bill',overageRate:20000}}})
 const term=await cmd('retainer:approve',{...preview.input,fingerprint:preview.fingerprint,reason:'Approved immutable monthly fee and allowance'})
 const priorLimit=(await state()).data.approvalPolicies[0]
 await cmd('approval:limit',{...priorLimit,reviewAboveMinor:400000,reason:'Owner bounds monthly automatic invoices'})
 const savedClient=(await state()).data.clients.find(c=>c.id===client.id)
 await cmd('save:clients',{...savedClient.value,...savedClient,paymentTermsDays:30})
 const policy={retainerId:term.id,basis:'advance',from:'2026-08-01',enabled:true,autoIssue:true,capMinor:360000,includeOverages:true,billTo:'Service client accounts',remitTo:'Agency operating account',reference:'Monthly service agreement',heldPeriodIds:[],reason:'Consent to bounded automatic native invoices including agreed overages'}
 for(const actor of [manager,staff,agent])await cmd('retainer:schedule',policy,actor.cookie,403)
 // ct 22 Oct replaces the former autoIssue:true -> 403 policy pin.
 await cmd('retainer:schedule',{...policy,capMinor:400001},h.owner,400)
 let schedule=await cmd('retainer:schedule',policy)
 const run=asOf=>cmd('retainer:run',{...schedule,asOf})
 await run('2026-07-31');assert.equal((await state()).data.retainerRuns.filter(r=>r.value.rootId===term.id).length,0)
 await run('2026-08-01');let data=await state(),aug=data.data.retainerPeriods.find(p=>p.value.rootId===term.id)
 const fee=data.data.retainerCharges.find(c=>c.value.periodId===aug.id)
 assert.equal(fee.value.amountMinor,300000);assert.equal(fee.value.date,'2026-08-01')
 let packet=data.data.packets.find(p=>p.value.scheduleId===schedule.id)
 assert.equal(packet.value.totalMinor,300000);assert.equal(packet.value.lines.length,1)
 await run('2026-08-01');assert.equal((await state()).data.packets.filter(p=>p.value.scheduleId===schedule.id).length,1,'Restart with a new request key never duplicates a fee draft')
 await cmd('packet:create',{engagementId:project.id,title:'Duplicate period fee',sources:[`retainerCharges:${fee.id}`]},h.owner,409)
 assert.equal(packet.value.status,'approved')
 const invoice=data.data.invoices.find(i=>i.value.packetId===packet.id)
 assert(invoice,'Eligible fee issues atomically with packet approval and the run receipt')
 assert.deepEqual([invoice.value.issueDate,invoice.value.dueDate,invoice.value.autoIssue.scheduleRevision,invoice.value.autoIssue.termsVersion],['2026-08-01','2026-08-31',schedule.revision,1])
 assert.equal(data.data.retainerRuns.find(r=>r.value.periodId===aug.id).value.invoiceId,invoice.id)
 data=await state();assert(data.data.invoices.find(i=>i.id===invoice.id).value.lines[0].sourceSnapshot)
 const reportResponse=await request('/api/gauge/state?from=2026-08-01&to=2026-10-31&asOf=2026-10-01',h.owner),report=await reportResponse.json()
 const cash=report.cash.engagements.find(e=>e.engagementId===project.id)
 assert(!cash.items.some(i=>!i.issued&&i.source===`retainerPeriods:${aug.id}`),'Issued principal replaces its fee schedule once')
 for(const [index,hours] of [8,8,8,8,8,3].entries()){
  const day=`2026-08-${String(index+2).padStart(2,'0')}`
  let time=await cmd('time:save',{engagementId:project.id,personId:worker.id,taskId:task.id,service:'Scheduled service',timezone:zone,start:`${day}T06:00:00-04:00`,end:`${day}T${String(6+hours).padStart(2,'0')}:00:00-04:00`,notes:'Confirmed monthly service',billable:true})
  time=await cmd('time:submit',time);await cmd('time:approve',time)
 }
 schedule=await cmd('retainer:schedule',{...policy,...schedule,heldPeriodIds:[aug.id],reason:'Client disputes August excess; hold it'})
 await run('2026-09-01');data=await state()
 let familyPeriods=data.data.retainerPeriods.filter(p=>p.value.rootId===term.id)
 assert.equal(familyPeriods.length,2);assert.equal(data.data.retainerCharges.filter(c=>c.value.rootId===term.id).length,2)
 const september=data.data.retainerRuns.find(r=>r.value.rootId===term.id&&r.value.issueDate==='2026-09-01')
 assert.deepEqual(september.value.exceptions,[{periodId:aug.id,reason:'Disputed overage held'}])
 assert.equal(data.data.packets.find(p=>p.id===september.value.packetId).value.totalMinor,300000)
 assert.equal(data.data.packets.find(p=>p.id===september.value.packetId).value.status,'draft')
 assert(!data.data.invoices.some(i=>i.value.packetId===september.value.packetId),'Disputed overages leave a draft and no invoice')
 await run('2026-09-01');assert.equal((await state()).data.retainerPeriods.filter(p=>p.value.rootId===term.id).length,2)
 schedule=await cmd('retainer:schedule',{...policy,...schedule,heldPeriodIds:[],reason:'Finance records resolution of August excess'})
 const races=await Promise.all([1,2].map(()=>h.post('/api/gauge/command',{key:crypto.randomUUID(),action:'retainer:run',...schedule,asOf:'2026-10-01'},h.owner)))
 assert(races.some(r=>r.status===200)&&races.every(r=>[200,409].includes(r.status)),'Concurrent workers either commit once, acknowledge completed work or refuse a stale observation')
 data=await state();const october=data.data.retainerRuns.find(r=>r.value.rootId===term.id&&r.value.issueDate==='2026-10-01'),octPacket=data.data.packets.find(p=>p.id===october.value.packetId)
 assert.equal(data.data.retainerPeriods.filter(p=>p.value.rootId===term.id).length,3)
 assert.equal(octPacket.value.totalMinor,360000);assert.deepEqual(octPacket.value.lines.map(l=>[l.kind,l.amountMinor]).sort(),[['retainerCharges',300000],['retainerPeriods',60000]].sort())
 const excessLine=octPacket.value.lines.find(l=>l.kind==='retainerPeriods');assert.equal(excessLine.durationSeconds,10800);assert.equal(excessLine.billRateMinor,20000)
 assert(!octPacket.value.lines.some(l=>l.kind==='time'),'Included 40 hours are never billed again')
 await run('2026-10-01');assert.equal((await state()).data.packets.filter(p=>p.value.scheduleId===schedule.id).length,3)
 assert.equal(octPacket.value.status,'approved')
 const octoberInvoice=data.data.invoices.find(i=>i.value.packetId===octPacket.id)
 assert.equal(Number(octoberInvoice.value.number.slice(4)),Number(invoice.value.number.slice(4))+1,'Draft exceptions consume no invoice number')
 assert.equal(octoberInvoice.value.lines.find(l=>l.kind==='retainerPeriods').durationSeconds,10800)
 assert.equal(octoberInvoice.value.lines.find(l=>l.kind==='retainerPeriods').billRateMinor,20000)
 await cmd('packet:create',{engagementId:project.id,title:'Duplicate overage',sources:[`retainerPeriods:${aug.id}`]},h.owner,409)
 // A contractual arrears date changes cash timing without repricing any earned period fee.
 schedule=await cmd('retainer:schedule',{...policy,...schedule,basis:'arrears',reason:'Next contractual bill is in arrears'})
 await run('2026-11-30');assert.equal((await state()).data.retainerPeriods.filter(p=>p.value.rootId===term.id).length,3)
 await run('2026-12-01');data=await state();assert.equal(data.data.retainerCharges.filter(c=>c.value.rootId===term.id).at(-1).value.date,'2026-12-01')
 assert.equal(data.data.retainerCharges.find(c=>c.id===fee.id).value.date,'2026-08-01','Later policy never changes an existing fee schedule')
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 try{
  await context.addCookies(h.owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  await page.goto(`${h.origin}/app/engagements?edit=${project.id}`)
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.locator('#retainer-schedules').scrollIntoViewIfNeeded()
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Scheduled billing fits ${width}`)
   assert.match(await page.locator('#retainer-schedules').innerText(),/Contractual billing basis/)
   if(process.env.GAUGE_RETAINER_SHOTS){await mkdir(process.env.GAUGE_RETAINER_SHOTS,{recursive:true});await page.locator('#retainer-schedules').screenshot({path:`${process.env.GAUGE_RETAINER_SHOTS}/scheduled-billing-${width}.png`})}
  }
  await page.goto(`${h.origin}/app/billing#invoice-${octoberInvoice.id}`)
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});const card=page.locator(`#invoice-${octoberInvoice.id}`);await card.scrollIntoViewIfNeeded();await card.getByText('Immutable invoice and sources',{exact:true}).click();assert.match(await card.innerText(),/Auto-issued under schedule revision/);assert.match(await card.innerText(),/3 hours ×/);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(process.env.GAUGE_RETAINER_SHOTS)await card.screenshot({path:`${process.env.GAUGE_RETAINER_SHOTS}/auto-issued-invoice-${width}.png`});await card.getByText('Immutable invoice and sources',{exact:true}).click()}
 }finally{await context.close()}
 for(const actor of [manager,staff,agent]){const view=await state(actor.cookie);for(const k of ['retainerSchedules','retainerCharges','retainerRuns'])assert.deepEqual(view.data[k],[]);assert.equal((await request(`/api/gauge/history/retainerSchedules/${schedule.id}`,actor.cookie)).status,403);await cmd('retainer:run',{...schedule,asOf:'2027-01-01'},actor.cookie,403)}
 schedule=await cmd('retainer:schedule',{...policy,...schedule,enabled:false,reason:'Finance revokes execution consent'})
 await cmd('retainer:run',{...schedule,asOf:'2027-01-01'},h.owner,409)
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM g_retainer_schedule_authority WHERE schedule_id=?').bind(schedule.id).first()).n,0)
 const cronPerson=await cmd('save:people',{name:'Scheduling finance',timezone:zone}),cronUser=await h.invite('scheduling-finance')
 await cmd('grant',{operatorId:cronUser.id,personId:cronPerson.id,role:'finance',enabled:true})
 const cronPreview=await cmd('retainer:preview',{engagementId:project.id,operation:'terms',terms:{...preview.terms,name:'Cron-operated service',services:['Cron support'],start:'2026-08-01'}})
 const cronTerm=await cmd('retainer:approve',{...cronPreview.input,fingerprint:cronPreview.fingerprint,reason:'Finance agrees the cron service'})
 const cronPolicy=await cmd('retainer:schedule',{...policy,retainerId:cronTerm.id,reason:'Finance consents to bounded automatic issue'},cronUser.cookie)
 const beforeCron=(await state()).data.retainerRuns.length
 assert.equal((await h.scheduled()).status,200)
 assert.equal((await state()).data.retainerRuns.length,beforeCron+1,'Real scheduled-event handler issues one due invoice without a session')
 assert.equal((await state()).data.retainerRuns.filter(r=>r.value.rootId===cronTerm.id).length,1)
 const cronInvoice=(await state()).data.invoices.find(i=>i.value.autoIssue?.scheduleId===cronPolicy.id);assert(cronInvoice)
 await cmd('grant',{operatorId:cronUser.id,personId:cronPerson.id,role:'staff',enabled:true})
 assert.equal((await h.scheduled()).status,200)
 assert.equal((await state()).data.retainerRuns.length,beforeCron+1,'Revoked scheduling finance cannot execute the next due job')
 await cmd('retainer:run',{...cronPolicy,asOf:'2026-09-01'},h.owner,403)
 const audit=await (await request('/api/gauge/audit?action=invoice:auto-issue',h.owner)).json();assert(JSON.stringify(audit).includes(octoberInvoice.id),'Automatic issue is attributed in the business audit')
 await retainerAutomaticExceptions(h,browser,{project,term,policy,clientId:client.id})
 await retainerRestartAndCloseJourney()
 console.log('PASS RETAINER-005 bounded automatic issue: exact fee/overage invoices, consecutive numbers, exception drafts, cap, current consent, locks, terms, PO, audit and 1440/390')
}

async function retainerAutomaticExceptions(h,browser,{project,term,policy,clientId}){
 const {cmd,state}=h
 const make=async(name,overrides={})=>{
  const preview=await cmd('retainer:preview',{engagementId:project.id,operation:'terms',terms:{...term.value.terms,name,services:[name],start:'2026-08-01'}})
  const t=await cmd('retainer:approve',{...preview.input,fingerprint:preview.fingerprint,reason:'Reviewed exception scenario'})
  const s=await cmd('retainer:schedule',{...policy,...overrides,retainerId:t.id})
  return {t,s}
 }
 const draft=async(s,asOf,reason)=>{
  const before=(await state()).data.invoices.length
  await cmd('retainer:run',{...s,asOf})
  const d=(await state()).data,run=d.retainerRuns.find(r=>r.value.scheduleSnapshot.id===s.id&&r.value.issueDate===asOf),p=d.packets.find(p=>p.id===run?.value.packetId)||d.packets.find(p=>p.value.scheduleId===s.id&&p.value.deferredSources)
  assert(p);assert.equal(p.value.status,'draft');assert.match(JSON.stringify(p.value.exceptions),reason);assert.equal(d.invoices.length,before)
  await cmd('retainer:run',{...s,asOf});assert.equal((await state()).data.packets.filter(p=>p.value.scheduleId===s.id).length,1,'Exception retry creates no duplicate draft')
  return p
 }
 const capped=await make('Over cap service',{capMinor:299999})
 await draft(capped.s,'2026-08-01',/exceeds the automatic issue cap/)
 const poClient=(await state()).data.clients.find(c=>c.id===clientId)
 const poRequired=await cmd('save:clients',{...poClient.value,...poClient,poRequired:true,poNumbers:['PO-RETAINER-2026']})
 const missingPO=await make('PO-reviewed service')
 await draft(missingPO.s,'2026-08-01',/matching saved PO/)
 await cmd('save:clients',{...poRequired.value,...poRequired,poRequired:false})
 const missingAddress=await make('Missing remittance',{remitTo:''})
 await draft(missingAddress.s,'2026-08-01',/bill-to and remit-to/)
 const newer=await make('Revised commercial service')
 const next=await cmd('retainer:preview',{engagementId:project.id,operation:'terms',previousId:newer.t.id,terms:{...newer.t.value.terms,start:'2026-09-01'}})
 await cmd('retainer:approve',{...next.input,fingerprint:next.fingerprint,reason:'Later version requires fresh auto-issue consent'})
 await cmd('retainer:run',{...newer.s,asOf:'2026-08-01'})
 const before=(await state()).data.invoices.length
 await cmd('retainer:run',{...newer.s,asOf:'2026-09-01'})
 const later=(await state()).data.retainerRuns.find(r=>r.value.scheduleSnapshot.id===newer.s.id&&r.value.issueDate==='2026-09-01')
 assert.match(JSON.stringify(later.value.exceptions),/newer than/);assert.equal((await state()).data.invoices.length,before)
 const locked=await make('Locked service')
 const oldTimePolicy=(await state()).data.timePolicies[0]
 const lock=await cmd('time:policy',{...oldTimePolicy,lockThrough:'2026-08-31',reason:'Finance locks August'})
 await draft(locked.s,'2026-08-01',/TIME-003 locked period/)
 await cmd('time:policy',{...lock,lockThrough:null,reason:'Finance reopens August with recorded reason'})
 // Disabling even an owner-consented schedule stops the next real cron.
 const enabled=await make('Disabled service')
 await cmd('retainer:schedule',{...policy,...enabled.s,retainerId:enabled.t.id,enabled:false,reason:'Withdraw scheduled issue authority'})
 await h.scheduled();assert(!(await state()).data.retainerRuns.some(r=>r.value.scheduleSnapshot.id===enabled.s.id))
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 try{
  await context.addCookies(h.owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  await page.goto(`${h.origin}/app/engagements?edit=${project.id}`)
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});const panel=page.locator('#retainer-schedules');assert.match(await panel.innerText(),/exceeds the automatic issue cap/);assert.match(await panel.innerText(),/matching saved PO/);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(process.env.GAUGE_RETAINER_SHOTS)await panel.screenshot({path:`${process.env.GAUGE_RETAINER_SHOTS}/automatic-exceptions-${width}.png`})}
 }finally{await context.close()}
}

async function retainerRestartAndCloseJourney(){
 const h=await harness({currency:'USD',timezone:'America/New_York'});let restarted
 try{
  const {cmd,state}=h
  const client=await cmd('save:clients',{name:'Northline monthly advisory',paymentTermsDays:14})
  const person=await cmd('save:people',{name:'Avery Finance',timezone:'America/New_York'})
  const project=await cmd('save:engagements',{name:'Northline advisory',clientId:client.id,leadId:person.id,members:[],scope:'Monthly advisory',timezone:'America/New_York'})
  await cmd('approval:limit',{reviewAboveMinor:100000,reason:'Owner permits monthly advisory invoice cap'})
  const p=await cmd('retainer:preview',{engagementId:project.id,operation:'terms',terms:{name:'Monthly advisory',feeMinor:100000,frequency:'monthly',unit:'hours',allowance:14400,services:['Advisory'],consumes:'billable',proration:'calendar',start:'2026-01-01',end:null,renewal:'automatic',noticeDays:0,rules:{carryCap:0,carryPeriods:0,deficit:false,overage:'bill',overageRate:25000}}})
  const term=await cmd('retainer:approve',{...p.input,fingerprint:p.fingerprint,reason:'Monthly advisory agreement'})
  const input={retainerId:term.id,basis:'advance',from:'2026-01-01',enabled:true,autoIssue:true,capMinor:100000,includeOverages:true,billTo:'Northline Finance',remitTo:'Advisory agency',reference:'Northline agreement',reason:'Owner consents to bounded automatic issue'}
  const schedule=await cmd('retainer:schedule',input)
  await cmd('retainer:run',{...schedule,asOf:'2026-01-01'})
  await cmd('retainer:run',{...schedule,asOf:'2026-02-01'})
  await h.close();restarted=await harness({persistenceDirectory:h.directory})
  await restarted.cmd('retainer:run',{...schedule,asOf:'2026-02-01'})
  await restarted.cmd('retainer:run',{...schedule,asOf:'2026-03-01'})
  await restarted.cmd('retainer:run',{...schedule,asOf:'2026-03-01'})
  let d=(await restarted.state()).data
  assert.deepEqual(d.invoices.map(i=>[i.value.number,i.value.issueDate,i.value.dueDate,i.value.totalMinor]),[['INV-000001','2026-01-01','2026-01-15',100000],['INV-000002','2026-02-01','2026-02-15',100000],['INV-000003','2026-03-01','2026-03-15',100000]],'Two month ends and a real worker restart issue each period once with consecutive numbers')
  assert.equal(d.retainerRuns.length,3);assert.equal(d.retainerCharges.length,3);assert.equal(d.packets.filter(p=>p.value.status==='approved').length,3)
  // An already-open period may be explicitly carried on the close checklist, but its later scheduled issue remains held.
  const closedPreview=await restarted.cmd('retainer:preview',{engagementId:project.id,operation:'terms',terms:{...p.terms,name:'January closed service',services:['Closed service']}})
  const closedTerm=await restarted.cmd('retainer:approve',{...closedPreview.input,fingerprint:closedPreview.fingerprint,reason:'Saved before agency close'})
  const held=await restarted.cmd('retainer:schedule',{...input,retainerId:closedTerm.id})
  await restarted.cmd('time:policy',{lockThrough:'2026-01-31',reason:'January time reconciled'})
  const invoice=d.invoices[0]
  await restarted.cmd('period:match',{month:'2026-01',invoiceId:invoice.id,invoiceRevision:invoice.revision,system:'synthetic-gauge-accounting',externalId:'synthetic-gauge-1',amountMinor:100000,currency:'USD',reference:'January accounting control',reason:'Match native invoice'})
  let preview=await restarted.cmd('period:preview',{month:'2026-01'})
  const exceptions=Object.fromEntries(preview.snapshot.checklist.blocking.filter(b=>b.kind==='retainers').map(b=>[b.id,'Finance explicitly retains the named open service period']))
  preview=await restarted.cmd('period:preview',{month:'2026-01',retainerExceptions:exceptions})
  assert.deepEqual(preview.snapshot.checklist.blocking,[])
  const prepared=await restarted.cmd('period:prepare',{...preview.input,fingerprint:preview.fingerprint,acknowledgeWip:true,wipReconciliation:'Reviewed all January WIP and held retainer periods',reason:'January close'})
  // The source review is at the saved cap and can be approved by this owner.
  const limit=(await restarted.state()).data.approvalPolicies[0]
  await restarted.cmd('approval:limit',{...limit,reviewAboveMinor:10000000,reason:'Owner sets close review limit'})
  // Review policy is not a source assumption of the close snapshot.
  await restarted.cmd('period:approve',prepared)
  const before=(await restarted.state()).data
  const heldDraft=await restarted.cmd('retainer:run',{...held,asOf:'2026-01-01'})
  assert.equal(heldDraft.value.status,'draft');assert.match(JSON.stringify(heldDraft.value.exceptions),/FINANCE-004 closed period/)
  await restarted.cmd('packet:approve',heldDraft,restarted.owner,409)
  await restarted.cmd('retainer:run',{...held,asOf:'2026-01-01'})
  d=(await restarted.state()).data
  assert.equal(d.invoices.length,before.invoices.length);assert.equal(d.retainerCharges.length,before.retainerCharges.length);assert.equal(d.retainerPeriods.length,before.retainerPeriods.length)
  assert.equal(d.packets.filter(p=>p.value.scheduleId===held.id).length,1,'Closed-period retries retain one exception draft without writing financial sources')
  console.log('PASS retainerRestartAndCloseJourney: two month ends, real restart, atomic numbered issue, closed-period exception draft')
 }finally{await restarted?.dispose();await h.dispose()}
}
