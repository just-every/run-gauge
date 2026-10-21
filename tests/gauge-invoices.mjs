import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {invoiceCorrectionJourney} from './gauge-invoice-corrections.mjs'

// REPORT-003 / INVOICE-006: production commands, pages, report CSV and specialist reconciliation.
export async function invoiceDashboardJourney(h,{worker,client,hourly,entry,packet}) {
 const {cmd,owner,request}=h
 const read=async(asOf='2026-10-19',cookie=owner)=>(await request(`/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=${asOf}`,cookie)).json()
 const bucket=d=>d.revenueDashboard.wip.find(x=>x.currency==='USD')
 // Isolate issued work from the separate journey that later adopts retainer terms.
 hourly=await cmd('save:engagements',{name:'Invoice support',clientId:client.id,leadId:worker.id,members:[worker.id],scope:'Collected support',timezone:'America/New_York'})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:hourly.id,mode:'hourly',amountMinor:100000,effortSeconds:14400,roundingSeconds:60,reason:'Invoice support terms'}))
 const task=await cmd('save:tasks',{engagementId:hourly.id,name:'Collected support',remainingSeconds:0})
 entry=await cmd('time:save',{personId:worker.id,engagementId:hourly.id,taskId:task.id,service:'Support',notes:'Collected support interval',timezone:'America/New_York',billable:true,start:'2026-10-07T09:00:00-04:00',end:'2026-10-07T13:00:00-04:00'})
 entry=await cmd('time:approve',await cmd('time:submit',entry))
 packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:hourly.id,title:'Collected support preparation',sources:[`time:${entry.id}`]}))
 const input={...packet,issueDate:'2026-10-10',dueDate:'2026-11-09',billTo:'Northwind accounts payable',remitTo:'Agency operating account',reference:'Support October'}
 // Replayed request keys cannot issue twice; racing different keys reserve one packet and one number.
 const key=randomUUID(),issue=()=>h.post('/api/gauge/command',{key,action:'invoice:issue',...input},owner)
 const outcomes=await Promise.all([issue(),h.post('/api/gauge/command',{key:randomUUID(),action:'invoice:issue',...input},owner)])
 assert.equal(outcomes.filter(r=>r.status===200).length,1,'REPORT-003 packet issues once under a race')
 const invoice=await outcomes.find(r=>r.status===200).json()
 const persisted=(await read()).data.invoices.find(r=>r.id===invoice.id)
 assert.equal(persisted.value.totalMinor,60000);assert.equal(persisted.value.lines[0].sourceId,entry.id)
 assert.equal(persisted.value.clientSnapshot.id,client.id);assert.equal(persisted.value.packetRevision,packet.revision)
 await cmd('invoice:issue',input,owner,409)
 let d=await read();assert.equal(bucket(d).amountMinor,62500);assert.equal(bucket(d).openMinor,60000);assert.equal(bucket(d).paidMinor,0)
 assert.equal(bucket(await read('2026-10-09')).amountMinor,122500,'REPORT-003 as-of before issue retains WIP')
 const cash=d.cash.engagements.find(x=>x.engagementId===hourly.id)
 assert.equal(cash.items.filter(x=>x.issued).length,1)
 assert.equal(cash.items.find(x=>x.issued).receiptDate,'2026-11-09')
 assert(!cash.items.some(x=>!x.issued&&x.revenueMonth==='2026-10'&&x.amountMinor===60000),'REPORT-003 issuance removes matching expected schedule once')
 assert.equal(d.margin.find(x=>x.engagementId===hourly.id).billedMinor,60000)
 assert.match(d.margin.find(x=>x.engagementId===hourly.id).billedLabel,/Invoiced/)
 await cmd('packet:adjust',{...packet,sourceId:entry.id,sourceKind:'time',correctedAmountMinor:50000,reason:'Must use future invoice credit flow'},owner,409)
 await cmd('payment:record',{...invoice,date:'2026-10-09',amountMinor:100,reference:'Before issue'},owner,400)
 await cmd('payment:record',{...invoice,date:'2026-10-11',amountMinor:100,currency:'CAD',reference:'Wrong currency'},owner,400)
 // FINANCE-002's inherited payment-promise obligation: move only the promised amount's cash month.
 await cmd('invoice:promise',{...invoice,date:'2026-12-15',amountMinor:10000,reference:'Client AP promise'})
 let promised=(await read()).cash.engagements.find(x=>x.engagementId===hourly.id).items
 assert.deepEqual(Object.fromEntries(promised.map(x=>[x.cashMonth,x.expectedMinor])),{'2026-12':5000,'2026-11':25000},'FINANCE-007 independent month-by-month promised cash recomputation');assert.equal(promised.find(x=>x.promised).cashMonth,'2026-12');assert.equal(promised.find(x=>x.promised).openMinor,10000)
 assert.equal(promised.reduce((n,x)=>n+x.openMinor,0),60000)
 await cmd('invoice:promise',{...invoice,date:'2027-01-15',amountMinor:10000,reference:'Client AP revised promise'})
 promised=(await read()).cash.engagements.find(x=>x.engagementId===hourly.id).items
 assert.equal(promised.find(x=>x.promised).cashMonth,'2027-01');assert.equal(promised.filter(x=>x.promised).length,1)
 assert.equal(promised.reduce((n,x)=>n+x.expectedMinor,0),30000,'FINANCE-007 independent recomputation: full open 60000 times client collection probability 50%')
 const broken=(await read('2027-02-02')).cash.engagements.find(x=>x.engagementId===hourly.id).items.find(x=>x.promised)
 assert.equal(broken.cashMonth,'2027-02');assert.equal(broken.pastDue,true)
 // FINANCE-003 inherits invoice/payment/promise basis and refuses stale adoption after a receipt.
 const contractor=await cmd('save:people',{name:'Invoice scenario contractor',timezone:'America/New_York',employmentType:'contractor'})
 await cmd('save:rates',{personId:contractor.id,service:'*',effective:'2026-01-01',costMinor:6000,billMinor:17000})
 const booking=await cmd('save:staffing',{engagementId:hourly.id,personId:worker.id,service:'Support',from:'2026-11-02',to:'2026-11-03',dailySeconds:3600,commitment:'committed'})
 const scenarioInput={asOf:'2026-10-19',changes:[{...booking,personId:contractor.id,effectiveFrom:'2026-11-02'}]}
 const preview=await cmd('projectScenario:preview',scenarioInput)
 assert.equal(preview.baseline.cash.engagements.find(x=>x.engagementId===hourly.id).items.find(x=>x.invoiceId===invoice.id&&!x.promised).openMinor,50000)
 const preparedScenario=await cmd('projectScenario:prepare',{...scenarioInput,fingerprint:preview.fingerprint,name:'Invoice source scenario',reason:'Keep issued cash while replacing future work'})
 const paymentKey=randomUUID(),paymentInput={...invoice,date:'2026-10-11',amountMinor:20000,reference:'Bank deposit NW-1'}
 const pay=await cmd('payment:record',{...paymentInput,key:paymentKey})
 await cmd('projectScenario:preview',{...preparedScenario,asOf:'2026-10-19',selectedIds:[booking.id]},owner,409)
 assert.deepEqual(await cmd('payment:record',{...paymentInput,key:paymentKey}),pay,'REPORT-003 receipt request replay is exact')
 await cmd('payment:record',paymentInput,owner,409)
 d=await read();assert.equal(bucket(d).openMinor,40000);assert.equal(bucket(d).paidMinor,20000)
 const future=await cmd('payment:record',{...invoice,date:'2026-10-20',amountMinor:10000,reference:'Bank deposit NW-2'})
 assert.equal(bucket(await read()).paidMinor,20000,'REPORT-003 future-dated receipts stay out of as-of totals')
 assert.equal(bucket(await read('2026-10-20')).paidMinor,30000)
 // Both competing receipts fit the old balance, but together exceed it: only one commits.
 const races=await Promise.all(['a','b'].map(reference=>h.post('/api/gauge/command',{key:randomUUID(),action:'payment:record',...invoice,date:'2026-10-12',amountMinor:30000,reference:`Bank deposit ${reference}`},owner)))
 assert.equal(races.filter(r=>r.status===200).length,1,'REPORT-003 concurrent payments cannot over-allocate')
 await cmd('payment:record',{...invoice,date:'2026-10-20',amountMinor:1,reference:'Overpayment'},owner,409)
 d=await read('2026-10-20');assert.equal(bucket(d).openMinor,0);assert.equal(bucket(d).paidMinor,60000)
 assert.equal(d.cash.issuedTotals[0].openMinor,0);assert.equal(d.cash.paymentTotals[0].amountMinor,60000)
 assert.equal(d.margin.find(x=>x.engagementId===hourly.id).paidCashMinor,60000)
 assert.equal(d.lineage.find(x=>x.id==='revenue:USD:paidMinor').value,60000)
 assert(d.lineage.find(x=>x.id==='revenue:USD:paidMinor').sources.some(s=>s.kind==='payments'&&s.id===future.id))
 const csv=await request('/api/gauge/report.csv?'+new URLSearchParams({from:d.from,to:d.to,asOf:'2026-10-20',fingerprint:d.fingerprint}),owner)
 assert.equal(csv.status,200);assert.match(await csv.text(),/revenue:USD:paidMinor/)
 const sources=[persisted,...d.data.payments].map(r=>({kind:r.id===persisted.id?'invoices':'payments',id:r.id,revision:r.revision}))
 const handoff=await cmd('handoff:prepare',{purpose:'accounting',recipient:'Northwind accountant',reason:'Reconcile issued document and recorded receipts separately',sources})
 const prepared=(await read()).data.specialistHandoffs.find(x=>x.id===handoff.id)
 assert.equal(prepared.value.controlTotals.find(x=>x.category==='invoice').amountMinor,60000)
 assert.equal(prepared.value.controlTotals.find(x=>x.category==='payment').amountMinor,60000)
 const result={handoffId:handoff.id,artifactHash:prepared.value.artifactHash,lines:prepared.value.lines.map((l,i)=>({id:l.id,status:i?'accepted':'rejected',...(i?{}:{reason:'Accountant requests issued document'}),currency:l.currency,amountMinor:l.amountMinor,durationSeconds:l.durationSeconds}))}
 await cmd('handoff:record-result',{...handoff,result})
 assert.equal((await read()).data.specialistHandoffs.find(x=>x.id===handoff.id).value.result.rejectedCount,1)
 for(const role of ['staff','lead','agent']){
  const actor=await h.invite(`invoice-${role}`);await cmd('grant',{operatorId:actor.id,personId:worker.id,role,enabled:true,...(role==='agent'?{purpose:'billing',engagementIds:[hourly.id]}:{})})
  const restricted=await read('2026-10-20',actor.cookie);assert.deepEqual(restricted.data.invoices,[]);assert.deepEqual(restricted.data.payments,[])
  for(const kind of ['invoices','payments'])assert.equal((await request(`/api/gauge/history/${kind}/${kind==='invoices'?invoice.id:pay.id}`,actor.cookie)).status,403)
  await cmd('invoice:issue',input,actor.cookie,403);await cmd('payment:record',paymentInput,actor.cookie,403)
 }
 // A second deal traverses won, converted, delivered, invoiced and paid through the native doors.
 const deal=await cmd('save:opportunities',{name:'Collected workshop',clientId:client.id,ownerId:worker.id,stage:'won',probability:100,from:'2026-10-01',to:'2026-10-31',services:'Workshop',amountMinor:7500,demandSeconds:3600})
 const project=await cmd('opportunity:convert',deal),before=(await read()).pipeline.find(x=>x.currency==='USD').bookedMinor
 const budget=(await read()).data.budgets.find(x=>x.value.engagementId===project.id);await cmd('budget:approve',budget)
 assert.equal((await read()).pipeline.find(x=>x.currency==='USD').bookedMinor,before,'REPORT-003 won conversion counts signed value once')
 let milestone=await cmd('save:milestones',{engagementId:project.id,name:'Delivered workshop',due:'2026-10-10',amountMinor:7500})
 milestone=await cmd('milestone:approve',milestone)
 milestone=await cmd('milestone:deliver',{...milestone,date:'2026-10-10',reason:'Workshop delivered'})
 const delivery=(await read()).data.milestones.find(x=>x.id===milestone.id).value.delivery.deliveries.at(-1)
 milestone=await cmd('milestone:decision',{...milestone,deliveryId:delivery.id,outcome:'accepted',date:'2026-10-10',contact:'Northwind sponsor',reason:'Sponsor reported workshop complete'})
 milestone=await cmd('milestone:authorize',milestone)
 let workshop=await cmd('packet:create',{engagementId:project.id,title:'Workshop delivery',sources:[`milestones:${milestone.id}`]});workshop=await cmd('packet:approve',workshop)
 // Use the actual forms at both sizes and inspect the resulting issued/paid states.
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
  await context.addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  const capture=async(name)=>{for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`REPORT-003 billing fits ${width}`);if(process.env.GAUGE_CASH_SHOTS){await mkdir(process.env.GAUGE_CASH_SHOTS,{recursive:true});await page.locator('#invoices').screenshot({path:`${process.env.GAUGE_CASH_SHOTS}/REPORT-003-billing-${name}-${width}.png`});await page.locator('#specialist-handoffs').screenshot({path:`${process.env.GAUGE_CASH_SHOTS}/handoffs-${name}-${width}.png`})}}}
  await page.setViewportSize({width:1440,height:1000})
  await page.goto(h.origin+'/app/billing')
  const issueForm=page.locator('form').filter({has:page.locator(`input[name="action"][value="invoice:issue"]`)}).filter({has:page.locator(`input[name="id"][value="${workshop.id}"]`)})
  await issueForm.locator('..').locator('..').locator('summary').click()
  await issueForm.getByLabel('Issue date',{exact:true}).fill('2026-10-10');await issueForm.getByLabel('Due date under saved client terms').fill('2026-11-09')
  await issueForm.getByLabel('Remit to',{exact:true}).fill('Agency operating account');await issueForm.getByLabel('PO or billing reference').fill('Workshop October')
  await issueForm.getByRole('button',{name:'Issue invoice',exact:true}).click();await page.waitForURL('**/app/billing?saved=1')
  const workshopInvoice=(await read()).data.invoices.find(x=>x.value.packetId===workshop.id)
  assert.equal(workshopInvoice.value.lines[0].sourceId,milestone.id)
  assert.equal((await read()).cash.engagements.find(x=>x.engagementId===project.id).items.filter(x=>x.issued).length,1)
  assert(!(await read()).cash.engagements.find(x=>x.engagementId===project.id).items.some(x=>x.source===`milestones:${milestone.id}`))
  await capture('issued');await page.setViewportSize({width:390,height:1000})
  const receipt=page.locator(`#invoice-${workshopInvoice.id}`).locator('form').filter({has:page.locator('input[name="action"][value="payment:record"]')})
  await receipt.getByLabel('Receipt date').fill('2026-10-11');await receipt.getByLabel('Unique bank receipt reference').fill('Workshop bank receipt')
  await receipt.getByRole('button',{name:'Record receipt'}).click();await page.waitForURL('**/app/billing?saved=1')
  assert.match(await page.locator(`#invoice-${workshopInvoice.id}`).innerText(),/Paid by recorded receipts/)
  const transfer=(await read()).revenueDashboard.wip.find(x=>x.currency==='USD');assert.equal(transfer.invoicedMinor,transfer.openMinor+transfer.paidMinor)
  await capture('paid')
  assert.match(await page.locator(`#invoice-${invoice.id}`).innerText(),/Paid by recorded receipts/)
  assert.match(await page.locator(`#invoice-${invoice.id}`).innerText(),/not provider verified/)
 }finally{await browser.close()}
 await invoiceCorrectionJourney(h,{worker})
 console.log('PASS REPORT-003 / INVOICE-006 native invoice-to-paid: source transfer once, as-of receipts, immutable source/client terms, races/replay, exact cash and margin, CSV/lineage, specialist reconciliation and privacy; provider/FX acceptance stays partial')
}

