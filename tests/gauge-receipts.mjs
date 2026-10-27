import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {chromium} from '@playwright/test'

// INVOICE-006: one client payment covers two invoices and leaves an unapplied balance; aging and statement totals are
// traced through a dispute and a later credit, through the command, receivables, state, CSV and Billing doors.
export async function receiptJourney(h,worker) {
 const {cmd,request,owner,post}=h
 const read=async(asOf,clientId,cookie=owner)=>{const r=await request('/api/gauge/receivables?'+new URLSearchParams({asOf,clientId}),cookie);assert.equal(r.status,200);return r.json()}
 const state=async(cookie=owner,asOf='2026-10-31')=>{const r=await request(`/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=${asOf}`,cookie);assert.equal(r.status,200);return r.json()}
 const client=await cmd('save:clients',{name:'Receipt client',paymentTermsDays:30}),other=await cmd('save:clients',{name:'Other receipt client',paymentTermsDays:30})
 const engagement=async(c,name)=>{
  const p=await cmd('save:engagements',{name,clientId:c.id,leadId:worker.id,members:[worker.id],scope:'Receipt controls',timezone:'America/New_York'})
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:p.id,mode:'hourly',amountMinor:500000,effortSeconds:72000,roundingSeconds:60,reason:`${name} terms`}))
  return {project:p,task:await cmd('save:tasks',{engagementId:p.id,name,remainingSeconds:0})}
 }
 const mine=await engagement(client,'Receipt service'),theirs=await engagement(other,'Other receipt service')
 const invoice=async({project,task},day,hours)=>{
  let t=await cmd('time:save',{personId:worker.id,engagementId:project.id,taskId:task.id,service:'Support',notes:'Receipt service',timezone:'America/New_York',billable:true,start:`${day}T09:00:00-04:00`,end:`${day}T${String(9+hours).padStart(2,'0')}:00:00-04:00`})
  t=await cmd('time:approve',await cmd('time:submit',t))
  const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:`Receipt ${day}`,sources:[`time:${t.id}`]}))
  return cmd('invoice:issue',{...packet,issueDate:day,dueDate:new Date(Date.parse(day+'T00:00:00Z')+30*864e5).toISOString().slice(0,10),billTo:'Receipt client AP',remitTo:'Agency',reference:`Receipt ${day}`})
 }
 // $150.00, $300.00, $150.00 and $150.00 at the $150/h bill rate.
 const [a,b,c,d]=[await invoice(mine,'2026-09-01',1),await invoice(mine,'2026-09-02',2),await invoice(mine,'2026-09-03',1),await invoice(mine,'2026-09-04',1)]
 const foreign=await invoice(theirs,'2026-09-07',1)
 const totals=async asOf=>(await read(asOf,client.id)).totals[0]
 assert.equal((await totals('2026-10-31')).invoicedMinor,75000)

 // One $500.00 payment under one external reference; a reference identifies one receipt.
 const input={clientId:client.id,currency:'USD',date:'2026-10-20',amountMinor:50000,reference:'WIRE-7781'}
 const wire=await cmd('receipt:record',input)
 await cmd('receipt:record',{...input,amountMinor:100},owner,409)
 await cmd('payment:record',{...a,date:'2026-10-20',amountMinor:100,reference:'WIRE-7781'},owner,409)
 await cmd('receipt:record',{...input,reference:'WIRE-BAD',currency:'usd'},owner,400)
 await cmd('receipt:record',{...input,reference:'WIRE-ZERO',amountMinor:0},owner,400)
 const allocate=(receipt,invoiceRow,amountMinor,date='2026-10-22',expected=200)=>cmd('receipt:allocate',{...receipt,invoiceId:invoiceRow.id,date,amountMinor},owner,expected)
 // Refused allocations record nothing: another client's invoice, before the receipt, beyond the invoice, beyond the receipt.
 await allocate(wire,foreign,1000,'2026-10-22',400)
 await allocate(wire,a,1000,'2026-10-19',400)
 await allocate(wire,a,15001,'2026-10-22',409)
 assert.equal((await totals('2026-10-31')).paidMinor,0)

 // The same payment covers two invoices: $150.00 clears the first, $250.00 of the second's $300.00.
 const key=randomUUID(),body={key,action:'receipt:allocate',...wire,invoiceId:a.id,date:'2026-10-22',amountMinor:15000}
 const once=await (await post('/api/gauge/command',body,owner)).json();assert.deepEqual(await (await post('/api/gauge/command',body,owner)).json(),once,'INVOICE-006 a replayed key allocates once')
 await allocate(wire,b,25000)
 await allocate(wire,a,100,'2026-10-22',409)
 let t=await totals('2026-10-31')
 assert.deepEqual([t.invoicedMinor,t.paidMinor,t.openMinor,t.receivedMinor,t.unappliedMinor],[75000,40000,35000,50000,10000],'INVOICE-006 independent statement: $750 invoiced, $400 allocated, $100 unapplied')
 assert.equal(t.receivedMinor,t.paidMinor+t.unappliedMinor)
 let report=await read('2026-10-31',client.id)
 assert.deepEqual(report.receipts.map(r=>[r.reference,r.amountMinor,r.allocatedMinor,r.unappliedMinor,r.allocations.length]),[['WIRE-7781',50000,40000,10000,2]])
 t=await totals('2026-10-21');assert.deepEqual([t.paidMinor,t.openMinor,t.unappliedMinor],[0,75000,50000],'INVOICE-006 before the allocations the whole receipt is unapplied')
 assert.equal((await read('2026-10-19',client.id)).receipts.length,0,'INVOICE-006 a receipt dated after the as-of day is excluded')
 assert.equal((await read('2026-10-31',other.id)).receipts.length,0)

 // A second, smaller payment: two allocations that each fit alone cannot both fit the receipt.
 const small=await cmd('receipt:record',{...input,amountMinor:10000,reference:'WIRE-7782'})
 const races=await Promise.all([c,d].map(invoiceRow=>post('/api/gauge/command',{key:randomUUID(),action:'receipt:allocate',...small,invoiceId:invoiceRow.id,date:'2026-10-22',amountMinor:6000},owner)))
 assert.deepEqual(races.map(r=>r.status).sort(),[200,409],'INVOICE-006 concurrent allocations cannot exceed the receipt')
 const paid=async()=>Object.fromEntries((await read('2026-10-31',client.id)).invoices.map(i=>[i.id,i.paidMinor]))
 const settled=await paid(),winner=[c,d].find(i=>settled[i.id]===6000),loser=[c,d].find(i=>i!==winner)
 assert(winner&&loser&&settled[loser.id]===0)
 t=await totals('2026-10-31');assert.deepEqual([t.paidMinor,t.openMinor,t.receivedMinor,t.unappliedMinor],[46000,29000,60000,14000])

 // A dispute flags part of what is open and changes no amount, bucket or cash month.
 const before=await read('2026-10-31',client.id)
 const dispute=await cmd('invoice:dispute',{...b,date:'2026-10-23',amountMinor:3000,reason:'Client questions the second hour'})
 await cmd('invoice:dispute',{...b,date:'2026-10-23',amountMinor:1000,reason:'Second open dispute'},owner,409)
 await cmd('invoice:dispute',{...a,date:'2026-10-23',amountMinor:1,reason:'Nothing open'},owner,409)
 await cmd('invoice:dispute',{...c,date:'2026-10-23',amountMinor:99999,reason:'More than open'},owner,409)
 report=await read('2026-10-31',client.id)
 assert.equal(report.totals[0].disputedMinor,3000);assert.equal(report.invoices.find(i=>i.id===b.id).disputedMinor,3000)
 assert.deepEqual(report.totals[0].aging,before.totals[0].aging,'INVOICE-006 a dispute never moves aging');assert.equal(report.totals[0].openMinor,before.totals[0].openMinor)
 assert.equal((await read('2026-10-22',client.id)).totals[0].disputedMinor,0,'INVOICE-006 a dispute counts from its own date')
 // FINANCE-007: the disputed $30.00 is listed apart and never expected as cash; the undisputed $20.00 still is.
 const cashItem=async(asOf,id)=>(await state(owner,asOf)).cash.engagements.find(x=>x.engagementId===mine.project.id).items.find(x=>x.invoiceId===id&&!x.promised)
 let item=await cashItem('2026-10-23',b.id);assert.deepEqual([item.openMinor,item.disputedMinor,item.expectedMinor],[2000,3000,2000],'FINANCE-007 independent recomputation: $50.00 open less the $30.00 dispute')
 item=await cashItem('2026-10-22',b.id);assert.deepEqual([item.openMinor,item.disputedMinor],[5000,0])
 const cash=(await state(owner,'2026-10-23')),figure=cash.lineage.find(x=>x.id==='cash:USD:2026-10:expectedMinor')
 assert(figure.sources.some(x=>x.kind==='invoiceDisputes'&&x.id===dispute.id),'FINANCE-007 expected cash names the dispute that removed an amount')
 assert.match(cash.cash.issuedReceivables,/3\d*\.\d\d disputed|30\.00 disputed/)

 // A later credit: the disputed second invoice is credited its remaining $50.00 and the dispute resolved against it.
 const credit=await cmd('invoice:credit',{...b,type:'credit',lines:[{line:0,amountMinor:5000}],date:'2026-10-24',reason:'Second hour credited after the dispute'})
 await cmd('invoice:dispute-resolve',{...dispute,outcome:'credited',date:'2026-10-24',resolution:'Credited in full'},owner,400)
 await cmd('invoice:dispute-resolve',{...dispute,outcome:'credited',date:'2026-10-24',resolution:'Credited in full',creditId:credit.id})
 await cmd('invoice:dispute-resolve',{...dispute,outcome:'rejected',date:'2026-10-25',resolution:'Again'},owner,409)
 t=await totals('2026-10-23');assert.deepEqual([t.creditedMinor,t.openMinor,t.disputedMinor],[0,29000,3000])
 item=await cashItem('2026-10-24',b.id);assert.deepEqual([item.openMinor,item.disputedMinor],[0,0],'FINANCE-007 a resolved, credited dispute leaves nothing to expect')
 t=await totals('2026-10-24');assert.deepEqual([t.invoicedMinor,t.paidMinor,t.creditedMinor,t.openMinor,t.disputedMinor,t.unappliedMinor],[75000,46000,5000,24000,0,14000],'INVOICE-006 invoiced = paid + credited + open through the credit; unapplied stays a client balance')
 assert.equal(t.invoicedMinor,t.paidMinor+t.creditedMinor+t.openMinor)
 assert.equal(t.aging.reduce((n,x)=>n+x.amountMinor,0),t.openMinor)

 // The remaining $100.00 of the first payment pays the untouched invoice; the rest is allocated on the Billing page.
 await allocate(wire,loser,10000,'2026-10-26')
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
  await context.addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  await page.setViewportSize({width:1440,height:1000});await page.goto(h.origin+'/app/billing')
  const card=page.locator(`#receipt-${small.id}`);assert.match(await card.innerText(),/WIRE-7782[\s\S]*Unapplied \$40\.00/)
  const loserNumber=(await state()).data.invoices.find(i=>i.id===loser.id).value.number
  await card.locator('summary').click()
  const label=(await card.getByLabel('Invoice').locator('option').allInnerTexts()).find(x=>x.startsWith(loserNumber));assert(label)
  await card.getByLabel('Invoice').selectOption({label})
  await card.getByLabel('Allocation date').fill('2026-10-27');await card.getByLabel('Allocated amount (USD)').fill('40.00')
  await card.getByRole('button',{name:'Allocate receipt'}).click();await page.waitForURL('**/app/billing?saved=1')
  assert.match(await page.locator('#client-receipts').innerText(),/WIRE-7782[\s\S]*Unapplied \$0\.00/)
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`INVOICE-006 receipts fit ${width}`)}
  assert.match(await page.locator(`#invoice-${b.id}`).innerText(),/disputed[\s\S]*resolved 2026-10-24[\s\S]*Credited/i)
 }finally{await browser.close()}
 t=await totals('2026-10-31');assert.deepEqual([t.paidMinor,t.receivedMinor,t.unappliedMinor,t.openMinor],[60000,60000,0,10000],'INVOICE-006 after every allocation received = allocated')
 assert.equal(t.receivedMinor,t.paidMinor+t.unappliedMinor)

 // Paid cash per engagement is the allocated payments, and the statement CSV carries receipts, unapplied and disputes.
 const margin=(await state()).margin.find(x=>x.engagementId===mine.project.id)
 assert.equal(margin.paidCashMinor,60000);assert.doesNotMatch(margin.paidCashLabel,/No payments/)
 report=await read('2026-10-24',client.id)
 const response=await request('/api/gauge/receivables.csv?'+new URLSearchParams({asOf:'2026-10-24',clientId:client.id,fingerprint:report.fingerprint}),owner);assert.equal(response.status,200)
 const rows=JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps(list(csv.DictReader(sys.stdin))))'],{input:await response.text(),encoding:'utf8'}))
 const receipts=rows.filter(r=>r.row==='client receipt'),sumOf=(list,k)=>list.reduce((n,r)=>n+Number(r[k]||0),0)
 assert.equal(sumOf(receipts,'receipt minor'),60000);assert.equal(sumOf(receipts,'unapplied minor'),14000,'INVOICE-006 CSV unapplied as of the day before the later allocations')
 assert.equal(sumOf(rows.filter(r=>r.row==='client total'),'unapplied minor'),14000)

 // Finance only: no other role reads receipts or disputes, records them or opens their history.
 for(const role of ['staff','lead','agent']){
  const actor=await h.invite(`receipt-${role}`);await cmd('grant',{operatorId:actor.id,personId:worker.id,role,enabled:true,...(role==='agent'?{purpose:'billing',engagementIds:[mine.project.id]}:{})})
  const restricted=await state(actor.cookie);assert.deepEqual([restricted.data.clientReceipts,restricted.data.invoiceDisputes],[[],[]])
  await cmd('receipt:record',{...input,reference:`NOPE-${role}`},actor.cookie,403);await cmd('receipt:allocate',{...wire,invoiceId:loser.id,date:'2026-10-27',amountMinor:100},actor.cookie,403)
  await cmd('invoice:dispute',{...c,date:'2026-10-27',amountMinor:100,reason:'No'},actor.cookie,403)
  for(const path of [`/api/gauge/history/clientReceipts/${wire.id}`,`/api/gauge/history/invoiceDisputes/${dispute.id}`])assert.equal((await request(path,actor.cookie)).status,403)
 }
 console.log('PASS INVOICE-006 one payment across two invoices with an unapplied balance, unique references, exact allocation races, disputes, a later credit, as-of statements, CSV and finance-only access')
}
