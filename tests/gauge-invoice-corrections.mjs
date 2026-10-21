import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'

// INVOICE-004: credit part of an issued expense, void an unpaid invoice and reissue the valid balance, and reconcile
// every source and original document through the production command, state, history, CSV and Billing doors.
export async function invoiceCorrectionJourney(h,{worker}) {
 const {cmd,owner,request}=h,asOf='2026-10-19'
 const read=async(cookie=owner)=>{const r=await request(`/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=${asOf}`,cookie);assert.equal(r.status,200);return r.json()}
 const usd=d=>d.revenueDashboard.wip.find(x=>x.currency==='USD'),invoiceOf=async id=>(await read()).data.invoices.find(x=>x.id===id)
 const client=await cmd('save:clients',{name:'Correction client',paymentTermsDays:30})
 const project=await cmd('save:engagements',{name:'Correction support',clientId:client.id,leadId:worker.id,members:[worker.id],scope:'Corrected billing',timezone:'America/New_York'})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:500000,effortSeconds:36000,roundingSeconds:60,reason:'Correction terms'}))
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Corrected support',remainingSeconds:0})
 const work=async(day,from,hours,notes)=>{const t=await cmd('time:save',{personId:worker.id,engagementId:project.id,taskId:task.id,service:'Support',notes,timezone:'America/New_York',billable:true,start:`${day}T${String(from).padStart(2,'0')}:00:00-04:00`,end:`${day}T${String(from+hours).padStart(2,'0')}:00:00-04:00`});return cmd('time:approve',await cmd('time:submit',t))}
 const issue=async(sources,issueDate,dueDate,reference)=>{const p=await cmd('packet:approve',await cmd('packet:create',{engagementId:project.id,title:reference,sources}));return {packet:p,invoice:await cmd('invoice:issue',{...p,issueDate,dueDate,billTo:'Correction client AP',remitTo:'Agency operating account',reference})}}
 const before=usd(await read()),billedBefore=(await read()).pipeline.find(x=>x.currency==='USD').billedMinor
 // An independent approver: the owner's limit makes a $300.00 write-off wait for another finance person.
 const approver=await h.invite('correction-finance');await cmd('grant',{operatorId:approver.id,personId:worker.id,role:'finance',enabled:true})
 const policy=await cmd('approval:limit',{reviewAboveMinor:20000,reason:'Two-person review for invoice corrections'})

 // Credit part of an issued expense: the original invoice and its source reservations never change.
 let expense=await cmd('expense:save',{engagementId:project.id,personId:worker.id,date:'2026-10-08',description:'Venue deposit',amountMinor:40000,reimbursable:true})
 expense=await cmd('expense:approve',await cmd('expense:submit',expense))
 const hour=await work('2026-10-08',9,2,'Venue walkthrough')
 const first=await issue([`expenses:${expense.id}`,`time:${hour.id}`],'2026-10-12','2026-11-11','Venue October')
 const original=await invoiceOf(first.invoice.id),expenseLine=original.value.lines.findIndex(l=>l.kind==='expenses'),timeLine=original.value.lines.findIndex(l=>l.kind==='time')
 assert.equal(original.value.totalMinor,70000)
 await cmd('invoice:credit',{...first.invoice,type:'credit',lines:[{line:expenseLine,amountMinor:15000}],date:'2026-10-11',reason:'Before issue'},owner,400)
 await cmd('invoice:credit',{...first.invoice,type:'credit',lines:[{line:expenseLine,amountMinor:40001}],date:'2026-10-14',reason:'Too much'},owner,409)
 const credit=await cmd('invoice:credit',{...first.invoice,type:'credit',lines:[{line:expenseLine,amountMinor:15000}],date:'2026-10-14',reason:'Venue refunded part of the deposit'})
 let d=await read(),note=d.data.invoiceCorrections.find(x=>x.id===credit.id)
 assert.equal(note.value.status,'issued');assert.match(note.value.number,/^CN-\d{6}$/);assert.equal(note.value.lines[0].sourceId,expense.id);assert.equal(note.value.amountMinor,15000)
 assert.deepEqual(d.data.invoices.find(x=>x.id===first.invoice.id),original,'INVOICE-004 a credit never rewrites the issued invoice')
 await cmd('invoice:credit',{...first.invoice,type:'credit',lines:[{line:expenseLine,amountMinor:25001}],date:'2026-10-14',reason:'Beyond the line'},owner,409)
 await cmd('packet:create',{engagementId:project.id,title:'Rebill credited expense',sources:[`expenses:${expense.id}`]},owner,409)
 await cmd('invoice:issue',{...first.packet,issueDate:'2026-10-14',dueDate:'2026-11-13',billTo:'x',remitTo:'y',reference:'Again'},owner,409)
 // Above the limit, the preparer cannot issue its own write-off; another finance person does.
 const writeOff=await cmd('invoice:credit',{...first.invoice,type:'write-off',lines:[{line:timeLine,amountMinor:30000}],date:'2026-10-15',reason:'Walkthrough not chargeable'})
 let pending=(await read()).data.invoiceCorrections.find(x=>x.id===writeOff.id)
 assert.equal(pending.value.status,'pending');assert.equal(usd(await read()).creditedMinor-before.creditedMinor,15000,'INVOICE-004 a pending write-off changes nothing')
 await cmd('invoice:correction-approve',pending,owner,403)
 await cmd('invoice:correction-approve',pending,approver.cookie)
 d=await read();assert.equal(d.data.invoiceCorrections.find(x=>x.id===writeOff.id).value.status,'issued')
 await cmd('payment:record',{...first.invoice,date:'2026-10-16',amountMinor:25001,reference:'Over open'},owner,409)
 await cmd('invoice:void',{...first.invoice,date:'2026-10-16',reason:'Credited invoice',reissue:[]},owner,409)

 // Void an unpaid invoice and reissue the valid balance: one line keeps its amount, the mistaken line is written down.
 const valid=await work('2026-10-09',9,2,'Design review'),mistaken=await work('2026-10-09',13,1,'Logged to the wrong client')
 const second=await issue([`time:${valid.id}`,`time:${mistaken.id}`],'2026-10-13','2026-11-12','Review October')
 const voidedBefore=await invoiceOf(second.invoice.id),validLine=voidedBefore.value.lines.findIndex(l=>l.sourceId===valid.id)
 await cmd('invoice:void',{...second.invoice,date:'2026-10-15',reason:'Exceeds',reissue:[{line:validLine,amountMinor:30001}]},owner,400)
 const voided=await cmd('invoice:void',{...second.invoice,date:'2026-10-15',reason:'Wrong-client hour removed',reissue:[{line:validLine,amountMinor:30000}]})
 d=await read()
 const record=d.data.invoiceCorrections.find(x=>x.id===voided.id),reissue=d.data.invoices.find(x=>x.id===record.value.reissueInvoiceId)
 assert.equal(record.value.status,'issued');assert.equal(record.value.amountMinor,45000);assert.equal(record.value.writtenDownMinor,15000)
 assert.deepEqual(d.data.invoices.find(x=>x.id===second.invoice.id),voidedBefore,'INVOICE-004 a void never rewrites the original')
 assert.equal(reissue.value.reissueOf,second.invoice.id);assert.equal(reissue.value.packetId,second.packet.id);assert.notEqual(reissue.value.number,voidedBefore.value.number)
 assert.deepEqual(reissue.value.lines.map(l=>[l.sourceId,l.amountMinor]),[[valid.id,30000]]);assert.equal(reissue.value.totalMinor,30000);assert.equal(reissue.value.dueDate,'2026-11-14')
 for(const action of ['payment:record','invoice:promise'])await cmd(action,{...second.invoice,date:'2026-10-16',amountMinor:100,reference:'Void'},owner,409)
 await cmd('invoice:credit',{...second.invoice,type:'credit',lines:[{line:validLine,amountMinor:100}],date:'2026-10-16',reason:'Void'},owner,409)
 await cmd('invoice:void',{...second.invoice,date:'2026-10-16',reason:'Again',reissue:[]},owner,409)
 await cmd('packet:create',{engagementId:project.id,title:'Rebill written-down hour',sources:[`time:${mistaken.id}`]},owner,409)

 // Reconcile every source and document: each source is reserved once, the dashboard, cash, margin, pipeline and lineage net the corrections.
 d=await read()
 for(const source of [`expenses:${expense.id}`,`time:${hour.id}`,`time:${valid.id}`,`time:${mistaken.id}`])assert(!usd(d).sources.some(s=>`${s.kind}:${s.id}`===source),`INVOICE-004 ${source} never returns to WIP`)
 const after=usd(d)
 assert.equal(after.invoicedMinor-before.invoicedMinor,70000+30000,'voided original out, reissue in')
 assert.equal(after.creditedMinor-before.creditedMinor,45000);assert.equal(after.openMinor-before.openMinor,25000+30000)
 assert.equal(after.invoicedMinor,after.openMinor+after.paidMinor+after.creditedMinor,'INVOICE-004 invoiced = open + paid + credited')
 const cash=d.cash.engagements.find(x=>x.engagementId===project.id).items.filter(x=>x.issued)
 assert.deepEqual(cash.map(x=>[x.invoiceId,x.openMinor,x.receiptDate]).sort(),[[first.invoice.id,25000,'2026-11-11'],[reissue.id,30000,'2026-11-14']].sort())
 assert(!d.cash.engagements.find(x=>x.engagementId===project.id).items.some(x=>!x.issued&&x.revenueMonth==='2026-10'),'INVOICE-004 written-down work is never expected again')
 const margin=d.margin.find(x=>x.engagementId===project.id);assert.equal(margin.billedMinor,25000+30000);assert.match(margin.billedLabel,/net of credit notes/)
 const figure=d.lineage.find(x=>x.id==='revenue:USD:creditedMinor');assert.equal(figure.value,after.creditedMinor)
 // SALES-001 billed against booked value, FINANCE-001 billed and FINANCE-007 cash name the credit notes they net.
 assert.equal(d.pipeline.find(x=>x.currency==='USD').billedMinor-billedBefore,25000+30000)
 const credits=id=>d.lineage.find(x=>x.id===id).sources.filter(s=>s.kind==='invoiceCorrections').map(s=>s.id).sort()
 assert.deepEqual(credits('pipeline:USD:billedMinor'),[credit.id,writeOff.id].sort());assert.deepEqual(credits(`margin:${project.id}:billedMinor`),[credit.id,writeOff.id].sort())
 assert(credits('cash:USD:2026-11:expectedMinor').includes(credit.id))
 for(const id of [credit.id,writeOff.id])assert(figure.sources.some(s=>s.kind==='invoiceCorrections'&&s.id===id))
 assert(figure.sources.some(s=>s.kind==='expenses'&&s.id===expense.id))
 const csv=await request('/api/gauge/report.csv?'+new URLSearchParams({from:d.from,to:d.to,asOf,fingerprint:d.fingerprint}),owner);assert.equal(csv.status,200);assert.match(await csv.text(),/revenue:USD:creditedMinor/)
 // INVOICE-006 aging and statements trace the same credits and void: invoiced = paid + credited + voided + open.
 const statement=await (await request('/api/gauge/receivables?'+new URLSearchParams({asOf,clientId:client.id}),owner)).json(),owed=statement.totals[0]
 assert.deepEqual([owed.invoicedMinor,owed.paidMinor,owed.creditedMinor,owed.voidedMinor,owed.openMinor],[145000,0,45000,45000,55000])
 assert.equal(owed.aging.reduce((n,b)=>n+b.amountMinor,0),55000);assert(statement.invoices.every(i=>i.invoicedMinor===i.paidMinor+i.creditedMinor+i.voidedMinor+i.openMinor))
 const statementCsv=await (await request('/api/gauge/receivables.csv?'+new URLSearchParams({asOf,clientId:client.id,fingerprint:statement.fingerprint}),owner)).text()
 assert.equal((statementCsv.match(/^"credit",/gm)??[]).length,2);assert.equal((statementCsv.match(/^"void",/gm)??[]).length,1)
 // BOUNDARY-001: signed invoice-category rows reconcile each document once; a rejection stays unresolved and changes nothing.
 const documents=[...d.data.invoices.filter(x=>[first.invoice.id,second.invoice.id,reissue.id].includes(x.id)).map(r=>({kind:'invoices',id:r.id,revision:r.revision})),...d.data.invoiceCorrections.filter(x=>[credit.id,writeOff.id,voided.id].includes(x.id)).map(r=>({kind:'invoiceCorrections',id:r.id,revision:r.revision}))]
 const handoff=await cmd('handoff:prepare',{purpose:'accounting',recipient:'Correction accountant',reason:'Reconcile issued invoices, credit notes and the void',sources:documents})
 const prepared=(await read()).data.specialistHandoffs.find(x=>x.id===handoff.id)
 assert.equal(prepared.value.controlTotals.find(x=>x.category==='invoice').amountMinor,70000-15000-30000+45000-45000+30000)
 const result={handoffId:handoff.id,artifactHash:prepared.value.artifactHash,lines:prepared.value.lines.map(l=>({id:l.id,status:l.sourceId===voided.id?'rejected':'accepted',...(l.sourceId===voided.id?{reason:'Accountant needs the void memo'}:{}),currency:l.currency,amountMinor:l.amountMinor,durationSeconds:l.durationSeconds}))}
 await cmd('handoff:record-result',{...handoff,result})
 const recorded=(await read()).data.specialistHandoffs.find(x=>x.id===handoff.id).value.result
 assert.equal(recorded.rejectedCount,1);assert.equal(recorded.verification,'user-recorded')
 assert.equal((await read()).data.invoiceCorrections.find(x=>x.id===voided.id).value.status,'issued','a rejected handoff row changes no document')
 for(const role of ['staff','lead']){
  const actor=await h.invite(`correction-${role}`);await cmd('grant',{operatorId:actor.id,personId:worker.id,role,enabled:true})
  assert.deepEqual((await read(actor.cookie)).data.invoiceCorrections,[])
  assert.equal((await request(`/api/gauge/history/invoiceCorrections/${credit.id}`,actor.cookie)).status,403)
  await cmd('invoice:credit',{...first.invoice,type:'discount',lines:[{line:expenseLine,amountMinor:100}],date:'2026-10-16',reason:'Not finance'},actor.cookie,403)
 }
 // The Billing form issues a discount on the reissue at 390 px; both widths fit and show the linked documents.
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
  await context.addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  await page.setViewportSize({width:390,height:1000});await page.goto(h.origin+'/app/billing')
  const card=page.locator(`#invoice-${reissue.id}`)
  await card.locator('summary',{hasText:'Credit, discount or write off'}).click()
  const creditForm=card.locator('form').filter({has:page.locator('input[name="action"][value="invoice:credit"]')})
  await creditForm.getByLabel('Correction type').selectOption('discount');await creditForm.getByLabel(/Credit amount/).fill('50.00')
  await creditForm.getByLabel('Credit date').fill('2026-10-16');await creditForm.getByLabel('Reason').fill('Loyalty discount agreed')
  await creditForm.getByRole('button',{name:'Issue credit note'}).click();await page.waitForURL('**/app/billing?saved=1')
  const discount=(await read()).data.invoiceCorrections.find(x=>x.value.invoiceId===reissue.id)
  assert.equal(discount.value.type,'discount');assert.equal(discount.value.amountMinor,5000);assert.equal(discount.value.status,'issued')
  assert.match(await page.locator(`#invoice-${second.invoice.id}`).innerText(),new RegExp(`Void 2026-10-15 · reissued as ${reissue.value.number}`))
  assert.match(await page.locator(`#invoice-${reissue.id}`).innerText(),/Approved discount/)
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`INVOICE-004 billing fits ${width}`)
   if(process.env.GAUGE_CASH_SHOTS){await mkdir(process.env.GAUGE_CASH_SHOTS,{recursive:true});for(const id of [first.invoice.id,second.invoice.id,reissue.id])await page.locator(`#invoice-${id}`).screenshot({path:`${process.env.GAUGE_CASH_SHOTS}/INVOICE-004-${id===first.invoice.id?'credited':id===reissue.id?'reissue':'void'}-${width}.png`})}
  }
 }finally{await browser.close()}
 await cmd('approval:limit',{id:policy.id,revision:(await read()).data.approvalPolicies[0].revision,reviewAboveMinor:'',reason:'Limit test complete'})
 console.log('PASS INVOICE-004 credit part of an issued expense, independent write-off approval, void and reissue of the valid balance; originals immutable, sources reserved once, cash/margin/pipeline/dashboard/lineage/CSV and specialist handoff reconcile; finance-only; Billing form at 390 and 1440')
}