// INVOICE-006 real issuance and manual allocations, then aging/statement downloads.
export async function receivablesJourney(h,worker) {
 const {cmd,request,owner}=h, asOf='2026-10-31'
 const read=async(cookie=owner,clientId=null,on=asOf)=>{
  const r=await request('/api/gauge/receivables?'+new URLSearchParams({asOf:on,...(clientId?{clientId}:{})}),cookie)
  assert.equal(r.status,200);return r.json()
 }
 const client=await cmd('save:clients',{name:'=Statement agency',paymentTermsDays:30})
 const project=await cmd('save:engagements',{name:'Aging service',clientId:client.id,leadId:worker.id,members:[worker.id],scope:'Statement controls',timezone:'America/New_York'})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:200000,effortSeconds:36000,roundingSeconds:60,reason:'Statement control terms'}))
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Statement service',remainingSeconds:0})
 const plus=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)
 const invoices=[]
 for(const [index,days] of [0,1,30,31,60,61,90,91,-1,-31].entries()){
  const day=`2026-01-${String(index+1).padStart(2,'0')}`
  let time=await cmd('time:save',{personId:worker.id,engagementId:project.id,taskId:task.id,service:'Support',notes:'Statement service',timezone:'America/New_York',billable:true,start:day+'T09:00:00-05:00',end:day+'T10:00:00-05:00'})
  time=await cmd('time:approve',await cmd('time:submit',time))
  const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:'Statement service',sources:[`time:${time.id}`]}))
  const dueDate=plus(asOf,-days),issueDate=plus(dueDate,-30)
  invoices.push(await cmd('invoice:issue',{...packet,issueDate,dueDate,billTo:'Statement agency',remitTo:'Agency',reference:'Aging service'}))
 }
 await cmd('payment:record',{...invoices[0],date:asOf,amountMinor:3000,reference:'=Receipt on as-of day'})
 await cmd('payment:record',{...invoices[1],date:'2026-11-01',amountMinor:4000,reference:'Future receipt'})
 const report=await read(owner,client.id), total=report.totals[0]
 assert.equal(report.invoices.length,9,'INVOICE-006 future-issued document excluded')
 assert.deepEqual([total.invoicedMinor,total.paidMinor,total.openMinor],[135000,3000,132000],'INVOICE-006 independent statement total = nine 15000 invoices less 3000 received')
 assert.deepEqual(total.aging.map(b=>b.amountMinor),[27000,30000,30000,30000,15000],'INVOICE-006 all inclusive aging boundaries reconcile to open balance')
 assert.equal(total.aging.reduce((n,b)=>n+b.amountMinor,0),total.openMinor)
 assert(report.invoices.every(i=>i.invoicedMinor===i.paidMinor+i.openMinor))
 const next=await read(owner,client.id,'2026-11-01')
 assert.equal(next.invoices.length,10);assert.equal(next.totals[0].paidMinor,7000);assert.equal(next.totals[0].openMinor,143000)
 const all=await read()
 assert(all.invoices.some(i=>i.openMinor===0&&i.paidMinor>0),'INVOICE-006 fully paid invoices stay on statements')
 assert(all.invoices.length>report.invoices.length,'INVOICE-006 client statement excludes other clients')
 assert.deepEqual(report.clients[0].totals,report.totals)
 const download=d=>'/api/gauge/receivables.csv?'+new URLSearchParams({asOf,clientId:client.id,fingerprint:d.fingerprint})
 const response=await request(download(report),owner);assert.equal(response.status,200)
 const rows=JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'],{input:await response.text(),encoding:'utf8'}))
 const documents=rows.filter(r=>r.row==='invoice'),receipts=rows.filter(r=>r.row==='receipt'),aging=rows.filter(r=>r.row==='aging'),totals=rows.filter(r=>r.row==='client total')
 assert.equal(documents.reduce((n,r)=>n+Number(r['invoiced minor']),0),135000)
 assert.equal(receipts.reduce((n,r)=>n+Number(r['paid minor']),0),3000)
 assert.equal(aging.reduce((n,r)=>n+Number(r['open minor']),0),132000)
 assert.equal(Number(totals[0]['open minor']),132000)
 assert.equal(documents[0].client,"'=Statement agency");assert.equal(receipts[0].reference,"'=Receipt on as-of day",'INVOICE-006 statement CSV escapes formula-like names and references')
 for(const role of ['lead','staff','agent','finance']){
  const person=await h.invite(`statement-${role}`);await cmd('grant',{operatorId:person.id,personId:worker.id,role,enabled:true,...(role==='agent'?{purpose:'billing',engagementIds:[project.id]}:{})})
  if(role==='finance'){
   assert.equal((await read(person.cookie,client.id)).totals[0].openMinor,132000)
   await cmd('grant',{operatorId:person.id,personId:worker.id,role,enabled:false})
  }
  for(const path of ['/api/gauge/receivables',download(report)])assert.equal((await request(path,person.cookie)).status,403,'INVOICE-006 statement reads and downloads require current finance authority')
 }
 assert.equal((await request('/api/gauge/receivables')).status,401)
 assert.equal((await request('/api/gauge/receivables?asOf=invalid',owner)).status,400)
 assert.equal((await request('/api/gauge/receivables?asOf='+asOf,owner,{method:'POST'})).status,405)
 await cmd('payment:record',{...invoices[0],date:asOf,amountMinor:1000,reference:'Later recorded allocation'})
 assert.equal((await request(download(report),owner)).status,409,'INVOICE-006 changed allocations require refreshing before statement export')
 assert.equal((await read(owner,client.id)).totals[0].openMinor,131000)
 console.log('PASS INVOICE-006 dated aging and client statements: independent totals at all bucket edges, inclusive dates, paid invoices, source receipt CSV, safe text, client filtering, current finance authority and stale-export refusal')
}

