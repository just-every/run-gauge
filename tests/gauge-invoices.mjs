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
 const cappedDocument=(await(await request(`/api/gauge/invoice-documents/${invoice.id}?format=json`,owner)).json()).document
 assert.equal(cappedDocument.totalMinor,1000000);assert.equal(cappedDocument.detail.reduce((n,r)=>n+r.billedSeconds,0),240000);assert.equal(cappedDocument.detail.reduce((n,r)=>n+r.actualSeconds,0),252000);assert(cappedDocument.detail.every(r=>r.person==='Change-order release specialist'&&r.task==='Capped delivery'&&r.rateMinor===15000&&first.entries.some(t=>t.id===r.originalSourceId)))
 const report=await(await request('/api/gauge/state?from=2026-01-01&to=2026-01-31&asOf=2026-02-01',owner)).json()
 assert(!report.cash.engagements.find(e=>e.engagementId===first.project.id).items.some(i=>!i.issued&&i.openMinor>0),'Held excess is excluded from expected cash')
 const cappedRealization=report.performance.byPerson.find(p=>p.id===first.worker.id).money.find(b=>b.currency==='USD');assert.equal(cappedRealization.standardMinor,1000000);assert.equal(cappedRealization.billedMinor,1000000);assert.equal(cappedRealization.billedSeconds,240000);assert.equal(cappedRealization.unbilledStandardMinor,50000);assert.equal(cappedRealization.realizationPercent,100,'Capped portions use their original frozen standard rather than the whole held entry')
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
 // SETUP-003: a rate effective inside the closed month would rewrite that month's conversion, so it is refused.
 const midMonthRate={currency:'NZD',rate:'0.5900',effective:'2026-09-15',source:'Published rate synthetic-gauge-61',reason:'Mid-September rate approved after the close'}
 assert.match((await cmd('fx:approve',midMonthRate,owner,409)).error,/closed period protects exchange rates through 2026-09-30/)
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
 await cmd('fx:approve',midMonthRate) // the authorized reopen lifts the protection, as for every dated financial fact
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
 console.log('PASS FINANCE-004 agency close: missing time/cost/unapproved cost/unmatched invoice refused then resolved; explicit WIP/unbilled reconciliation; held TIME-003 cutoff; immutable retainer links/open exception; stale and independent review; financial-date lock; authorized late reopen and linked reclose; role privacy at 1440 and 390')
}

