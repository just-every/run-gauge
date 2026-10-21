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