// BUDGET-002: exact source slices, through the ordinary finance packet/invoice doors.
export async function notToExceedJourney(h){
 const {cmd,state,request,owner}=h,zone='America/New_York'
 const client=await cmd('save:clients',{name:'Capped hourly client'})
 const make=async(name,month)=>{
  const worker=await cmd('save:people',{name:name+' specialist',timezone:zone})
  const project=await cmd('save:engagements',{name,clientId:client.id,leadId:worker.id,members:[worker.id],scope:'Approved hourly not-to-exceed work',timezone:zone})
  const budget=await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',notToExceed:true,amountMinor:1000000,effortSeconds:252000,roundingSeconds:1,reason:'Accepted $10,000 cap'}))
  await cmd('save:rates',{personId:worker.id,service:'Capped service',effective:'2026-01-01',costMinor:9000,billMinor:15000})
  const task=await cmd('save:tasks',{engagementId:project.id,name:'Capped delivery',remainingSeconds:0}),entries=[]
  // Save and approve out of work-date order; eligibility must still take the earliest work first.
  for(let n=10;n>=1;n--){const day=`2026-${month}-${String(n).padStart(2,'0')}`;let time=await cmd('time:save',{engagementId:project.id,taskId:task.id,personId:worker.id,service:'Capped service',timezone:zone,start:`${day}T06:00:00-05:00`,end:`${day}T13:00:00-05:00`,notes:'Approved capped service',billable:true});time=await cmd('time:approve',await cmd('time:submit',time));entries.push(time)}
  return {worker,project,budget,entries}
 }
 const first=await make('Change-order release','01'),before=(await state()).data.time.filter(t=>t.value.engagementId===first.project.id)
 await cmd('packet:create',{engagementId:first.project.id,title:'Whole-entry cap bypass',sources:[`time:${first.entries[0].id}`]},owner,409)
 const draft=await cmd('cap:draft',{engagementId:first.project.id,budgetId:first.budget.id,budgetRevision:first.budget.revision,title:'Exactly in cap'})
 let data=await state(),packet=data.data.packets.find(p=>p.id===draft.id)
 assert.equal(packet.value.totalMinor,1000000);assert.equal(packet.value.lines.reduce((n,l)=>n+l.durationSeconds,0),240000,'66 h 40 min are eligible')
 const ordered=packet.value.lines.map(l=>data.data.timeSlices.find(s=>s.id===l.sourceId).value.sourceSnapshot.value.workDate)
 assert.deepEqual(ordered,[...ordered].sort(),'Cap fills in work-date order regardless of approval order')
 const held=data.capBalances.find(b=>b.engagementId===first.project.id)
 assert.equal(held.rows.reduce((n,r)=>n+r.heldSeconds,0),12000);assert.equal(held.rows.reduce((n,r)=>n+r.heldMinor,0),50000,'3 h 20 min / $500 stay held')
 assert.deepEqual(data.data.time.filter(t=>t.value.engagementId===first.project.id),before,'Splitting billing never changes approved time or its economics')
 await cmd('cap:draft',{engagementId:first.project.id,budgetId:first.budget.id,budgetRevision:first.budget.revision,title:'No excess billing'},owner,409)
 const approved=await cmd('packet:approve',packet),invoice=await cmd('invoice:issue',{...approved,issueDate:'2026-01-31',dueDate:'2026-03-02',billTo:'Capped hourly client',remitTo:'Agency',reference:'January cap'})
 assert.equal((await state()).data.invoices.find(i=>i.id===invoice.id).value.totalMinor,1000000)
 const report=await(await request('/api/gauge/state?from=2026-01-01&to=2026-01-31&asOf=2026-02-01',owner)).json()
 assert(!report.cash.engagements.find(e=>e.engagementId===first.project.id).items.some(i=>!i.issued&&i.openMinor>0),'Held excess is excluded from expected cash')
 const raised=await cmd('budget:approve',await cmd('save:budgets',{engagementId:first.project.id,mode:'hourly',amountMinor:1100000,effortSeconds:252000,roundingSeconds:1,reason:'Accepted $1,000 change order'}))
 const release=await cmd('cap:draft',{engagementId:first.project.id,budgetId:raised.id,budgetRevision:raised.revision,title:'Released $500 excess'})
 data=await state();assert.equal(data.data.packets.find(p=>p.id===release.id).value.totalMinor,50000)
 assert.equal(data.data.packets.find(p=>p.id===release.id).value.lines.reduce((n,l)=>n+l.durationSeconds,0),12000)
 await cmd('packet:approve',release)
 assert.deepEqual((await state()).data.time.filter(t=>t.value.engagementId===first.project.id),before)
 // A cancelled draft releases exactly its ranges, including a gap before a later reservation.
 const second=await make('Reviewed write-down','02')
 let cancelled=await cmd('cap:draft',{engagementId:second.project.id,budgetId:second.budget.id,budgetRevision:second.budget.revision,title:'Cancel and recompute'})
 await cmd('packet:cancel',cancelled)
 let kept=await cmd('cap:draft',{engagementId:second.project.id,budgetId:second.budget.id,budgetRevision:second.budget.revision,title:'Restored eligible ranges'})
 assert.equal((await state()).data.packets.find(p=>p.id===kept.id).value.totalMinor,1000000)
 const secondBefore=(await state()).data.time.filter(t=>t.value.engagementId===second.project.id)
 const limit=(await state()).data.approvalPolicies[0]
 await cmd('approval:limit',{...(limit??{}),reviewAboveMinor:100,reason:'Independent approval for cap write-downs'})
 const financePerson=await cmd('save:people',{name:'Independent cap reviewer',timezone:zone}),reviewer=await h.invite('cap-finance')
 await cmd('grant',{operatorId:reviewer.id,personId:financePerson.id,role:'finance',enabled:true})
 for(const row of (await state()).capBalances.find(b=>b.engagementId===second.project.id).rows.filter(r=>r.heldSeconds>0)){
  const prepared=await cmd('cap:write-down',{engagementId:second.project.id,sourceId:row.sourceId,sourceRevision:row.revision,offsetSeconds:row.offsetSeconds,durationSeconds:row.heldSeconds,reason:'Finance agrees to waive held hourly work'})
  await cmd('cap:write-down-approve',prepared,owner,403);await cmd('cap:write-down-approve',prepared,reviewer.cookie)
 }
 data=await state();assert.equal(data.data.capWriteDowns.filter(w=>w.value.engagementId===second.project.id&&w.value.status==='approved').reduce((n,w)=>n+w.value.amountMinor,0),50000)
 assert.deepEqual(data.data.time.filter(t=>t.value.engagementId===second.project.id),secondBefore)
 const next=await cmd('budget:approve',await cmd('save:budgets',{engagementId:second.project.id,mode:'hourly',amountMinor:1100000,effortSeconds:252000,roundingSeconds:1,reason:'Later accepted cap increase'}))
 await cmd('cap:draft',{engagementId:second.project.id,budgetId:next.id,budgetRevision:next.revision,title:'Written-down time cannot return'},owner,409)
 const lead=await h.invite('cap-lead');await cmd('grant',{operatorId:lead.id,personId:first.worker.id,role:'lead',enabled:true})
 const restricted=await state(lead.cookie);assert.deepEqual(restricted.capBalances,[]);assert.deepEqual(restricted.data.timeSlices,[]);assert.deepEqual(restricted.data.capWriteDowns,[])
 await cmd('cap:draft',{engagementId:first.project.id,budgetId:raised.id,budgetRevision:raised.revision,title:'Lead cannot bill'},lead.cookie,403)
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}));const page=await context.newPage();await page.goto(h.origin+'/app/billing')
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.locator('#budget-caps').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Not-to-exceed billing fits ${width}`);if(process.env.GAUGE_BUDGET_SHOTS){await mkdir(process.env.GAUGE_BUDGET_SHOTS,{recursive:true});await page.locator('#budget-caps').screenshot({path:`${process.env.GAUGE_BUDGET_SHOTS}/caps-${width}.png`})}}
 }finally{await browser.close()}
 const currentPolicy=(await state()).data.approvalPolicies[0];await cmd('approval:limit',{...currentPolicy,reviewAboveMinor:limit?.value.reviewAboveMinor??null,reason:'Restore the pre-journey review limit after isolated cap proof'})
 console.log('PASS BUDGET-002 not-to-exceed: $10,000 / 66 h 40 min eligible, $500 / 3 h 20 min held, accepted change-order release, reviewed permanent write-down, exact time preservation, cancellation, source-date order, cash hold, privacy and 1440/390')
}

export async function phaseBudgetJourney(h){
 const {cmd,state,request,owner}=h,zone='America/New_York'
 const worker=await cmd('save:people',{name:'Phase delivery specialist',timezone:zone}),client=await cmd('save:clients',{name:'Phase budget client'})
 const project=await cmd('save:engagements',{name:'Discovery and delivery',clientId:client.id,leadId:worker.id,members:[worker.id],scope:'$60,000 split into distinct service billing bases',timezone:zone})
 const phases=[{key:'discovery',name:'Discovery',service:'Discovery',mode:'hourly',hourBudgetSeconds:360000,feeBudgetMinor:2000000,expenseBudgetMinor:100000,marginBasisPoints:3000},{key:'delivery',name:'Delivery',service:'Delivery',mode:'fixed',hourBudgetSeconds:720000,feeBudgetMinor:4000000,expenseBudgetMinor:200000,marginBasisPoints:4000}]
 const terms={engagementId:project.id,mode:'hourly',amountMinor:6000000,effortSeconds:1080000,expenseBudgetMinor:300000,roundingSeconds:60,reason:'Accepted Discovery and Delivery phase allowances',phases}
 await cmd('save:budgets',{...terms,amountMinor:5999999},owner,400)
 const budget=await cmd('budget:approve',await cmd('save:budgets',terms))
 const manager=await h.invite('phase-manager');await cmd('grant',{operatorId:manager.id,personId:worker.id,role:'lead',enabled:true})
 await cmd('budget:thresholds',{engagementId:project.id,phaseKey:'discovery',thresholds:[75,90],reason:'Owner-approved phase thresholds'},manager.cookie,403)
 await cmd('budget:thresholds',{engagementId:project.id,phaseKey:'discovery',thresholds:[75,90],reason:'Owner approves 75% and 90% hour, fee and expense alerts'})
 for(const service of ['Discovery','Delivery'])await cmd('save:rates',{personId:worker.id,service,effective:'2026-01-01',costMinor:9000,billMinor:15000})
 const discovery=await cmd('save:tasks',{engagementId:project.id,name:'Discovery work',phaseKey:'discovery',remainingSeconds:7200}),delivery=await cmd('save:tasks',{engagementId:project.id,name:'Delivery work',phaseKey:'delivery',remainingSeconds:7200})
 const actual=async(day,hours,phase='discovery',approve=true)=>{let t=await cmd('time:save',{personId:worker.id,engagementId:project.id,taskId:phase==='discovery'?discovery.id:delivery.id,service:phase==='discovery'?'Discovery':'Delivery',timezone:zone,notes:'Approved phase actuals',billable:true,start:`2026-10-${String(day).padStart(2,'0')}T06:00:00-04:00`,end:`2026-10-${String(day).padStart(2,'0')}T${String(6+hours).padStart(2,'0')}:00:00-04:00`});t=await cmd('time:submit',t);return approve?cmd('time:approve',t):t}
 const entries=[];for(let n=1;n<=9;n++)entries.push(await actual(n,8));const submitted76=await actual(10,4,'discovery',false);assert((await state()).data.budgetAlerts.some(a=>a.value.engagementId===project.id&&a.value.phaseKey==='discovery'&&a.value.metric==='hours'&&a.value.threshold===75),'Submitted work already counts toward the 75% crossing');entries.push(await cmd('time:approve',submitted76))
 let data=await state(),alerts=()=>data.data.budgetAlerts.filter(a=>a.value.engagementId===project.id&&a.value.phaseKey==='discovery'&&a.value.metric==='hours')
 assert.deepEqual(alerts().map(a=>a.value.threshold),[75],'76 hours cross only 75%')
 entries.push(await actual(11,8));entries.push(await actual(12,7));data=await state();assert.deepEqual(alerts().map(a=>a.value.threshold),[75,90],'91 hours cross each threshold once')
 let corrected=await cmd('time:correct',{...entries[0],reason:'Reviewed correction with the same actual interval'});corrected=await cmd('time:approve',await cmd('time:submit',corrected));entries[0]=corrected
 data=await state();assert.deepEqual(alerts().map(a=>a.value.threshold),[75,90],'Re-approval never duplicates a threshold event')
 await actual(17,1,'delivery');await actual(16,1,'discovery',false)
 for(const [taskId,minor] of [[discovery.id,2500],[delivery.id,5000]]){let expense=await cmd('expense:save',{engagementId:project.id,taskId,personId:worker.id,date:'2026-10-18',description:'Phase expense',amountMinor:minor,reimbursable:false});expense=await cmd('expense:submit',expense);await cmd('expense:approve',expense)}
 for(const [phaseKey,day] of [['discovery','21'],['delivery','22']])await cmd('save:staffing',{engagementId:project.id,personId:worker.id,phaseKey,from:`2026-10-${day}`,to:`2026-10-${day}`,dailySeconds:7200,commitment:'committed',service:phaseKey==='discovery'?'Discovery':'Delivery',billable:true})
 let milestone=await cmd('milestone:approve',await cmd('save:milestones',{engagementId:project.id,phaseKey:'delivery',name:'Fixed delivery',due:'2026-10-15',amountMinor:4000000}))
 milestone=await cmd('milestone:deliver',{...milestone,date:'2026-10-15',reason:'Fixed phase delivered'})
 const delivered=(await state()).data.milestones.find(m=>m.id===milestone.id).value.delivery.deliveries.at(-1)
 milestone=await cmd('milestone:decision',{...milestone,deliveryId:delivered.id,outcome:'accepted',date:'2026-10-15',contact:'Client sponsor',reason:'Sponsor recorded acceptance'})
 milestone=await cmd('milestone:authorize',milestone)
 const hourlyPacket=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:'Hourly Discovery',sources:entries.map(t=>`time:${t.id}`)}))
 await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:'Fixed Delivery',sources:[`milestones:${milestone.id}`]}))
 const financePerson=await cmd('save:people',{name:'Phase finance reviewer',timezone:zone}),reviewer=await h.invite('phase-finance');await cmd('grant',{operatorId:reviewer.id,personId:financePerson.id,role:'finance',enabled:true})
 const source=(await state()).data.packets.find(p=>p.id===hourlyPacket.id).value.lines[0]
 const adjustment=await cmd('packet:adjust',{...hourlyPacket,sourceId:source.sourceId,sourceKind:'time',correctedAmountMinor:source.amountMinor-10000,reason:'Reviewed Discovery write-down'})
 await cmd('packet:approve',adjustment,reviewer.cookie)
 const read=async()=>{const r=await request('/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=2026-10-20',owner);assert.equal(r.status,200);return r.json()}
 data=await read();const margins=data.phaseMargins.filter(m=>m.engagementId===project.id),d=margins.find(m=>m.phase.key==='discovery'),f=margins.find(m=>m.phase.key==='delivery')
 assert.deepEqual([d.approvedCostMinor,d.provisionalCostMinor,d.earnedValueMinor,d.billedMinor,d.creditsMinor,d.remainingTaskSeconds,d.committedFutureSeconds,d.etcFeesMinor,d.eacFeesMinor,d.etcCostMinor,d.eacCostMinor,d.actualMarginMinor,d.forecastMarginMinor],[821500,9000,1365000,1355000,-10000,7200,7200,30000,1495000,18000,939500,543500,555500],'Independent Discovery FINANCE-001 figures reconcile')
 assert.deepEqual([f.approvedCostMinor,f.provisionalCostMinor,f.earnedValueMinor,f.billedMinor,f.creditsMinor,f.remainingTaskSeconds,f.committedFutureSeconds,f.etcFeesMinor,f.eacFeesMinor,f.etcCostMinor,f.eacCostMinor,f.actualMarginMinor,f.forecastMarginMinor],[14000,0,4000000,4000000,0,7200,7200,0,4200000,18000,232000,3986000,3968000],'Independent fixed Delivery FINANCE-001 figures reconcile')
 const forecast=data.forecast.engagements.find(e=>e.engagementId===project.id)
 const portfolio=data.portfolio.projects.find(p=>p.engagementId===project.id);assert.deepEqual([portfolio.earnedMinor,portfolio.costMinor,portfolio.marginMinor],[5365000,835500,4529500],'Portfolio uses each phase billing basis once')
 assert.equal(forecast.basis,'mixed');assert.deepEqual([forecast.eacFeesMinor,forecast.eacCostMinor,forecast.marginMinor],[5695000,1171500,4523500])
 for(const phase of ['discovery','delivery'])for(const field of ['approvedCostMinor','provisionalCostMinor','earnedValueMinor','billedMinor','creditsMinor','actualMarginMinor','forecastMarginMinor'])assert(data.lineage.some(l=>l.id===`phase-margin:${project.id}:${phase}:${field}`),'Phase money has a source drill')
 const report=await request(`/api/gauge/report.csv?from=${data.from}&to=${data.to}&asOf=2026-10-20&fingerprint=${data.fingerprint}`,owner);assert.equal(report.status,200);assert.match(await report.text(),/phase-margin:/)
 const moved=await cmd('budget:transfer',{...budget,engagementId:project.id,fromPhase:'discovery',toPhase:'delivery',metric:'feeBudgetMinor',amount:500000,reason:'Approved allowance moves to Delivery'})
 const before=(await state()).data.budgets.find(b=>b.id===budget.id)
 await cmd('budget:approve',moved)
 data=await state();const after=data.data.budgets.find(b=>b.id===moved.id)
 assert.deepEqual(after.value.phases.map(p=>p.feeBudgetMinor),[1500000,4500000]);assert.equal(after.value.phases.reduce((n,p)=>n+p.feeBudgetMinor,0),6000000);assert.deepEqual(data.data.budgets.find(b=>b.id===budget.id),before)
 assert.deepEqual(data.data.budgetAlerts.filter(a=>a.value.engagementId===project.id&&a.value.phaseKey==='discovery'&&a.value.metric==='fee').map(a=>a.value.threshold),[75,90],'Fee thresholds use the new approved allowance')
 await actual(19,8);await actual(20,4);assert((await state()).data.budgetAlerts.some(a=>a.value.engagementId===project.id&&a.value.phaseKey==='discovery'&&a.value.metric==='hours'&&a.value.threshold===100),'Phase overspend is explicit')
 let expense=await cmd('expense:save',{engagementId:project.id,taskId:discovery.id,personId:worker.id,date:'2026-10-19',description:'Submitted expense threshold',amountMinor:80000,reimbursable:false});expense=await cmd('expense:submit',expense);assert((await state()).data.budgetAlerts.some(a=>a.value.engagementId===project.id&&a.value.phaseKey==='discovery'&&a.value.metric==='expenses'&&a.value.threshold===75),'Submitted expenses count toward their threshold');await cmd('expense:approve',expense)
 const template=await cmd('template:save',{name:'Phased onboarding',purpose:'project',reason:'Reusable reviewed phase allowances',budget:{...terms,phases},items:[{key:'discovery',kind:'phase',name:'Discovery',offsetDays:0,durationDays:1,predecessors:[]},{key:'delivery',kind:'phase',name:'Delivery',offsetDays:0,durationDays:1,predecessors:[]},{key:'discovery-task',kind:'task',name:'Discovery task',phaseKey:'discovery',offsetDays:0,durationDays:1,predecessors:[],owner:'lead',effortSeconds:3600},{key:'delivery-task',kind:'task',name:'Delivery task',phaseKey:'delivery',offsetDays:0,durationDays:1,predecessors:[],owner:'lead',effortSeconds:3600}]})
 const fresh=await cmd('save:engagements',{name:'Template phase project',clientId:client.id,leadId:worker.id,members:[worker.id],scope:'Template carries its phase budgets',timezone:zone})
 await cmd('template:apply',{templateId:template.id,engagementId:fresh.id,start:'2026-11-02',reason:'Apply the exact budget-bearing version'})
 data=await state();const applied=data.data.budgets.find(b=>b.value.engagementId===fresh.id);assert.equal(applied.value.status,'draft');assert.deepEqual(applied.value.phases,phases);assert(data.data.tasks.filter(t=>t.value.engagementId===fresh.id).every(t=>['discovery','delivery'].includes(t.value.phaseKey)))
 await cmd('budget:approve',applied)
 const restricted=await state(manager.cookie);assert.deepEqual(restricted.phaseMargins,[]);assert(restricted.data.budgetAlerts.some(a=>a.value.engagementId===project.id));assert(restricted.data.budgetAlerts.every(a=>a.value.actual===undefined&&a.value.budget===undefined))
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}));const page=await context.newPage()
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(`${h.origin}/app/engagements?edit=${project.id}&asOf=2026-10-20`);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Phase budgets fit ${width}`);if(process.env.GAUGE_BUDGET_SHOTS){await mkdir(process.env.GAUGE_BUDGET_SHOTS,{recursive:true});await page.locator('#phase-budgets').screenshot({path:`${process.env.GAUGE_BUDGET_SHOTS}/phases-${width}.png`})}await page.goto(h.origin+'/app/review');assert.match(await page.locator('#budget-alerts').innerText(),/75%/);if(process.env.GAUGE_BUDGET_SHOTS)await page.locator('#budget-alerts').screenshot({path:`${process.env.GAUGE_BUDGET_SHOTS}/alerts-${width}.png`});await page.goto(h.origin+'/app/capacity');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Phase staffing controls fit ${width}`);if(process.env.GAUGE_BUDGET_SHOTS)await page.screenshot({path:`${process.env.GAUGE_BUDGET_SHOTS}/phase-staffing-${width}.png`,fullPage:true})}
 }finally{await browser.close()}
 console.log('PASS BUDGET-002 phase budgets: exact $60,000 rollup and controlled transfer, 76/91 hours cross 75/90 once, corrected approval dedupe, mixed billing, independent complete phase margins/ETC/EAC, source/CSV drills, template inheritance and lead/finance alerts at 1440/390')
}

export async function agencyCloseJourney(h){
 const {cmd,state,request,owner}=h,zone='America/New_York'
 const initial=await state(),baselineTime=initial.data.time.filter(t=>t.value.status==='approved'&&t.value.workDate>='2026-09-01'&&t.value.workDate<='2026-09-30'),baselineExpenses=initial.data.expenses.filter(e=>e.value.status==='approved'&&e.value.date>='2026-09-01'&&e.value.date<='2026-09-30'),baselineInvoices=initial.data.invoices.filter(i=>i.value.issueDate.slice(0,7)==='2026-09'),net=(i,data)=>{const corrections=data.data.invoiceCorrections.filter(c=>c.value.invoiceId===i.id&&c.value.status==='issued'&&c.value.date<='2026-09-30');return corrections.some(c=>c.value.type==='void')?0:i.value.lines.reduce((n,l)=>n+l.amountMinor,0)-corrections.reduce((n,c)=>n+c.value.amountMinor,0)}
 const worker=await cmd('save:people',{name:'Period close specialist',timezone:zone}),client=await cmd('save:clients',{name:'Period close client'})
 const project=await cmd('save:engagements',{name:'September agency close',clientId:client.id,leadId:worker.id,members:[worker.id],scope:'Immutable agency reconciliation',timezone:zone})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:100000,effortSeconds:10800,roundingSeconds:60,reason:'September service terms'}))
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Close service and WIP',remainingSeconds:3600})
 await cmd('save:calendars',{personId:worker.id,from:'2026-09-01',to:'2026-09-02',dailySeconds:3600,weekdays:'1,2,3,4,5',timezone:zone})
 await cmd('save:rates',{personId:worker.id,service:'Close service',effective:'2026-01-01',costMinor:null,billMinor:15000})
 const actual=async(day,start='06',end='07')=>{let t=await cmd('time:save',{personId:worker.id,engagementId:project.id,taskId:task.id,service:'Close service',timezone:zone,start:`2026-09-${day}T${start}:00:00-04:00`,end:`2026-09-${day}T${end}:00:00-04:00`,notes:'Confirmed period actual',billable:true});return cmd('time:approve',await cmd('time:submit',t))}
 let first=await actual('01')
 let invoiceCost=await cmd('expense:save',{engagementId:project.id,personId:worker.id,taskId:task.id,date:'2026-09-03',description:'Approved reimbursable source',amountMinor:10000,reimbursable:true});invoiceCost=await cmd('expense:approve',await cmd('expense:submit',invoiceCost))
 const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:'September external reconciliation',sources:[`expenses:${invoiceCost.id}`]}))
 const invoice=await cmd('invoice:issue',{...packet,issueDate:'2026-09-30',dueDate:'2026-10-30',billTo:'Period close client',remitTo:'Agency',reference:'September service'})
 let unapproved=await cmd('expense:save',{engagementId:project.id,personId:worker.id,taskId:task.id,date:'2026-09-03',description:'Unapproved close cost',amountMinor:500,reimbursable:false})
 const reviewerPerson=await cmd('save:people',{name:'Independent close reviewer',timezone:zone}),reviewer=await h.invite('period-finance'),staff=await h.invite('period-staff'),lead=await h.invite('period-lead'),agent=await h.invite('period-agent')
 await cmd('grant',{operatorId:reviewer.id,personId:reviewerPerson.id,role:'finance',enabled:true});await cmd('grant',{operatorId:staff.id,personId:worker.id,role:'staff',enabled:true});await cmd('grant',{operatorId:lead.id,personId:worker.id,role:'lead',enabled:true});await cmd('grant',{operatorId:agent.id,role:'agent',enabled:true,purpose:'billing',engagementIds:[project.id]})
 const oldLimit=(await state()).data.approvalPolicies[0]
 await cmd('approval:limit',{...(oldLimit??{}),reviewAboveMinor:100,reason:'Independent review of material agency close and reopening'})
 let preview=await cmd('period:preview',{month:'2026-09'})
 for(const reason of ['Approved labor cost is missing','Missing time against the recorded calendar','Cost is not approved','Unmatched invoice or changed reconciliation basis'])assert(preview.snapshot.checklist.blocking.some(b=>b.reason===reason),reason)
 await cmd('period:prepare',{...preview.input,fingerprint:preview.fingerprint,acknowledgeWip:true,wipReconciliation:'Pending resolution',reason:'Must not close missing sources'},owner,409)
 await cmd('period:match',{month:'2026-09',invoiceId:invoice.id,invoiceRevision:invoice.revision,system:'synthetic-gauge-accounting',externalId:'synthetic-gauge-1',amountMinor:9999,currency:'USD',reference:'Synthetic receiver control',reason:'Mismatched total'},owner,409)
 await cmd('save:rates',{personId:worker.id,service:'Close service',effective:'2026-01-02',costMinor:9000,billMinor:15000})
 first=await cmd('time:correct',{...first,reason:'Resolve the missing frozen cost before locking'});first=await cmd('time:approve',await cmd('time:submit',first));await actual('02')
 await cmd('expense:approve',await cmd('expense:submit',unapproved))
 const match=await cmd('period:match',{month:'2026-09',invoiceId:invoice.id,invoiceRevision:invoice.revision,system:'synthetic-gauge-accounting',externalId:'synthetic-gauge-1',amountMinor:10000,currency:'USD',reference:'synthetic-gauge-close-private',reason:'Finance reconciles the external net amount and currency'})
 const calendar=(await state()).data.agencyCalendars.at(-1)
 if(!calendar)await cmd('agency:calendar',{weekdays:[1,2,3,4,5],holidays:[],reason:'Agency service fee calendar'})
 const families=[]
 for(const service of ['Retained A','Retained B']){const p=await cmd('retainer:preview',{engagementId:project.id,operation:'terms',terms:{name:service,frequency:'monthly',unit:'hours',allowance:36000,feeMinor:100000,services:[service],consumes:'billable',proration:'calendar',start:'2026-09-01',renewal:'automatic',noticeDays:0}});families.push(await cmd('retainer:approve',{...p.input,fingerprint:p.fingerprint,reason:'Reviewed September retainer allowance'}))}
 let data=await state(),retainerPeriod=data.data.retainerPeriods.find(p=>p.value.rootId===families[0].id)
 const retainerClose=await cmd('retainer:close',{...retainerPeriod,reason:'Immutable September retainer statement'})
 const currentPolicy=(await state()).data.timePolicies[0]
 await cmd('time:policy',{...(currentPolicy??{}),lockThrough:'2026-09-30',reason:'Finance locks time through the September close'})
 preview=await cmd('period:preview',{month:'2026-09'});assert(preview.snapshot.checklist.blocking.some(b=>b.kind==='retainers'&&b.id===families[1].id),'Open retainer period must be named')
 const exceptions=Object.fromEntries(preview.snapshot.checklist.blocking.filter(b=>b.kind==='retainers').map(b=>[b.id,'Finance retains this named open retainer exception; no immutable usage close claimed']))
 preview=await cmd('period:preview',{month:'2026-09',retainerExceptions:exceptions});const existing=await state();for(const mismatch of preview.snapshot.checklist.blocking.filter(b=>b.kind==='invoices')){const source=existing.data.invoices.find(i=>i.id===mismatch.id),old=existing.data.periodMatches.find(m=>m.value.invoiceId===source.id);await cmd('period:match',{...(old??{}),month:'2026-09',invoiceId:source.id,invoiceRevision:source.revision,system:'synthetic-gauge-accounting',externalId:'synthetic-gauge-close-'+source.id,amountMinor:net(source,existing),currency:source.value.currency,reference:'Prior journey invoice control',reason:'Reconcile every existing agency invoice before the close'})}preview=await cmd('period:preview',{month:'2026-09',retainerExceptions:exceptions});assert.deepEqual(preview.snapshot.checklist.blocking,[])
 assert(preview.snapshot.checklist.wip.some(t=>t.id===task.id));assert(preview.snapshot.checklist.unbilled.some(t=>t.id===first.id))
 const prepare=async(p=preview)=>cmd('period:prepare',{...p.input,fingerprint:p.fingerprint,acknowledgeWip:true,wipReconciliation:'Approved unbilled time and planned work remain source-linked WIP; fees and retainer open exceptions reconciled',reason:'Finance reviewed the September operational close'})
 const stale=await prepare();let lateCost=await cmd('expense:save',{engagementId:project.id,personId:worker.id,taskId:task.id,date:'2026-09-04',description:'Cost captured during close review',amountMinor:1000,reimbursable:false})
 await cmd('period:approve',stale,reviewer.cookie,409);lateCost=await cmd('expense:approve',await cmd('expense:submit',lateCost))
 preview=await cmd('period:preview',{month:'2026-09',retainerExceptions:exceptions});const draft=await prepare(preview)
 assert.match(await(await request('/app/review',owner)).text(),/Needs an independent approver/)
 await cmd('period:approve',draft,owner,403)
 const close=await cmd('period:approve',draft,reviewer.cookie);data=await state();const original=structuredClone(data.data.periodCloses.find(c=>c.id===close.id))
 const download=await(await request(`/api/gauge/closes/${close.id}`,owner)).text();assert.deepEqual(JSON.parse(download),original);assert.equal(await(await request(`/api/gauge/closes/${close.id}`,owner)).text(),download,'Repeated reconciliation download is immutable')
 assert.equal(original.value.snapshot.timeLock.lockThrough,'2026-09-30');assert.equal(original.value.snapshot.totals.approvedSeconds,7200+baselineTime.reduce((n,t)=>n+t.value.durationSeconds,0))
 assert.equal(original.value.snapshot.totals.laborCostByCurrency.USD,18000+baselineTime.reduce((n,t)=>n+(t.value.economics?.costMinor??0),0));assert.equal(original.value.snapshot.totals.expenseByCurrency.USD,11500+baselineExpenses.reduce((n,e)=>n+e.value.amountMinor,0));assert.equal(original.value.snapshot.totals.netInvoicedByCurrency.USD,10000+baselineInvoices.reduce((n,i)=>n+net(i,initial),0))
 assert(original.value.snapshot.checklist.retainers.find(r=>r.rootId===families[0].id).periods.some(p=>p.closeId===retainerClose.id))
 assert(original.value.snapshot.checklist.retainers.find(r=>r.rootId===families[1].id).exception)
 assert(!JSON.stringify(original.value.snapshot).includes('fifoState'),'Agency close links retainer immutable snapshots without copying them')
 const timeInput={personId:worker.id,engagementId:project.id,taskId:task.id,service:'Close service',timezone:zone,start:'2026-09-02T10:00:00-04:00',end:'2026-09-02T11:00:00-04:00',notes:'Late confirmed correction',billable:true}
 await cmd('time:save',timeInput,owner,409)
 const heldPolicy=data.data.timePolicies[0]
 await cmd('time:policy',{...heldPolicy,lockThrough:null,reason:'Cannot bypass an agency close'},owner,409)
 await cmd('expense:save',{engagementId:project.id,personId:worker.id,date:'2026-09-04',description:'Closed expense bypass',amountMinor:1,reimbursable:false},owner,409)
 await cmd('payment:record',{...invoice,date:'2026-09-30',amountMinor:1,reference:'Closed receipt bypass'},owner,409)
 for(const user of [staff,lead,agent]){await cmd('period:preview',{month:'2026-09'},user.cookie,403);await cmd('period:reopen-prepare',{...close,reason:'Unauthorized reopening'},user.cookie,403);const view=await state(user.cookie);for(const kind of ['periodMatches','periodCloses','periodCloseDrafts','periodReopenRequests','periodReopens'])assert.deepEqual(view.data[kind],[]);assert.equal((await request(`/api/gauge/history/periodCloses/${close.id}`,user.cookie)).status,403);assert.equal((await request(`/api/gauge/closes/${close.id}`,user.cookie)).status,403)}
 const reopening=await cmd('period:reopen-prepare',{...close,reason:'Authorize a late September correction with retained original snapshot'})
 await cmd('period:reopen',reopening,owner,403);await cmd('period:reopen',reopening,reviewer.cookie)
 assert.equal((await state()).data.timePolicies[0].value.lockThrough,'2026-08-31')
 let late=await cmd('time:save',timeInput);late=await cmd('time:approve',await cmd('time:submit',late))
 assert.deepEqual((await state()).data.periodCloses.find(c=>c.id===close.id),original,'Authorized reopen never rewrites the original reconciliation');assert.equal(await(await request(`/api/gauge/closes/${close.id}`,owner)).text(),download)
 const reopenedPolicy=(await state()).data.timePolicies[0];await cmd('time:policy',{...reopenedPolicy,lockThrough:'2026-09-30',reason:'Relock corrected September time'})
 preview=await cmd('period:preview',{month:'2026-09',retainerExceptions:exceptions});const revised=await cmd('period:approve',await prepare(preview),reviewer.cookie)
 assert.equal((await state()).data.periodCloses.find(c=>c.id===revised.id).value.previousCloseId,close.id)
 assert.equal((await state()).data.periodCloses.find(c=>c.id===revised.id).value.snapshot.totals.approvedSeconds,10800+baselineTime.reduce((n,t)=>n+t.value.durationSeconds,0))
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}));const page=await context.newPage();await page.goto(h.origin+'/app/review');const closeForm=page.locator('form').filter({has:page.locator('input[name=action][value="period:preview"]')});await closeForm.getByLabel('Agency month',{exact:true}).fill('2026-09');await closeForm.getByLabel('Open retainer exception: Retained B',{exact:true}).fill('Retained B remains an explicitly named open usage exception');await closeForm.getByRole('button',{name:'Review close checklist',exact:true}).click();await page.waitForURL('**/app/action');assert.match(await page.locator('#period-close').innerText(),/already closed/)
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.locator('#period-close').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Agency close fits ${width}`);assert.match(await page.locator('#period-close').innerText(),/September|2026-09/);if(process.env.GAUGE_CLOSE_SHOTS){await mkdir(process.env.GAUGE_CLOSE_SHOTS,{recursive:true});await page.locator('#period-close').screenshot({path:`${process.env.GAUGE_CLOSE_SHOTS}/agency-close-${width}.png`})}}
 }finally{await browser.close()}
 const finalPolicy=(await state()).data.approvalPolicies[0];await cmd('approval:limit',{...finalPolicy,reviewAboveMinor:oldLimit?.value.reviewAboveMinor??null,reason:'Restore review policy after isolated close proof'})
 console.log('PASS FINANCE-004 agency close: missing time/cost/unapproved cost/unmatched invoice refused then resolved; explicit WIP/unbilled reconciliation; held TIME-003 cutoff; immutable retainer links/open exception; stale and independent review; financial-date lock; authorized late reopen and linked reclose; role privacy and 1440/390')
}