// SETUP-004: typed source fields, native creation doors, reports and scoped resource search.
export async function customFieldJourney(h) {
 const {cmd,request,owner}=h
 const base='/api/gauge/state?from=2026-10-05&to=2026-10-09&asOf=2026-10-20'
 const read=async(extra='',cookie=owner)=>{const r=await request(base+extra,cookie);assert.equal(r.status,200,await r.clone().text());return r.json()}
 const native=async(scope,id)=>(await read()).data[scope].find(r=>r.id===id)
 const define=async(scope,name,type,extra={})=>cmd('field:define',{scope,name,type,visibility:'everyone',reason:'Reviewed agency field policy',...extra})
 const a=await cmd('save:people',{name:'Fields NYC',timezone:'America/New_York',skills:[{name:'Design',proficiency:4}]}),b=await cmd('save:people',{name:'Fields Austin',timezone:'America/New_York',skills:[{name:'Design',proficiency:4}]})
 const client=await cmd('save:clients',{name:'Custom fields client'})
 for(const person of [a,b]){await cmd('save:calendars',{personId:person.id,from:'2026-10-05',to:'2026-10-09',dailySeconds:28800,weekdays:'1,2,3,4,5',timezone:'America/New_York'});await cmd('save:rates',{personId:person.id,service:'*',effective:'2026-01-01',costMinor:9000,billMinor:15000})}
 const projects=[]
 for(const [n,person]of [a,b].entries()){
  const e=await cmd('save:engagements',{name:['Fields Brand','Fields Web'][n],clientId:client.id,leadId:person.id,members:[person.id],scope:'Source-controlled field reporting',timezone:'America/New_York'});projects.push(e)
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:e.id,mode:'hourly',amountMinor:1000000,effortSeconds:144000,roundingSeconds:60,reason:'Custom report baseline'}))
  const sourceTask=await cmd('save:tasks',{engagementId:e.id,name:'Source report effort',remainingSeconds:0})
  for(const day of [5,6,7,8,9]){const start=`2026-10-0${day}T09:00:00-04:00`,end=`2026-10-0${day}T${n?'13':'11'}:00:00-04:00`;await cmd('time:approve',await cmd('time:submit',await cmd('time:save',{engagementId:e.id,personId:person.id,taskId:sourceTask.id,start,end,timezone:'America/New_York',service:'Design',billable:true,notes:'Source report controlled hours'})))}
 }
 // Independent controls are literal source report totals, not values read back from Gauge.
 const pkg={format:'kantata-ox-custom-fields-v1',namespace:'synthetic-gauge-kantata-1',fields:[{id:'project-practice',scope:'engagements',name:'Practice',type:'single-select',options:[{id:'Brand',name:'Brand'},{id:'Web',name:'Web'}]},{id:'user-office',scope:'people',name:'Office',type:'single-select',options:[{id:'NYC',name:'NYC'},{id:'Austin',name:'Austin'}]}],records:[{scope:'engagements',id:'p-brand',values:{'project-practice':'Brand'}},{scope:'engagements',id:'p-web',values:{'project-practice':'Web'}},{scope:'people',id:'u-nyc',values:{'user-office':'NYC'}},{scope:'people',id:'u-austin',values:{'user-office':'Austin'}}],controls:{Practice:{Brand:{billableSeconds:36000,availableSeconds:144000,utilizationPercent:25,earnedMinor:150000,costMinor:90000,marginMinor:60000},Web:{billableSeconds:72000,availableSeconds:144000,utilizationPercent:50,earnedMinor:300000,costMinor:180000,marginMinor:120000}},Office:{NYC:{billableSeconds:36000,availableSeconds:144000,utilizationPercent:25,earnedMinor:150000,costMinor:90000,marginMinor:60000},Austin:{billableSeconds:72000,availableSeconds:144000,utilizationPercent:50,earnedMinor:300000,costMinor:180000,marginMinor:120000}}}}
 const mapping={engagements:{'p-brand':projects[0].id,'p-web':projects[1].id},people:{'u-nyc':a.id,'u-austin':b.id}},policies={'project-practice':{visibility:'everyone'},'user-office':{visibility:'everyone'}}
 const bad=structuredClone(pkg);bad.records[0].values['project-practice']='Legacy';const rejected=await cmd('field:import-preview',{package:bad,mapping,policies});assert.equal(rejected.canApply,false);assert(rejected.findings.some(f=>f.sourceId==='p-brand'&&/Undefined/.test(f.reason)&&f.reason.includes('Legacy')));assert.equal((await read()).data.customImports.length,0)
 await cmd('field:import',{package:bad,mapping,policies,fingerprint:rejected.fingerprint,reason:'Undefined values must never disappear'},owner,400)
 const input={package:pkg,mapping,policies},preview=await cmd('field:import-preview',input),job=await cmd('field:import',{...input,fingerprint:preview.fingerprint,reason:'Independent source report reconciliation'})
 let d=await read();const practice=d.data.customFields.find(f=>f.value.sourceId==='project-practice'),office=d.data.customFields.find(f=>f.value.sourceId==='user-office')
 assert.equal(d.data.customImports.find(j=>j.id===job.id).value.package.controls.Office.Austin.marginMinor,120000)
 for(const field of [practice,office]){
  d=await read(`&portfolioGroup=custom:${field.id}&customGroup=${field.id}`)
  const expected=pkg.controls[field.value.name]
  for(const [label,c]of Object.entries(expected)){const profit=d.portfolio.rows.find(r=>r.subject===label),util=d.customPerformance.rows.find(r=>r.name===label);assert(profit&&util);for(const key of ['earnedMinor','costMinor','marginMinor'])assert.equal(profit[key],c[key],`${field.value.name} ${label} independent ${key}`);for(const key of ['billableSeconds','availableSeconds','utilizationPercent'])assert.equal(util[key],c[key],`${field.value.name} ${label} independent ${key}`)}
 }
 // All seven field types, decimal exactness, private measures, value history and immutable option identity.
 const contract=await define('engagements','Contract value','currency',{currency:'USD',visibility:'finance-only'}),number=await define('engagements','Complexity','number'),note=await define('clients','Reference note','text'),when=await define('clients','Renewal date','date'),person=await define('clients','Sponsor','person'),multi=await define('tasks','Channels','multi-select',{options:[{id:'web',name:'Web'},{id:'print',name:'Print'}]})
 for(const [n,e]of projects.entries()){const row=await native('engagements',e.id);await cmd('field:values',{scope:'engagements',...row,customFields:{[contract.id]:[100001,200002][n],[number.id]:['1.25','2.75'][n]}})}
 let row=await native('clients',client.id);await cmd('field:values',{scope:'clients',...row,customFields:{[note.id]:'synthetic-gauge-1',[when.id]:'2026-02-30',[person.id]:a.id}},owner,400)
 row=await native('clients',client.id);await cmd('field:values',{scope:'clients',...row,customFields:{[note.id]:'synthetic-gauge-1',[when.id]:'2026-11-30',[person.id]:a.id}})
 const task=await cmd('save:tasks',{engagementId:projects[0].id,name:'Custom channels',remainingSeconds:0,customFields:{[multi.id]:['web','print']}})
 await cmd('field:values',{scope:'tasks',...task,customFields:{[multi.id]:['unknown']}},owner,400)
 const currentMulti=await native('customFields',multi.id);await cmd('field:define',{...currentMulti,...currentMulti.value,options:[{id:'web',name:'Web'},{id:'print',name:'Print',retired:true},{id:'social',name:'Social'}],reason:'Retire print without erasing source history'})
 assert.deepEqual((await native('tasks',task.id)).value.customFields[multi.id],['web','print']);await cmd('save:tasks',{engagementId:projects[0].id,name:'No retired new assignment',remainingSeconds:0,customFields:{[multi.id]:['print']}},owner,400)
 d=await read(`&portfolioGroup=custom:${practice.id}&customMeasures=${encodeURIComponent(JSON.stringify([contract.id,number.id]))}`)
 const customFigure=d.lineage.find(f=>f.id.startsWith('customPortfolio:')&&f.id.endsWith(':'+contract.id)&&f.value===100001);assert(customFigure);assert(customFigure.sources.some(s=>s.kind==='customFields'&&s.id===contract.id));const customExport=await request(base.replace('/state','/report.csv')+`&portfolioGroup=custom:${practice.id}&customMeasures=${encodeURIComponent(JSON.stringify([contract.id,number.id]))}&fingerprint=${d.fingerprint}`,owner);assert.equal(customExport.status,200);assert((await customExport.text()).includes('100001'))
 assert.equal(d.portfolio.rows.find(r=>r.subject==='Brand').customMeasures.find(m=>m.fieldId===contract.id).value,100001)
 assert.equal(d.portfolio.rows.find(r=>r.subject==='Web').customMeasures.find(m=>m.fieldId===contract.id).value,200002)
 assert.equal(d.portfolio.rows.reduce((n,r)=>n+r.customMeasures.find(m=>m.fieldId===number.id).value,0),4)
 // Every currently permitted field type and record scope groups and filters both report datasets.
 for(const [field,value,expectedProjects]of [[practice,'Brand',1],[office,'Austin',1],[contract,100001,1],[number,'1.25',1],[note,'synthetic-gauge-1',2],[when,'2026-11-30',2],[person,a.id,2],[multi,'web',1]]){
  const result=await read(`&portfolioGroup=custom:${field.id}&customGroup=${field.id}&customFilters=${encodeURIComponent(JSON.stringify({[field.id]:value}))}`)
  assert.equal(result.portfolio.projects.length,expectedProjects,`Permitted ${field.id} profitability filter`)
  assert(result.portfolio.rows.some(r=>r.projectIds.length===expectedProjects))
  assert(result.customPerformance.rows.length>0,`Permitted ${field.id} utilization grouping`)
  const sourceIds=new Set(result.portfolio.projects.map(p=>p.engagementId));assert([...sourceIds].every(id=>projects.some(p=>p.id===id)))
  const savedReport=await cmd('saved:save',{name:`Typed report ${field.id}`,dataset:'profitability',group:field.id,customFilters:{[field.id]:value},from:'2026-10-05',to:'2026-10-09'})
  assert.equal((await request(`/api/gauge/saved/${savedReport.id}`,owner)).status,200)
 }
 const yen=await define('clients','Yen allowance','currency',{currency:'JPY'}),dinar=await define('clients','Dinar allowance','currency',{currency:'BHD'})
 await cmd('field:values',{scope:'clients',...await native('clients',client.id),customFields:{[yen.id]:1234,[dinar.id]:12345}})
 const foreignMeasures=await read(`&portfolioGroup=custom:${practice.id}&customMeasures=${encodeURIComponent(JSON.stringify([yen.id,dinar.id]))}`);for(const label of ['Brand','Web']){const cohort=foreignMeasures.portfolio.rows.find(r=>r.subject===label);assert(cohort);assert.equal(cohort.customMeasures.find(m=>m.fieldId===yen.id).value,1234);assert.equal(cohort.customMeasures.find(m=>m.fieldId===dinar.id).value,12345)}assert(foreignMeasures.portfolio.rows.filter(r=>!['Brand','Web'].includes(r.subject)).every(r=>r.customMeasures.every(m=>m.value===null&&m.knownValue===0)),'Other clients have unset currency values, never zero totals')
 const financeSaved=await cmd('saved:save',{name:'Finance contracts by practice',dataset:'profitability',group:practice.id,measures:[contract.id],from:'2026-10-05',to:'2026-10-09'});assert.equal((await request(`/api/gauge/saved/${financeSaved.id}`,owner)).status,200)
 const lead=await h.invite('field-lead');await cmd('grant',{operatorId:lead.id,personId:a.id,role:'lead',enabled:true})
 const staff=await h.invite('field-staff');await cmd('grant',{operatorId:staff.id,personId:a.id,role:'staff',enabled:true})
 const leadData=await read('',lead.cookie),encoded=JSON.stringify(leadData);assert(!encoded.includes(contract.id));assert(!Object.values(leadData.data.engagements).some(e=>Object.values(e.value.customFields??{}).includes(100001)));assert(!encoded.includes('Contract value'))
 for(const path of [`/app/engagements?edit=${projects[0].id}`,`/api/gauge/history/engagements/${projects[0].id}`]){const r=await request(path,lead.cookie);assert.equal(r.status,200);const text=await r.text();assert(!text.includes(contract.id));assert(!text.includes('Contract value'))}
 const exported=await request(`/api/gauge/report.csv?from=2026-10-05&to=2026-10-09&asOf=2026-10-20&fingerprint=${leadData.fingerprint}`,lead.cookie);assert.equal(exported.status,200);assert(!(await exported.text()).includes(contract.id))
 assert.equal((await request(`/api/gauge/saved/${financeSaved.id}`,lead.cookie)).status,403)
 await cmd('saved:save',{name:'Forbidden private measure',dataset:'utilization',group:practice.id,measures:[contract.id],from:'2026-10-05',to:'2026-10-09'},lead.cookie,403)
 assert.equal((await request(base+`&customFilters=${encodeURIComponent(JSON.stringify({[contract.id]:100001}))}`,lead.cookie)).status,403)
 await cmd('field:values',{scope:'engagements',...await native('engagements',projects[0].id),customFields:{[contract.id]:1}},lead.cookie,403)
 await cmd('field:define',{scope:'people',name:'No grant',type:'text',reason:'Not owner'},lead.cookie,403)
 const saved=await cmd('saved:save',{name:'Lead practice utilization',dataset:'utilization',group:practice.id,from:'2026-10-05',to:'2026-10-09'},lead.cookie);assert.equal((await request(`/api/gauge/saved/${saved.id}`,lead.cookie)).status,200)
 assert(!(await read('',staff.cookie)).data.customFields.some(f=>f.id===contract.id))
 // Required fields are enforced in all current creation doors, including SQL-backed adapters.
 const unclassified=await cmd('save:engagements',{name:'Legacy unclassified engagement',clientId:client.id,leadId:a.id,members:[a.id],scope:'Existing record remains intact until a creation door needs classification',timezone:'America/New_York'})
 const practiceDef=await native('customFields',practice.id);await cmd('field:define',{...practiceDef,...practiceDef.value,required:true,reason:'Every new engagement needs a practice'})
 const newInput={name:'Required practice',clientId:client.id,leadId:a.id,members:[a.id],scope:'Typed required door',timezone:'America/New_York'}
 await cmd('save:engagements',newInput,owner,400)
 const required=await cmd('save:engagements',{...newInput,customFields:{[practice.id]:'Brand'}})
 const opp=await cmd('save:opportunities',{name:'Required won deal',clientId:client.id,ownerId:a.id,stage:'won',probability:100,amountMinor:50000,demandSeconds:3600,from:'2026-11-02',to:'2026-11-03',services:'Design'})
 await cmd('opportunity:convert',opp,owner,400);const converted=await cmd('opportunity:convert',{...opp,customFields:{[practice.id]:'Web'}});assert.equal((await cmd('opportunity:convert',opp)).id,converted.id)
 const requiredTask=await define('tasks','Task handover','text',{required:true})
 const template=await cmd('template:save',{name:'Required handover template',reason:'Required fields on template creation',items:[{key:'task',kind:'task',name:'Handover',offsetDays:0,durationDays:1,owner:'lead',effortSeconds:3600}]})
 const noClassification=await cmd('template:apply',{templateId:template.id,engagementId:unclassified.id,start:'2026-11-02',reason:'A legacy engagement still needs its required classification'},owner,400);assert.match(noClassification.error,/Practice/)
 await cmd('template:apply',{templateId:template.id,engagementId:required.id,start:'2026-11-02',reason:'Missing task field'},owner,400)
 await cmd('save:tasks',{engagementId:required.id,name:'Missing required task field',remainingSeconds:0},owner,400)
 const corrected=await cmd('template:save',{previousId:template.id,name:'Required handover template',reason:'Reviewed task field default',items:[{key:'task',kind:'task',name:'Handover',offsetDays:0,durationDays:1,owner:'lead',effortSeconds:3600,customFields:{[requiredTask.id]:'Client handover prepared'}}]})
 const revisedTemplate=await cmd('template:save',{previousId:corrected.id,name:'Revised handover template',reason:'Keep typed defaults when revising other template facts',items:[{key:'task',kind:'task',name:'Handover',offsetDays:0,durationDays:1,owner:'lead',effortSeconds:3600}]})
 assert.equal((await native('deliveryTemplates',revisedTemplate.id)).value.items[0].customFields[requiredTask.id],'Client handover prepared')
 await cmd('template:apply',{templateId:revisedTemplate.id,engagementId:required.id,start:'2026-11-02',reason:'Typed task defaults'})
 // Native resource search and the calendar use the same permitted person field.
 const resource=await cmd('save:resourceRequests',{engagementId:projects[0].id,role:'Designer',skill:'Design',minProficiency:3,from:'2026-10-05',to:'2026-10-09',dailySeconds:3600,service:'Design',customFilters:{[office.id]:'Austin'}})
 const candidates=await(await request(`/api/gauge/resources/${resource.id}`,owner)).json();assert.deepEqual(candidates.candidates.map(c=>c.personId),[b.id]);assert.equal(candidates.unavailable.length,0)
 for(const [field,value,expected]of [[practice,'Brand',[a.id]],[contract,100001,[a.id]],[number,'1.25',[a.id]],[note,'synthetic-gauge-1',[a.id,b.id]],[when,'2026-11-30',[a.id,b.id]],[person,a.id,[a.id,b.id]],[multi,'web',[a.id]]]){const r=await cmd('save:resourceRequests',{engagementId:projects[0].id,role:'Designer',skill:'Design',minProficiency:3,from:'2026-10-05',to:'2026-10-09',dailySeconds:3600,service:'Design',customFilters:{[field.id]:value}});const found=await(await request(`/api/gauge/resources/${r.id}`,owner)).json();assert.deepEqual(found.candidates.map(c=>c.personId).sort(),expected.sort(),`Resource filter on ${field.id}`)}
 // Replay retains native edits; original package, source IDs and exact definition revisions remain in custody.
 row=await native('people',b.id);await cmd('field:values',{scope:'people',...row,customFields:{[office.id]:'NYC'}})
 const replay=await cmd('field:import',{...input,fingerprint:preview.fingerprint,reason:'Replay must preserve native edits'});assert.equal(replay.id,job.id);assert.equal((await native('people',b.id)).value.customFields[office.id],'NYC')
 const officeHistory=await(await request(`/api/gauge/history/people/${b.id}`,owner)).json();assert(officeHistory.history.some(r=>r.value.customFields?.[office.id]==='Austin'&&r.value.customFieldSources?.[office.id].sourceId==='u-austin'))
 // Narrowing and subsequent broadening never reveal earlier private values or saved filter literals.
 const privateOffice=await cmd('field:define',{...await native('customFields',office.id),...(await native('customFields',office.id)).value,visibility:'finance-only',reason:'Restrict office fields'})
 assert(!(await read('',lead.cookie)).data.customFields.some(f=>f.id===office.id));assert.equal((await request(`/api/gauge/resources/${resource.id}`,lead.cookie)).status,403)
 await cmd('field:values',{scope:'people',...await native('people',a.id),customFields:{[office.id]:'Austin'}})
 await cmd('field:define',{...privateOffice,...(await native('customFields',office.id)).value,visibility:'everyone',reason:'Reopen definition without republishing private values'})
 assert.equal((await read('',lead.cookie)).data.people.find(p=>p.id===a.id).value.customFields?.[office.id],undefined,'An earlier finance-only value stays private after a broader definition')
 const privateHistory=await(await request(`/api/gauge/history/people/${a.id}`,lead.cookie)).json();assert(privateHistory.history.filter(h=>h.value.customFieldVersions?.[office.id]===privateOffice.revision).every(h=>h.value.customFields?.[office.id]===undefined))
 // Browser proof at both mandatory widths; native owner and lead pages are independently asserted.
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage();await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
 const shots=process.env.GAUGE_FIELDS_SHOTS;if(shots)await mkdir(shots,{recursive:true})
 await page.goto(h.origin+`/app/engagements?edit=${client.id}`);const valueForm=page.locator('#custom-values form');await valueForm.getByLabel('Yen allowance (JPY)').fill('4321');await valueForm.getByLabel('Dinar allowance (BHD)').fill('12.345');await valueForm.getByRole('button',{name:'Save',exact:true}).click();assert.equal((await native('clients',client.id)).value.customFields[yen.id],4321);assert.equal((await native('clients',client.id)).value.customFields[dinar.id],12345)
 await page.goto(h.origin+'/app/imports');const importPreviewForm=page.locator('#custom-import form').filter({has:page.locator('input[value="field:import-preview"]')});await importPreviewForm.getByLabel('Kantata custom-fields package JSON').fill(JSON.stringify(bad));await importPreviewForm.getByLabel('Reviewed source-to-native mapping JSON').fill(JSON.stringify(mapping));await importPreviewForm.getByLabel('Owner field policies JSON').fill(JSON.stringify(policies));await importPreviewForm.getByRole('button',{name:'Save',exact:true}).click();assert.match(await page.locator('#custom-import').innerText(),/Legacy/)
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Native field preview fits '+width);if(shots)await page.locator('#custom-import').screenshot({path:`${shots}/import-${width}.png`})}
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});for(const [path,selector,name]of [['/app/access','#custom-definitions','definitions'],[`/app/engagements?edit=${client.id}`,'#custom-values','client-values'],[`/app/engagements?edit=${b.id}`,'#custom-values','person-values'],[`/app/engagements?edit=${task.id}`,'#custom-values','task-values'],[`/app/engagements?edit=${projects[0].id}`,'#custom-values','values'],[`/app/review?from=2026-10-05&to=2026-10-09&asOf=2026-10-20&customGroup=${practice.id}&portfolioGroup=custom:${practice.id}&customMeasures=${encodeURIComponent(JSON.stringify([contract.id]))}`,'#custom-reports','reports'],[`/app/capacity?from=2026-10-05&filter:${office.id}=NYC`,'main','resources']]){await page.goto(h.origin+path);assert.equal(await page.locator(selector).count(),1);if(name==='resources'){const boardText=await page.locator('.g-board').innerText();assert(boardText.includes('Fields Austin'));assert(!boardText.includes('Fields NYC'))}assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}`);if(shots){await page.locator(selector).screenshot({path:`${shots}/${name}-${width}.png`});if(name==='reports')await page.locator('#portfolio-profitability').screenshot({path:`${shots}/profitability-${width}.png`})}}}
 await context.clearCookies();await context.addCookies(lead.cookie.split('; ').map(part=>{const i=part.indexOf('=');return{name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}));await page.goto(h.origin+`/app/engagements?edit=${projects[0].id}`);assert(!((await page.locator('main').innerText()).includes('Contract value')))
 }finally{await browser.close()}
 console.log('PASS SETUP-004 typed Kantata fields, Legacy preview refusal, independent Practice/Office profitability and utilization, required direct/conversion/template doors, private measures/page/API/CSV/saved/history, resource filtering, option retirement, native-edit replay and 1440/390')
}

// SALES-002: cost assumptions are immutable and private; project preparation is manual and source-bound.
export async function estimateJourney(h){
 const {cmd,state,request,owner}=h,zone='America/New_York'
 const designer=await cmd('save:people',{name:'Estimate designer',timezone:zone}),engineer=await cmd('save:people',{name:'Estimate engineer',timezone:zone}),contractor=await cmd('save:people',{name:'Estimate contractor',timezone:zone,employmentType:'contractor'})
 const client=await cmd('save:clients',{name:'Estimated studio'})
 for(const [person,cost]of [[designer,9000],[engineer,12000],[contractor,11000]]){await cmd('save:rates',{personId:person.id,service:'*',effective:'2026-01-01',billMinor:20000,costMinor:cost});await cmd('save:calendars',{personId:person.id,from:'2026-11-02',to:'2026-11-30',dailySeconds:28800,weekdays:'1,2,3,4,5',timezone:zone})}
 const hidden=await cmd('save:engagements',{type:'internal',internalCategory:'other',name:'Private competing project',leadId:engineer.id,members:[],scope:'Private competing commitment',timezone:zone})
 await cmd('save:staffing',{engagementId:hidden.id,personId:designer.id,from:'2026-11-02',to:'2026-11-02',dailySeconds:21600,commitment:'committed',service:'Other',billable:false})
 const opportunity=await cmd('save:opportunities',{name:'Design and engineering estimate',clientId:client.id,ownerId:designer.id,stage:'proposal',probability:75,amountMinor:645000,demandSeconds:126000,services:'Design,Engineering',from:'2026-11-02',to:'2026-11-06'})
 const lead=await h.invite('estimate-lead'),staff=await h.invite('estimate-staff');await cmd('grant',{operatorId:lead.id,personId:designer.id,role:'lead',enabled:true});await cmd('grant',{operatorId:staff.id,personId:engineer.id,role:'staff',enabled:true})
 const firstInput={opportunityId:opportunity.id,name:'Design and engineering quote',reason:'Version one priced from current source assumptions',contingencyBasisPoints:1000,discountBasisPoints:1000,phases:[{key:'design',name:'Design',service:'Design',mode:'fixed',from:'2026-11-02',to:'2026-11-06'},{key:'engineering',name:'Engineering',service:'Engineering',mode:'fixed',from:'2026-11-02',to:'2026-11-06'}],lines:[{key:'design',phaseKey:'design',kind:'labor',name:'Design service',role:'Designer',personId:designer.id,effortSeconds:36000,billRateMinor:15000},{key:'engineering',phaseKey:'engineering',kind:'labor',name:'Engineering service',role:'Engineer',personId:engineer.id,effortSeconds:72000,billRateMinor:20000},{key:'contractor',phaseKey:'design',kind:'subcontractor',name:'Specialist service',role:'Specialist',personId:contractor.id,effortSeconds:18000,billRateMinor:18000},{key:'expenses',phaseKey:'design',kind:'expense',name:'Testing materials',quantity:2,unitBillMinor:2500,costMinor:4000,costReference:'synthetic-gauge-material-quote'}]}
 const financeUser=await h.invite('estimate-finance');await cmd('grant',{operatorId:financeUser.id,personId:engineer.id,role:'finance',enabled:true})
 const first=await cmd('estimate:save',firstInput),firstRecord=(await state()).data.estimates.find(r=>r.id===first.id),v=firstRecord.value
 assert.deepEqual([v.baseMinor,v.grossMinor,v.discountMinor,v.totalMinor,v.costMinor,v.marginMinor],[645000,709500,70950,638550,427900,210650],'Independent quote = (645000 × 1.10) × .90; cost 389000 × 1.10')
 assert.equal(v.feeMinor+v.expenseMinor,v.totalMinor);assert.equal(v.effortSeconds,126000);assert.equal(v.feasibility.find(f=>f.lineKey==='design').feasibleEnd,'2026-11-03')
 const notice='recorded by agency, client identity unverified',attestation={attest:'owner-recorded-external-acceptance',acceptorName:'Maya Ortiz',acceptorContact:'maya.ortiz@example.test',acceptanceDate:'2026-10-21',channel:'email',evidenceRef:'synthetic-gauge-1',reason:'Owner records reported external acceptance; identity unverified'}
 const accept=async(row)=>cmd('estimate:approve',{...row,...attestation})
 for(const field of ['acceptorName','acceptorContact','acceptanceDate','channel','evidenceRef']){const incomplete={...first,...attestation};delete incomplete[field];await cmd('estimate:approve',incomplete,owner,400)}
 await cmd('estimate:approve',{...first,...attestation,channel:'signature'},owner,400)
 assert.equal((await state()).data.estimateApprovals.length,0,'Incomplete records never become an acceptance carrier')
 await cmd('estimate:approve',{...first,attest:'owner-recorded-external-acceptance',evidenceRef:'No owner attestation',reason:'Conservative owner-only default'},financeUser.cookie,403)
 await accept(first)
 await cmd('estimate:approve',{...first,...attestation},owner,409)
 await cmd('save:rates',{personId:contractor.id,service:'*',effective:'2026-11-01',billMinor:20000,costMinor:12000})
 await cmd('estimate:convert',first,owner,409)
 const secondInput=structuredClone(firstInput);secondInput.previousId=first.id;secondInput.reason='New contractor cost assumption, customer discount and proposed dates';secondInput.discountBasisPoints=500;secondInput.lines[1].billRateMinor=21000;secondInput.phases[0].from='2026-11-03'
 const second=await cmd('estimate:save',secondInput),secondRecord=(await state()).data.estimates.find(r=>r.id===second.id)
 assert.deepEqual((await state()).data.estimates.find(r=>r.id===first.id),firstRecord,'New live rates and version never rewrite the earlier estimate')
 assert.deepEqual([secondRecord.value.totalMinor,secondRecord.value.costMinor,secondRecord.value.marginMinor],[694925,433400,261525])
 const compared=await cmd('estimate:compare',{beforeId:first.id,afterId:second.id});assert.deepEqual(compared.delta,{totalMinor:56375,effortSeconds:0,costMinor:5500,marginMinor:50875});assert.equal(compared.feasibleDates.after.find(f=>f.lineKey==='design').feasibleEnd,'2026-11-04')
 const publicCompare=await cmd('estimate:compare',{beforeId:first.id,afterId:second.id},lead.cookie)
 const forbidden=(value)=>value&&typeof value==='object'&&(Object.keys(value).some(k=>/^cost|^margin/i.test(k))||Object.values(value).some(forbidden))
 assert(!forbidden(publicCompare));assert(!JSON.stringify(publicCompare).includes('Private competing project'))
 const publicState=await state(lead.cookie);assert(publicState.data.estimates.some(r=>r.id===first.id));assert(publicState.data.estimates.every(r=>!forbidden(r.value)));assert.equal((await state(staff.cookie)).data.estimates.length,0)
 await cmd('estimate:save',firstInput,staff.cookie,403);await cmd('estimate:approve',{...second,attest:'owner-recorded-external-acceptance',evidenceRef:'No authority',reason:'Lead cannot accept'},lead.cookie,403)
 await cmd('estimate:convert',first,owner,409);const secondApproval=await accept(second)
 const withdrawal={...second,approvalId:secondApproval.id,approvalRevision:secondApproval.revision,reason:'Reported acceptance withdrawn before native preparation'}
 await cmd('estimate:withdraw',withdrawal,financeUser.cookie,403);await cmd('estimate:withdraw',withdrawal,lead.cookie,403)
 await cmd('estimate:withdraw',{...withdrawal,reason:''},owner,400)
 await cmd('estimate:withdraw',{...withdrawal,approvalRevision:first.revision},owner,409)
 await cmd('estimate:withdraw',withdrawal)
 await cmd('estimate:convert',second,owner,409)
 const withdrawn=(await state()).data.estimateApprovals.find(r=>r.id===secondApproval.id)
 assert.equal(withdrawn.value.status,'withdrawn');assert.equal(withdrawn.value.withdrawalReason,withdrawal.reason);assert.equal(withdrawn.value.notice,notice)
 const attestationHistory=await(await request(`/api/gauge/history/estimateApprovals/${withdrawn.id}`,owner)).json()
 assert.equal(attestationHistory.history[0].value.acceptorContact,attestation.acceptorContact);assert.equal(attestationHistory.history[0].value.notice,notice)
 const audit=await(await request('/api/gauge/audit?'+new URLSearchParams({kind:'estimateApprovals',recordId:withdrawn.id}),owner)).json()
 assert(audit.entries.some(r=>r.action==='estimate:withdraw'&&r.previous.status==='recorded'&&r.result.status==='withdrawn'&&r.result.withdrawalReason===withdrawal.reason&&r.result.withdrawnBy))
 const currentApproval=await cmd('estimate:approve',{...second,...attestation,channel:'PO'})
 const practice=await cmd('field:define',{scope:'engagements',name:'Quote practice',type:'single-select',options:[{id:'Brand',name:'Brand'}],required:true,visibility:'everyone',reason:'Required conversion classification'}),handover=await cmd('field:define',{scope:'tasks',name:'Quote task handover',type:'text',required:true,visibility:'everyone',reason:'Required converted task context'})
 await cmd('estimate:convert',second,owner,400)
 const conversionInput={...second,customFields:{[practice.id]:'Brand'},taskCustomFieldsDefault:{[handover.id]:'Reviewed quote source'}},converted=await cmd('estimate:convert',conversionInput,financeUser.cookie)
 assert.equal((await cmd('estimate:convert',second)).id,converted.id,'Replay returns the one engagement without requiring creation fields again')
 await cmd('opportunity:convert',opportunity).then(result=>assert.equal(result.id,converted.id))
 await cmd('estimate:withdraw',{...withdrawal,approvalId:currentApproval.id,approvalRevision:currentApproval.revision},owner,409)
 const d=await state(),conversion=d.data.estimateConversions.find(r=>r.value.estimateId===second.id).value,budget=d.data.budgets.find(r=>r.id===conversion.budgetId),milestones=d.data.milestones.filter(r=>r.value.engagementId===converted.id),tasks=d.data.tasks.filter(r=>r.value.engagementId===converted.id)
 assert.equal(d.data.engagements.filter(e=>e.value.opportunityId===opportunity.id).length,1)
 for(const record of [d.data.estimates.find(r=>r.id===second.id),d.data.engagements.find(r=>r.id===converted.id),budget,...milestones])assert.equal(record.value.acceptanceNotice,notice,'Estimate lineage retains its unverified carrier on every native source')
 assert.equal(conversion.approvalId,currentApproval.id)
 const exportedAudit=await(await request('/api/gauge/audit/export',owner)).text();assert(exportedAudit.includes(notice));assert(exportedAudit.includes(attestation.acceptorName)&&exportedAudit.includes(attestation.acceptorContact)&&exportedAudit.includes(attestation.evidenceRef))
 assert.deepEqual([budget.value.amountMinor,budget.value.expenseBudgetMinor,budget.value.effortSeconds],[689700,5225,126000]);assert.equal(budget.value.status,'draft');assert.equal(budget.value.amountMinor+budget.value.expenseBudgetMinor,694925)
 assert.equal(milestones.reduce((n,m)=>n+m.value.amountMinor,0),689700);assert(milestones.every(m=>m.value.status==='draft'&&m.value.estimateRevision===second.revision));assert.equal(tasks.length,3);assert.equal(tasks.reduce((n,t)=>n+t.value.remainingSeconds,0),126000);assert(tasks.every(t=>t.value.customFields[handover.id]==='Reviewed quote source'))
 assert.equal(budget.value.phases.reduce((n,p)=>n+p.feeBudgetMinor+p.expenseBudgetMinor,0),694925)
 assert.deepEqual(d.data.estimates.find(r=>r.id===first.id),firstRecord)
 // Conversion remains a draft preparation; native budget approval uses its normal public door.
 await cmd('budget:approve',budget)
 const nativeEngagement=(await state()).data.engagements.find(r=>r.id===converted.id)
 await cmd('save:engagements',{...nativeEngagement,...nativeEngagement.value,scope:'Reviewed engagement scope after preparation'})
 await cmd('save:milestones',{...milestones[0],...milestones[0].value,name:'Reviewed completion milestone'})
 const editedSources=await state()
 for(const [kind,id]of [['engagements',converted.id],['budgets',budget.id],['milestones',milestones[0].id]]){assert.equal(editedSources.data[kind].find(r=>r.id===id).value.acceptanceNotice,notice);const history=await(await request(`/api/gauge/history/${kind}/${id}`,owner)).json();assert(history.history.every(r=>r.value.acceptanceNotice===notice),'Native edits and approvals preserve the agency carrier in history')}
 // Hourly and mixed phase pricing are explicit; missing staffing/cost is never fabricated as feasible zero.
 const extra=await cmd('save:opportunities',{name:'Mixed estimate',clientId:client.id,ownerId:designer.id,stage:'qualified',probability:50,amountMinor:50000,demandSeconds:3600,services:'Design',from:'2026-11-09',to:'2026-11-13'})
 const mixed=structuredClone(firstInput);mixed.opportunityId=extra.id;mixed.phases[0].mode='hourly';mixed.phases[0].from='2026-11-09';mixed.phases[0].to='2026-11-13';mixed.phases[1].from='2026-11-09';mixed.phases[1].to='2026-11-13';mixed.name='Mixed quote';mixed.reason='Mixed hourly and fixed phase model';const mixedRow=await cmd('estimate:save',mixed)
 const mixedValue=(await state()).data.estimates.find(e=>e.id===mixedRow.id).value;assert.equal(mixedValue.milestones.length,1);assert.equal(mixedValue.milestones[0].phaseKey,'engineering')
 const unknown=structuredClone(mixed);unknown.previousId=mixedRow.id;unknown.lines[0].personId=null;unknown.name='Unknown staffing quote';unknown.reason='Unassigned role keeps private cost and feasible dates unknown';const unknownRow=await cmd('estimate:save',unknown),unknownValue=(await state()).data.estimates.find(e=>e.id===unknownRow.id).value;assert.equal(unknownValue.costMinor,null);assert.equal(unknownValue.marginMinor,null);assert.equal(unknownValue.feasibility.find(f=>f.lineKey==='design').feasibleEnd,null);await cmd('estimate:approve',{...unknownRow,attest:'owner-recorded-external-acceptance',evidenceRef:'Unknown',reason:'Must not invent cost or capacity'},owner,409)
 const allHourly=structuredClone(mixed);allHourly.previousId=unknownRow.id;allHourly.phases[1].mode='hourly';allHourly.name='All-hourly estimate';allHourly.reason='Explicit hourly phase model';const hourlyRow=await cmd('estimate:save',allHourly),hourlyValue=(await state()).data.estimates.find(e=>e.id===hourlyRow.id).value;assert.equal(hourlyValue.milestones.length,0);assert(hourlyValue.phases.every(p=>p.mode==='hourly'));await accept(hourlyRow)
 const raceOpportunity=await cmd('save:opportunities',{name:'Concurrent quote carrier',clientId:client.id,ownerId:designer.id,stage:'proposal',probability:75,amountMinor:50000,demandSeconds:3600,services:'Design',from:'2026-11-16',to:'2026-11-20'}),raceInput=structuredClone(allHourly);delete raceInput.previousId;raceInput.opportunityId=raceOpportunity.id;raceInput.name='Concurrent immutable quote';raceInput.reason='Source version must remain latest through conversion';for(const p of raceInput.phases){p.from='2026-11-16';p.to='2026-11-20'}const raceVersion=await cmd('estimate:save',raceInput);await accept(raceVersion)
 const raceResults=await Promise.all([h.post('/api/gauge/command',{key:randomUUID(),action:'estimate:save',...raceInput,previousId:raceVersion.id,discountBasisPoints:250,reason:'Concurrent new customer terms'},owner),h.post('/api/gauge/command',{key:randomUUID(),action:'estimate:convert',...raceVersion,customFields:{[practice.id]:'Brand'},taskCustomFieldsDefault:{[handover.id]:'Atomic current source'}},owner)])
 assert.equal(raceResults.filter(r=>r.status===200).length,1,'New terms and conversion of the old version cannot both win');assert(raceResults.every(r=>[200,409].includes(r.status)))
 const raceState=await state(),raceVersions=raceState.data.estimates.filter(e=>e.value.opportunityId===raceOpportunity.id),raceConversion=raceState.data.estimateConversions.find(e=>e.value.opportunityId===raceOpportunity.id);assert(!(raceVersions.length>1&&raceConversion),'No converted estimate is silently superseded during its committing batch')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage();const cookies=cookie=>cookie.split('; ').map(part=>{const i=part.indexOf('=');return{name:part.slice(0,i),value:part.slice(i+1),url:h.origin}});await context.addCookies(cookies(owner));const shots=process.env.GAUGE_ESTIMATE_SHOTS;if(shots)await mkdir(shots,{recursive:true})

 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(h.origin+`/app/engagements?estimate=${hourlyRow.id}#estimates`);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await page.locator('#estimates').screenshot({path:`${shots}/estimate-editor-${width}.png`})}
 const nativeWithdrawal=page.locator('#estimates form').filter({has:page.locator('input[value="estimate:withdraw"]')});await nativeWithdrawal.getByLabel('Withdrawal reason').fill('Owner corrects offline report before conversion');await nativeWithdrawal.getByRole('button',{name:'Withdraw attestation',exact:true}).click()
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});const form=page.locator('#estimates form').filter({has:page.locator('input[value="estimate:approve"]')});for(const label of ['Reported acceptor name','Reported acceptor contact','Reported acceptance date','Acceptance channel','Acceptance evidence reference'])assert.equal(await form.getByLabel(label).count(),1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots){await page.locator('#estimates').screenshot({path:`${shots}/attestation-form-${width}.png`});await form.screenshot({path:`${shots}/attestation-fields-${width}.png`})}}
 const nativeAttestation=page.locator('#estimates form').filter({has:page.locator('input[value="estimate:approve"]')});await nativeAttestation.getByLabel('Reported acceptor name').fill(attestation.acceptorName);await nativeAttestation.getByLabel('Reported acceptor contact').fill(attestation.acceptorContact);await nativeAttestation.getByLabel('Reported acceptance date').fill(attestation.acceptanceDate);await nativeAttestation.getByLabel('Acceptance channel').selectOption('verbal');await nativeAttestation.getByLabel('Acceptance evidence reference').fill(attestation.evidenceRef);await nativeAttestation.getByLabel('Attestation reason').fill(attestation.reason);await nativeAttestation.getByRole('button',{name:'Record attestation',exact:true}).click()
 const nativeRecorded=(await state()).data.estimateApprovals.find(r=>r.value.estimateId===hourlyRow.id&&r.value.status==='recorded');assert.equal(nativeRecorded.value.channel,'verbal');assert.equal(nativeRecorded.value.acceptorContact,attestation.acceptorContact)
 const nativeConversion=page.locator('#estimates form').filter({has:page.locator('input[value="estimate:convert"]')});await nativeConversion.getByLabel('Quote practice').selectOption('Brand');await nativeConversion.getByLabel('Quote task handover').fill('Native form task defaults');await nativeConversion.getByRole('button',{name:'Prepare engagement',exact:true}).click();const hourlyConversion=(await state()).data.estimateConversions.find(c=>c.value.estimateId===hourlyRow.id);assert(hourlyConversion);assert((await state()).data.tasks.filter(t=>t.value.engagementId===hourlyConversion.value.engagementId).every(t=>t.value.customFields[handover.id]==='Native form task defaults'));assert.equal((await state()).data.budgets.find(b=>b.id===hourlyConversion.value.budgetId).value.mode,'hourly')
 // Convert the previously reviewed version before the next scenario intentionally changes source inputs.
 // Agreed hourly prices govern approvals/ETC while the original quote budget governs.
 for(const person of [designer,engineer,contractor])await cmd('save:calendars',{personId:person.id,from:'2026-10-05',to:'2026-10-09',dailySeconds:28800,weekdays:'1,2,3,4,5',timezone:zone})
 const pricingOpportunity=await cmd('save:opportunities',{name:'Governing hourly quote',clientId:client.id,ownerId:designer.id,stage:'proposal',probability:75,amountMinor:50000,demandSeconds:3600,services:'Design',from:'2026-10-05',to:'2026-10-09'}),pricingInput=structuredClone(allHourly);delete pricingInput.previousId;pricingInput.opportunityId=pricingOpportunity.id;pricingInput.name='Agreed hourly prices';pricingInput.reason='Actual billing must not fall back to a person card';pricingInput.discountBasisPoints=500;for(const phase of pricingInput.phases){phase.from='2026-10-05';phase.to='2026-10-09'}const pricingVersion=await cmd('estimate:save',pricingInput);await accept(pricingVersion)
 const pricedProject=await cmd('estimate:convert',{...pricingVersion,customFields:{[practice.id]:'Brand'},taskCustomFieldsDefault:{[handover.id]:'Agreed rate source'}}),pricingConversion=(await state()).data.estimateConversions.find(c=>c.value.engagementId===pricedProject.id).value;await cmd('budget:approve',(await state()).data.budgets.find(b=>b.id===pricingConversion.budgetId))
 await cmd('save:rates',{personId:designer.id,service:'*',effective:'2026-10-01',billMinor:99999,costMinor:9000,overtimeAfterSeconds:0,overtimeBps:20000})
 let pricedTask=(await state()).data.tasks.find(t=>t.value.engagementId===pricedProject.id&&t.value.estimateLineKey==='design');pricedTask=await cmd('save:tasks',{...pricedTask,...pricedTask.value,name:'Renamed quoted design task'});assert.equal((await state()).data.tasks.find(t=>t.id===pricedTask.id).value.estimateId,pricingVersion.id)
 let pricedTime=await cmd('time:save',{engagementId:pricedProject.id,taskId:pricedTask.id,personId:designer.id,service:'Design',start:'2026-10-05T09:00:00-04:00',end:'2026-10-05T10:00:00-04:00',timezone:zone,billable:true,notes:'Governing accepted source rate'});pricedTime=await cmd('time:approve',await cmd('time:submit',pricedTime));const frozen=(await state()).data.time.find(t=>t.id===pricedTime.id).value.economics;assert.deepEqual([frozen.billRateMinor,frozen.writeDownBps,frozen.billMinor,frozen.costMinor],[15000,500,14250,9000],'One worked hour bills $150 less 5%, without contingency or unrelated overtime');assert.equal(frozen.estimateId,pricingVersion.id)
 const pricedPacket=await cmd('packet:approve',await cmd('packet:create',{engagementId:pricedProject.id,title:'Agreed hourly source',sources:[`time:${pricedTime.id}`]}));assert.equal((await state()).data.packets.find(p=>p.id===pricedPacket.id).value.totalMinor,14250)
 await cmd('save:staffing',{engagementId:pricedProject.id,personId:designer.id,phaseKey:'design',service:'Design',from:'2026-10-08',to:'2026-10-09',dailySeconds:3600,commitment:'committed',billable:true})
 const originalQuoteBudget=(await state()).data.budgets.find(b=>b.id===pricingConversion.budgetId),raisedPhases=originalQuoteBudget.value.phases.map(p=>({...p,feeBudgetMinor:p.feeBudgetMinor+(p.key==='design'?10000:0)}));const quoteChange=await cmd('budget:approve',await cmd('save:budgets',{engagementId:pricedProject.id,mode:'hourly',amountMinor:originalQuoteBudget.value.amountMinor+10000,expenseBudgetMinor:originalQuoteBudget.value.expenseBudgetMinor,effortSeconds:originalQuoteBudget.value.effortSeconds,roundingSeconds:60,phases:raisedPhases,reason:'Extra allowance preserves the agreed customer rate'}));assert.equal((await state()).data.budgets.find(b=>b.id===quoteChange.id).value.estimateId,pricingVersion.id);assert.equal((await state()).data.budgets.find(b=>b.id===quoteChange.id).value.acceptanceNotice,notice)
 const pricingReport=await(await request('/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=2026-10-07',owner)).json(),pricingForecast=pricingReport.forecast.engagements.find(e=>e.engagementId===pricedProject.id);assert.equal(pricingForecast.actualFeesMinor,14250);assert.equal(pricingForecast.etcFeesMinor,28500,'Two committed hours use the quoted 5% discount');assert(pricingForecast.sources.estimates.includes(pricingVersion.id));assert(pricingReport.lineage.some(f=>f.sources.some(s=>s.kind==='estimates'&&s.id===pricingVersion.id)))
 const pricingCsv=await request('/api/gauge/report.csv?'+new URLSearchParams({from:'2026-10-01',to:'2026-10-31',asOf:'2026-10-07',fingerprint:pricingReport.fingerprint}),owner);assert.equal(pricingCsv.status,200);assert((await pricingCsv.text()).includes(notice),'Calculation exports retain the unverified estimate carrier')
 const explained=await(await request('/api/gauge/rates/explain?'+new URLSearchParams({personId:designer.id,engagementId:pricedProject.id,taskId:pricedTask.id,service:'Design',date:'2026-10-05'}),owner)).json();assert.equal(explained.bill.level,'estimate');assert.equal(explained.bill.rate.billMinor,15000);assert.equal(explained.bill.rate.writeDownBps,500)
 const explicitProjectRate=await cmd('save:rates',{engagementId:pricedProject.id,service:'Design',effective:'2026-10-09',billMinor:17000});const changedForecast=(await(await request('/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=2026-10-07',owner)).json()).forecast.engagements.find(e=>e.engagementId===pricedProject.id);assert.equal(changedForecast.etcFeesMinor,31250,'Explicit project renegotiation overrides the quote on its effective day only');assert(changedForecast.sources.rates.includes(explicitProjectRate.id));assert.equal((await state()).data.time.find(t=>t.id===pricedTime.id).value.economics.billMinor,14250,'Later project cards never retcon an approved quoted hour')
 const ambiguousTask=await cmd('save:tasks',{engagementId:pricedProject.id,phaseKey:'design',name:'Unmapped design role',assigneeId:engineer.id,remainingSeconds:3600,customFields:{[handover.id]:'Role rate needs review'}});let ambiguousTime=await cmd('time:save',{engagementId:pricedProject.id,taskId:ambiguousTask.id,personId:engineer.id,service:'Design',start:'2026-10-06T09:00:00-04:00',end:'2026-10-06T10:00:00-04:00',timezone:zone,billable:true,notes:'Do not guess between agreed role prices'});ambiguousTime=await cmd('time:submit',ambiguousTime);await cmd('time:approve',ambiguousTime,owner,409);assert.equal((await state()).data.time.find(t=>t.id===ambiguousTime.id).value.status,'submitted');assert.equal((await state()).data.time.find(t=>t.id===ambiguousTime.id).value.economics,undefined,'An ambiguous quote cannot silently use an unrelated person rate');const negotiated=await cmd('rate:entry',{...ambiguousTime,billRateMinor:15000,writeDownBps:500,reason:'Finance explicitly reviewed the design role price'});const approvedNegotiation=await cmd('time:approve',negotiated);assert.equal((await state()).data.time.find(t=>t.id===approvedNegotiation.id).value.economics.billMinor,14250)
 let nonbillable=await cmd('time:save',{engagementId:pricedProject.id,taskId:ambiguousTask.id,personId:engineer.id,service:'Design',start:'2026-10-07T09:00:00-04:00',end:'2026-10-07T10:00:00-04:00',timezone:zone,billable:false,notes:'Nonbillable cost remains approvable without guessing a customer role rate'});nonbillable=await cmd('time:approve',await cmd('time:submit',nonbillable));const nonbillableFrozen=(await state()).data.time.find(t=>t.id===nonbillable.id).value.economics;assert.equal(nonbillableFrozen.costMinor,12000);assert.equal(nonbillableFrozen.billMinor,null)

 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(h.origin+'/app/rates?'+new URLSearchParams({explainPerson:designer.id,explainEngagement:pricedProject.id,explainTask:pricedTask.id,explainService:'Design',explainDate:'2026-10-05'}));assert.match(await page.locator('#rate-explain').innerText(),/Owner-attested estimate/);assert.match(await page.locator('#rate-explain').innerText(),/5%/);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await page.locator('#rate-explain').screenshot({path:`${shots}/quoted-rate-${width}.png`});await page.goto(h.origin+`/app/engagements?edit=${pricedProject.id}`);assert((await page.locator('#phase-budgets').innerText()).includes(notice));if(shots)await page.locator('#phase-budgets').screenshot({path:`${shots}/phase-attestation-${width}.png`})}
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(h.origin+`/app/engagements?estimate=${second.id}#estimates`);assert((await page.locator('#estimates').innerText()).includes(notice));assert(await page.locator('#estimates').isVisible());assert.match(await page.locator('#estimates').innerText(),/projected margin/);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await page.locator('#estimates').screenshot({path:`${shots}/estimate-${width}.png`})}
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(h.origin+`/app/engagements?edit=${converted.id}`);for(const selector of ['.g-detail-top',`[id="${budget.id}"]`,...milestones.map(m=>`[id="${m.id}"]`)])assert((await page.locator(selector).innerText()).includes(notice),selector+' labels the agency carrier');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots){await page.locator('main').screenshot({path:`${shots}/converted-attestation-${width}.png`});await page.locator('.g-detail-top').screenshot({path:`${shots}/engagement-attestation-${width}.png`});await page.locator(`[id="${budget.id}"]`).screenshot({path:`${shots}/budget-attestation-${width}.png`});await page.locator(`[id="${milestones[0].id}"]`).screenshot({path:`${shots}/milestone-attestation-${width}.png`})};await page.goto(h.origin+`/api/gauge/history/estimateApprovals/${withdrawn.id}`);assert((await page.locator('main').innerText()).includes(notice));assert((await page.locator('main').innerText()).includes(withdrawal.reason));assert((await page.locator('main').innerText()).includes(attestation.acceptorContact));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await page.locator('main').screenshot({path:`${shots}/attestation-history-${width}.png`})}
 await page.goto(h.origin+`/app/engagements?estimate=${second.id}#estimates`)
 await page.locator('#estimates form').filter({has:page.locator('input[value="estimate:compare"]')}).getByRole('button',{name:'Save',exact:true}).click();assert.match(await page.locator('#estimate-comparison').innerText(),/Customer price change/)
 await context.clearCookies();await context.addCookies(cookies(lead.cookie));for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(h.origin+`/app/engagements?estimate=${second.id}#estimates`);const section=page.locator('#estimates');assert.match(await section.innerText(),/restricted to finance/i);assert.equal(await section.getByText('Estimated cost',{exact:true}).count(),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(shots)await section.screenshot({path:`${shots}/estimate-lead-${width}.png`})}
 }finally{await browser.close()}
 console.log('PASS SALES-002 priced design/engineering/contractor/expense lines, exact contingency/discount/margin versions, immutable rates, feasible dates and private source boundaries, mixed/hourly phases, unknown refusal, structured owner attestation, missing-field refusals, audited pre-conversion withdrawal, post-conversion refusal, exact unverified labels/history/exports, exact-version one-engagement conversion, required fields, draft budget/tasks/milestones and 1440/390; external client identity unverified')
}

// One immutable source set rendered through the finance HTTP and native Billing doors.
export async function invoicePresentationJourney(h) {
 const {PDFDocument, PDFName, PDFArray, PDFDict, decodePDFRawStream} = await import('pdf-lib')
 const {cmd,request,owner,state}=h
 const previousNumber=Math.max(0,...(await state()).data.invoices.map(i=>Number(i.value.number.slice(4))))
 const profile=(await state()).data.agencyProfiles[0]
 await cmd('agency:profile',{...profile,legalBusiness:'Document Agency LLC',addressLine1:'44 Example Street',city:'New York',state:'NY',postalCode:'10001',einReference:'12-3456789',fiscalYearStartMonth:1,reason:'Document legal business proof'})
 const client=await cmd('save:clients',{name:'Presentation client',paymentTermsDays:30})
 const person=await cmd('save:people',{name:'Document specialist',timezone:'America/New_York'})
 await cmd('save:rates',{personId:person.id,service:'*',effective:'2026-01-01',costMinor:7000,billMinor:12345})
 const project=await cmd('save:engagements',{name:'Document project',clientId:client.id,leadId:person.id,members:[person.id],scope:'Invoice source presentation',timezone:'America/New_York'})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:1000000,effortSeconds:100000,roundingSeconds:60,reason:'Reviewed invoice sources'}))
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Document task',remainingSeconds:0})
 const sources=[]
 for(let i=1;i<=14;i++){
  const day=`2026-10-${String(i).padStart(2,'0')}`
  let row=await cmd('time:save',{personId:person.id,engagementId:project.id,taskId:task.id,service:i%2?'Design':'Support',notes:`Approved work ${i}`,timezone:'America/New_York',billable:true,start:day+'T09:00:00-04:00',end:day+'T10:00:01-04:00'})
  row=await cmd('time:approve',await cmd('time:submit',row));sources.push(`time:${row.id}`)
 }
 const amounts=[1234,2345,3456]
 for(let i=0;i<3;i++){
  let row=await cmd('expense:save',{engagementId:project.id,personId:person.id,date:'2026-10-14',description:`Approved expense ${i}`,category:i===2?'Materials':'Travel',vendor:'Reviewed vendor',amountMinor:amounts[i],reimbursable:true})
  const form=new FormData();for(const[k,v]of Object.entries({...row,key:randomUUID(),action:'expense:file'}))form.set(k,String(v));form.set('file',new File([`synthetic-gauge-${i}`],`receipt-${i}.txt`,{type:'text/plain'}))
  const uploaded=await request('/api/gauge/command',owner,{method:'POST',headers:{origin:h.origin},body:form});assert.equal(uploaded.status,200);row=await uploaded.json()
  row=await cmd('expense:approve',await cmd('expense:submit',row));sources.push(`expenses:${row.id}`)
 }
 const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:'Fourteen time entries and three expenses',sources}))
 const expected=14*Number((3660n*12345n+1800n)/3600n)+amounts.reduce((a,b)=>a+b,0)
 const agency=await cmd('invoice:settings',{clientId:null,timeMode:'project',expenseMode:'itemized',attachDetail:true,footer:'Agency remittance',additionalDetails:'<p>Agency details</p>',reason:'Agency document defaults'})
 const clientSettings={clientId:client.id,timeMode:'service',expenseMode:'category',attachDetail:true,footer:'Client remittance: synthetic-gauge-44',additionalDetails:'<p><b>Thank you</b><br>Pay under the agreed terms.</p>',reason:'Client document defaults'}
 const logoForm=new FormData();for(const[k,v]of Object.entries({key:randomUUID(),action:'invoice:settings',...clientSettings}))logoForm.set(k,String(v))
 logoForm.set('file',new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 252, 255, 31, 0, 3, 3, 2, 0, 239, 163, 71, 219, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])],'logo.png',{type:'image/png'}))
 const savedSettings=await request('/api/gauge/command',owner,{method:'POST',headers:{origin:h.origin},body:logoForm});assert.equal(savedSettings.status,200);let settings=await savedSettings.json()
 await cmd('invoice:settings',{...settings,...clientSettings,additionalDetails:'<img src="https://example.test/tracker">'},owner,400)
 const path=`/api/gauge/invoice-drafts/${packet.id}`,get=async(mode,format='json',cookie=owner)=>request(path+'?'+new URLSearchParams({revision:packet.revision,...mode,format}),cookie)
 const summarized=await(await get({})).json(),itemized=await(await get({timeMode:'entry',expenseMode:'itemized'})).json()
 assert.equal(summarized.document.agencyName,'Document Agency LLC');assert.equal(summarized.document.address.city,'New York');assert(!JSON.stringify(summarized.document).includes('12-3456789'));assert.equal(summarized.number,null);assert.equal(summarized.document.totalMinor,expected);assert.equal(itemized.document.totalMinor,expected)
 assert.equal(summarized.document.lines.length,4);assert.equal(itemized.document.lines.length,17)
 assert.deepEqual(summarized.document.detail,itemized.document.detail,'Presentation changes no exact source or money')
 assert.equal(summarized.document.settings.footer,clientSettings.footer);assert(summarized.document.settings.logo)
 assert(summarized.document.detail.filter(r=>r.kind==='expenses').every(r=>r.receipts.length===1&&r.vendor==='Reviewed vendor'))
 const sourceIds=sources.map(s=>s.split(':')[1]).sort()
 assert.deepEqual(summarized.document.detail.map(r=>r.sourceId).sort(),sourceIds)
 assert.equal(summarized.document.detail.filter(r=>r.kind==='time').reduce((n,r)=>n+r.actualSeconds,0),14*3601)
 assert.equal(summarized.document.detail.filter(r=>r.kind==='time').reduce((n,r)=>n+r.billedSeconds,0),14*3660)
 for(const timeMode of ['task','person','phase','project']){const d=await(await get({timeMode})).json();assert.equal(d.document.totalMinor,expected);assert.equal(d.document.lines.length,3);assert.deepEqual(d.document.detail,summarized.document.detail)}
 // Read the actual PDF glyph streams and Unicode font map; do not take amounts from the JSON document.
 const pdfText=async(bytes)=>{
  const pdf=await PDFDocument.load(bytes),texts=[]
  for(const page of pdf.getPages()){
   const fonts=page.node.Resources().lookup(PDFName.of('Font'),PDFDict),map=new Map()
   for(const [,ref]of fonts.entries()){
    const font=pdf.context.lookup(ref,PDFDict),unicode=font.lookup(PDFName.of('ToUnicode'))
    if(!unicode)continue
    const cmap=Buffer.from(decodePDFRawStream(unicode).decode()).toString()
    for(const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))for(const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g))map.set(m[1].toUpperCase(),String.fromCharCode(...m[2].match(/.{4}/g).map(s=>parseInt(s,16))))
   }
   const content=page.node.Contents(),streams=content instanceof PDFArray?content.asArray():[content]
   for(const ref of streams){const stream=pdf.context.lookup(ref);for(const m of Buffer.from(decodePDFRawStream(stream).decode()).toString().matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))texts.push(m[1].match(/.{4}/g).map(s=>map.get(s.toUpperCase())??'').join(''))}
  }
  return texts.join('\n')
 }
 for(const mode of [{},{timeMode:'entry',expenseMode:'itemized'}]){
  const response=await get(mode,'pdf');assert.equal(response.status,200);const text=await pdfText(new Uint8Array(await response.arrayBuffer()))
  assert(text.includes(`Total (pre-tax): USD ${(expected / 100).toFixed(2)}`));assert(text.includes(clientSettings.footer));assert(text.includes('Thank you'));assert(text.includes('Document Agency LLC'));assert(text.includes('44 Example Street'));assert(!text.includes('12-3456789'));assert(!text.includes('<b>'))
 }
 const csvResponse=await get({},'csv'),csvRows=JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'],{input:await csvResponse.text(),encoding:'utf8'}))
 assert.equal(csvRows.length,17);assert.equal(csvRows.reduce((n,r)=>n+Number(r['amount minor']),0),expected);assert.deepEqual(csvRows.map(r=>r['source id']).sort(),sourceIds)
 const detailText=await pdfText(new Uint8Array(await(await get({},'detail-pdf')).arrayBuffer()))
 for(const id of sourceIds)assert.equal(detailText.split(`Source ${id} ·`).length-1,1)
 assert.equal((await state()).data.invoices.filter(i=>i.value.packetId===packet.id).length,0,'Previews reserve neither invoice nor number')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage();await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return{name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  const shots=process.env.GAUGE_INVOICE_SHOTS;if(shots)await mkdir(shots,{recursive:true})
  const capture=async(name,selector)=>{for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Invoice presentation fits ${width}`);assert(await page.locator(selector).isVisible());if(shots)await page.locator(selector).screenshot({path:`${shots}/${name}-${width}.png`});const unlabeled=await page.locator('button,a,summary').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()&&n.querySelector('svg,img')).map(n=>n.outerHTML));assert.deepEqual(unlabeled,[],'Touched screens contain no icon-only controls without visible labels')}}
  await page.goto(h.origin+path+'?revision='+packet.revision);await capture('draft-service','#invoice-document')
  await page.locator('select[name="timeMode"]').selectOption('entry');await page.locator('select[name="expenseMode"]').selectOption('itemized');await page.getByRole('button',{name:'Preview presentation',exact:true}).click();assert.equal(await page.locator('#invoice-document li').count(),17);await capture('draft-entry','#invoice-document')
  await page.goto(h.origin+'/app/billing');await page.locator('#invoice-settings details').filter({has:page.getByText('Presentation client',{exact:true})}).locator('summary').click();await capture('document-defaults','#invoice-settings')
  const issueForm=page.locator('form').filter({has:page.locator('input[value="invoice:issue"]')}).filter({has:page.locator(`input[name="id"][value="${packet.id}"]`)})
  await issueForm.locator('..').locator('..').locator('summary').click();await issueForm.getByLabel('Issue date',{exact:true}).fill('2026-10-15');await issueForm.getByLabel('Due date under saved client terms').fill('2026-11-14');await issueForm.getByLabel('Remit to',{exact:true}).fill('Agency operating account');await issueForm.getByLabel('PO or billing reference').fill('Presentation October');await issueForm.getByRole('button',{name:'Issue invoice',exact:true}).click();await page.waitForURL('**/app/billing?saved=1')
  const issued=(await state()).data.invoices.find(i=>i.value.packetId===packet.id);assert(issued);assert.equal(Number(issued.value.number.slice(4)),previousNumber+1,'Previews consume no invoice number');assert.equal(issued.value.document.settings.timeMode,'service');assert.equal(issued.value.totalMinor,expected)
  const issuedPath=`/api/gauge/invoice-documents/${issued.id}`,original=Buffer.from(await(await request(issuedPath+'?format=pdf',owner)).arrayBuffer())
  assert.equal(Buffer.compare(original,Buffer.from(issued.value.pdf.base64,'base64')),0)
  assert((await pdfText(original)).includes(issued.value.number))
  await page.goto(h.origin+issuedPath);await capture('issued-invoice','#invoice-document')
  settings=(await state()).data.invoiceSettings.find(r=>r.value.clientId===client.id);await cmd('invoice:settings',{...settings,...clientSettings,footer:'New default only',timeMode:'entry'})
  assert.equal(Buffer.compare(original,Buffer.from(await(await request(issuedPath+'?format=pdf',owner)).arrayBuffer())),0,'Issued original stays exact after client defaults change')
  // INVOICE-003: the ordinary owner form authorizes only one confirmed recipient.
  const recipient=await h.invite('synthetic-gauge-5301'),stranger=await h.invite('synthetic-gauge-5302')
  await cmd('invoice:release',{...issued,revision:randomUUID(),contact:'synthetic-gauge-5301@example.test',days:7,reason:'Stale original'},owner,409)
  await cmd('invoice:release',{...issued,contact:'synthetic-gauge-5301@example.test',days:31,reason:'Unbounded access'},owner,400)
  await cmd('invoice:release',{...issued,contact:'synthetic-gauge-5399@example.test',days:7,reason:'Unknown recipient'},owner,409)
  await page.goto(h.origin+issuedPath);await page.setViewportSize({width:390,height:1000})
  const releaseForm=page.locator('form').filter({has:page.locator('input[value="invoice:release"]')})
  await releaseForm.getByLabel('Invited recipient email').fill('synthetic-gauge-5301@example.test');await releaseForm.getByLabel('Authorization reason').fill('Authorize the exact reviewed invoice for its client');await releaseForm.getByRole('button',{name:'Authorize exact invoice',exact:true}).click();await page.waitForURL(h.origin+issuedPath)
  const release=(await state()).data.invoiceAccess.find(r=>r.value.invoiceId===issued.id),clientPath='/app/client-invoices/'+release.id
  assert.equal(release.value.invoiceRevision,issued.revision);assert.equal(release.value.pdfSha256,issued.value.pdf.sha256)
  assert.equal((await request(clientPath,'')).status,303);assert.equal((await request(clientPath,stranger.cookie)).status,403);assert.equal((await request(clientPath,owner)).status,403)
  assert.equal((await request(clientPath,recipient.cookie,{method:'POST'})).status,405)
  assert.equal((await request(clientPath+'?format=json',recipient.cookie)).status,400)
  assert.equal((await request(issuedPath+'?format=pdf',recipient.cookie)).status,403,'Recipient has no internal finance access')
  const clientPdf=await request(clientPath+'?format=pdf',recipient.cookie);assert.equal(clientPdf.status,200);assert.equal(clientPdf.headers.get('cache-control'),'no-store');assert.equal(Buffer.compare(original,Buffer.from(await clientPdf.arrayBuffer())),0)
  for(const format of ['detail-pdf','csv']){const internal=await request(issuedPath+'?format='+format,owner),client=await request(clientPath+'?format='+format,recipient.cookie);assert.equal(client.status,200);assert.equal(Buffer.compare(Buffer.from(await internal.arrayBuffer()),Buffer.from(await client.arrayBuffer())),0)}
  const cookies=cookie=>cookie.split('; ').map(part=>{const i=part.indexOf('=');return{name:part.slice(0,i),value:part.slice(i+1),url:h.origin}})
  await context.clearCookies();await context.addCookies(cookies(recipient.cookie));await page.goto(h.origin+clientPath);assert.match(await page.locator('#invoice-document').innerText(),/Retained issued original/);assert.equal(await page.locator('nav a[href="/app/billing"]').count(),0);assert.equal(await page.locator('#invoice-client-access').count(),0);await capture('client-invoice','#invoice-document')
  await context.clearCookies();await context.addCookies(cookies(owner));await page.goto(h.origin+issuedPath);assert.match(await page.locator('#invoice-client-access').innerText(),/[1-9][0-9]* document views/);await capture('client-authorization','#invoice-client-access')
  const beforeRevoke=(await state()).data.invoiceViews;assert(beforeRevoke.some(r=>r.value.accessId===release.id&&r.value.format==='html'&&r.value.pdfSha256===issued.value.pdf.sha256))
  await page.setViewportSize({width:390,height:1000});await page.getByText('Revoke client access',{exact:true}).first().click();const revokeForm=page.locator('form').filter({has:page.locator('input[value="invoice:revoke-access"]')});await revokeForm.getByLabel('Reason',{exact:true}).fill('Client review window ended');await revokeForm.getByRole('button',{name:'Revoke client access',exact:true}).click();await page.waitForURL(h.origin+issuedPath)
  for(const format of ['html','pdf','detail-pdf','csv'])assert.equal((await request(clientPath+'?format='+format,recipient.cookie)).status,403)
  const secondRelease=await cmd('invoice:release',{...issued,contact:'synthetic-gauge-5301@example.test',days:1,reason:'Fresh consent after revocation'})
  await cmd('grant',{operatorId:recipient.id,personId:person.id,role:'staff',enabled:true})
  assert.equal((await request('/app/client-invoices/'+secondRelease.id,recipient.cookie)).status,403,'Internal grants cannot inherit client authority')
  assert.deepEqual((await h.state(recipient.cookie)).data.invoiceAccess,[]);assert.deepEqual((await h.state(recipient.cookie)).data.invoiceViews,[])
  assert.equal((await request('/api/gauge/history/invoiceAccess/'+release.id,recipient.cookie)).status,403)
  await cmd('invoice:release',{...issued,contact:'synthetic-gauge-5302@example.test',reason:'Staff cannot release'},recipient.cookie,403)
  assert.deepEqual((await state()).data.invoices.find(r=>r.id===issued.id),issued,'Client access and views preserve the exact issued original')
  await cmd('invoice:issue',{...packet,issueDate:'2026-10-15',dueDate:'2026-11-14',billTo:'Presentation client',remitTo:'Agency',reference:'Replay'},owner,409)
  assert.equal((await state()).data.invoices.filter(i=>i.value.packetId===packet.id).length,1)
  for(const role of ['staff','lead','agent']){const user=await h.invite(`presentation-${role}`);await cmd('grant',{operatorId:user.id,personId:person.id,role,enabled:true,...(role==='agent'?{purpose:'billing',engagementIds:[project.id]}:{})});assert.equal((await get({},'pdf',user.cookie)).status,403);assert.equal((await request(issuedPath+'?format=pdf',user.cookie)).status,403);assert.deepEqual((await h.state(user.cookie)).data.invoiceSettings,[]);await cmd('invoice:settings',{...agency,clientId:null,reason:'Refused write'},user.cookie,403)}
  assert.equal((await get({},'pdf','')).status,401)
  const history=await(await request(`/api/gauge/history/invoiceSettings/${settings.id}`,owner)).json();assert(history.history.length>0)
 }finally{await browser.close()}
 console.log('PASS INVOICE-008 fourteen approved time entries and three receipt-backed expenses, all time groupings, independent PDF totals, exact detail sources and durations, client footer and logo, once-only native issue, immutable originals, role privacy at 1440 and 390')
}
