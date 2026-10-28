import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {harness} from './gauge-harness.mjs'

// INVOICE-002 / INVOICE-010 / INVOICE-011: two real fixed projects, paid deposits and cumulative progress,
// exact source reservations, failed competing approvals and separate billing from delivery.
export async function progressJourney(h,worker) {
 const {cmd,state,owner,request,post}=h,zone='America/New_York'
 const client=await cmd('save:clients',{name:'Maple Design accounts payable',paymentTermsDays:30})
 const projects=[]
 for(const [name,total] of [['Maple brand launch',1000000],['Maple commerce build',2000000]]){
  const engagement=await cmd('save:engagements',{name,clientId:client.id,leadId:worker.id,members:[worker.id],scope:'Approved fixed-fee delivery',timezone:zone})
  const approved=await cmd('budget:approve',await cmd('save:budgets',{engagementId:engagement.id,mode:'fixed',amountMinor:total,effortSeconds:36000,roundingSeconds:60,reason:'Client accepted fixed fee'}))
  projects.push({engagement,total,budget:approved})
 }
 const chargeInput=(p,bps,type='progress')=>({engagementId:p.engagement.id,budgetId:p.budget.id,budgetRevision:p.budget.revision,name:`${p.engagement.id===projects[0].engagement.id?'Brand':'Commerce'} ${type}`,chargeType:type,cumulativeBasisPoints:bps,date:'2026-10-15',reason:'Reviewed contractual billing schedule'})
 const record=async id=>(await state()).data.fixedCharges.find(r=>r.id===id)
 const issue=async(p,charge,date)=>{
  await cmd('packet:create',{engagementId:p.engagement.id,title:'Premature draft',sources:[`fixedCharges:${charge.id}`]},owner,400)
  charge=await cmd('fixed:approve',charge)
  const scheduled=await(await request('/api/gauge/state?from=2026-10-01&to=2026-11-30&asOf=2026-10-21',owner)).json()
  const expected=scheduled.cash.engagements.find(e=>e.engagementId===p.engagement.id).items.filter(i=>i.source===`fixedCharges:${charge.id}`)
  assert.deepEqual(expected.map(i=>[i.issued,i.amountMinor,i.receiptDate]),[[false,(await record(charge.id)).value.amountMinor,'2026-11-14']],'INVOICE-002 unissued charge uses its exact schedule and client terms')
  const abandoned=await cmd('packet:create',{engagementId:p.engagement.id,title:'Cancelled charge preparation',sources:[`fixedCharges:${charge.id}`]})
  await cmd('packet:cancel',abandoned)
  await cmd('fixed:prepare',chargeInput(p,(await record(charge.id)).value.cumulativeBasisPoints),owner,400)
  if(date==='2026-10-20')return {charge:await record(charge.id)}
  const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:p.engagement.id,title:`${p.total/100} fixed fee`,sources:[`fixedCharges:${charge.id}`]}))
  const invoice=await cmd('invoice:issue',{...packet,issueDate:date,dueDate:date==='2026-10-15'?'2026-11-14':'2026-11-19',billTo:'Maple Design AP',remitTo:'Agency operating account',reference:`MAPLE-${charge.id}`})
  await cmd('packet:create',{engagementId:p.engagement.id,title:'Duplicate charge',sources:[`fixedCharges:${charge.id}`]},owner,409)
  return {charge:await record(charge.id),packet,invoice}
 }
 const deposits=[]
 for(const p of projects){
  const draft=await cmd('fixed:prepare',chargeInput(p,2000,'deposit'))
  const issued=await issue(p,draft,'2026-10-15');deposits.push(issued)
  assert.deepEqual([issued.charge.value.grossMinor,issued.charge.value.priorMinor,issued.charge.value.amountMinor],[p.total/5,0,p.total/5])
  await cmd('payment:record',{...issued.invoice,date:'2026-10-16',amountMinor:p.total/5,reference:`CHECK-${p.engagement.id}`})
  await cmd('fixed:prepare',chargeInput(p,2000,'deposit'),owner,409)
 }
 // Progress target is 50% gross: the earlier 20% is deducted, so only another 30% is charged.
 const progress=[]
 for(const p of projects){
  const input=chargeInput(p,5000),key=randomUUID(),body={...input,key,action:'fixed:prepare'}
  const first=await post('/api/gauge/command',body,owner);assert.equal(first.status,200);const draft=await first.json()
  assert.deepEqual(await(await post('/api/gauge/command',body,owner)).json(),draft,'INVOICE-002 exact prepare replay returns one draft')
  const competing=await cmd('fixed:prepare',input)
  const issued=await issue(p,draft,'2026-10-20');progress.push(issued)
  await cmd('fixed:approve',competing,owner,409)
  const withdrawn=await cmd('fixed:withdraw',{...competing,reason:'Another reviewed progress charge was approved'})
  await cmd('fixed:approve',withdrawn,owner,409)
  assert.equal((await record(withdrawn.id)).value.status,'withdrawn','INVOICE-002 finance can retire an obsolete draft without resetting its approved budget')
  assert.deepEqual([issued.charge.value.grossMinor,issued.charge.value.priorMinor,issued.charge.value.amountMinor],[p.total/2,p.total/5,p.total*3/10])
  await cmd('fixed:prepare',chargeInput(p,10001),owner,400)
  await cmd('fixed:prepare',chargeInput(p,5000),owner,400)
 }
 // One client invoice combines both net progress charges, through the native form.
 const sources=progress.map(p=>`fixedCharges:${p.charge.id}`)
 await cmd('packet:create',{engagementId:projects[0].engagement.id,title:'Must opt in',sources},owner,400)
 const outsider=await cmd('save:clients',{name:'Different client'})
 const other=await cmd('save:engagements',{name:'Other client project',clientId:outsider.id,leadId:worker.id,members:[worker.id],scope:'Separate client',timezone:zone})
 const otherExpense=await cmd('expense:approve',await cmd('expense:submit',await cmd('expense:save',{engagementId:other.id,personId:worker.id,date:'2026-10-10',description:'Other client materials',amountMinor:100,reimbursable:true})))
 await cmd('packet:create',{engagementId:projects[0].engagement.id,title:'Cross-client refused',consolidate:true,sources:[sources[0],`expenses:${otherExpense.id}`]},owner,400)
 const foreign=await cmd('save:engagements',{name:'Maple CAD project',clientId:client.id,currency:'CAD',leadId:worker.id,members:[worker.id],scope:'Separate currency',timezone:zone})
 const foreignExpense=await cmd('expense:approve',await cmd('expense:submit',await cmd('expense:save',{engagementId:foreign.id,personId:worker.id,date:'2026-10-10',description:'CAD materials',amountMinor:100,reimbursable:true})))
 await cmd('packet:create',{engagementId:projects[0].engagement.id,title:'Mixed currency refused',consolidate:true,sources:[sources[0],`expenses:${foreignExpense.id}`]},owner,400)
 const combinedBrowser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 let combined
 try{
  const context=await combinedBrowser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
  await context.addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  const billingResponse=await request('/app/billing',owner);assert.equal(billingResponse.status,200,(await billingResponse.text()).slice(0,1000))
  await page.goto(h.origin+'/app/billing')
  assert.equal(await page.locator('[name=consolidate]').count(),1,(await page.locator('body').innerText()).slice(0,1400))
  const form=page.locator('[name=consolidate]').locator('xpath=ancestor::form')
  assert.equal(await form.count(),1,'Consolidation checkbox belongs to the packet form')
  await form.locator('select[name=engagementId]').selectOption(projects[0].engagement.id)
  await form.getByLabel('Combine projects for this client',{exact:true}).check()
  await form.getByLabel('Packet title',{exact:true}).fill('Combined Maple progress')
  for(const source of sources)await form.locator(`input[name=sources][value="${source}"]`).check()
  await form.getByRole('button',{name:'Save',exact:true}).click();await page.waitForURL('**/app/billing?saved=1')
  const packet=(await state()).data.packets.find(p=>p.value.title==='Combined Maple progress')
  const approved=await cmd('packet:approve',packet)
  const preview=await request(`/api/gauge/invoice-drafts/${packet.id}?revision=${approved.revision}&format=json`,owner)
  assert.equal(preview.status,200);const document=(await preview.json()).document
  assert.deepEqual(document.detail.map(l=>l.projectId),projects.map(p=>p.engagement.id),'Consolidated source detail retains stable project identity')
  assert.equal(document.totalMinor,900000);assert.deepEqual(document.detail.map(l=>[l.project,l.amountMinor,l.remainingMinor]),[['Maple brand launch',300000,500000],['Maple commerce build',600000,1000000]])
  combined=await cmd('invoice:issue',{...approved,issueDate:'2026-10-20',dueDate:'2026-11-19',billTo:'Maple Design AP',remitTo:'Agency account',reference:'MAPLE-COMBINED',attachDetail:true})
  for(const [index,p]of progress.entries()){p.packet=approved;p.invoice=combined}
  await cmd('invoice:issue',{...approved,issueDate:'2026-10-20',dueDate:'2026-11-19',billTo:'Maple Design AP',remitTo:'Agency account',reference:'MAPLE-REPLAY'},owner,409)
  for(const width of [1440,390])for(const path of ['/app/billing',`/api/gauge/invoice-documents/${combined.id}`]){
   await page.setViewportSize({width,height:1000});await page.goto(h.origin+path);await page.evaluate(()=>document.fonts.ready)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Combined invoice fits ${width}`)
   assert(await page.getByText('Maple commerce build',{exact:false}).count())
   // Every icon-only control on the touched screen carries its existing tooltip.
   for(const control of await page.locator('button,a[role=button]').all())if(!(await control.textContent()).trim())assert(await control.getAttribute('data-tooltip'),'Icon-only control has a tooltip')
   if(process.env.GAUGE_PROGRESS_SHOTS){await mkdir(process.env.GAUGE_PROGRESS_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.GAUGE_PROGRESS_SHOTS}/combined-${path==='/app/billing'?'billing':'invoice'}-${width}.png`,fullPage:true})}
  }
  const csv=await(await request(`/api/gauge/invoice-documents/${combined.id}?format=csv`,owner)).text()
  assert(csv.includes('Maple brand launch')&&csv.includes('Maple commerce build')&&csv.includes('500000')&&csv.includes('1000000'))
 }finally{await combinedBrowser.close()}
 let d=await state()
 for(const [index,p]of projects.entries()){
  const docs=d.data.invoices.filter(i=>(i.value.engagementIds??[i.value.engagementId]).includes(p.engagement.id)).map(i=>({...i,value:{...i.value,totalMinor:i.value.lines.filter(l=>l.engagementId===p.engagement.id).reduce((n,l)=>n+l.amountMinor,0),lines:i.value.lines.filter(l=>l.engagementId===p.engagement.id)}}))
  assert.deepEqual(docs.map(i=>i.value.totalMinor),[p.total/5,p.total*3/10])
  assert.equal(docs.reduce((n,i)=>n+i.value.totalMinor,0),p.total/2)
  const line=docs[1].value.lines[0];assert.equal(line.priorMinor,p.total/5);assert.equal(line.grossMinor,p.total/2);assert.equal(line.sourceSnapshot.revision,progress[index].charge.revision)
  const csv=await(await request(`/api/gauge/packets/${progress[index].packet.id}`,owner)).text();assert(csv.includes(progress[index].charge.id))
  const cashResponse=await request('/api/gauge/state?from=2026-10-01&to=2026-11-30&asOf=2026-10-21',owner),cash=await cashResponse.json()
  const items=cash.cash.engagements.find(e=>e.engagementId===p.engagement.id).items
  assert.equal(items.filter(i=>i.issued).reduce((n,i)=>n+i.openMinor,0),p.total*3/10)
  assert(!items.some(i=>!i.issued&&i.source.startsWith('fixedCharges:')),'INVOICE-002 issue replaces its schedule once')
  assert.equal(d.data.milestones.filter(m=>m.value.engagementId===p.engagement.id).length,0,'A deposit never invents delivery acceptance')
  await cmd('invoice:credit',{...progress[index].invoice,type:'credit',line:index,amountMinor:100,date:'2026-10-21',reason:'Reviewed fixed fee credit'})
  await cmd('fixed:prepare',chargeInput(p,5000),owner,400)
  const finals=await Promise.all([cmd('fixed:prepare',chargeInput(p,10000)),cmd('fixed:prepare',chargeInput(p,10000))])
  const race=await Promise.all(finals.map(row=>post('/api/gauge/command',{key:randomUUID(),action:'fixed:approve',...row},owner)))
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409],'INVOICE-002 competing final progress approvals reserve the balance once')
  const final=await race.find(r=>r.status===200).json()
  assert.equal((await record(final.id)).value.amountMinor,p.total/2)
  const ms=await cmd('save:milestones',{engagementId:p.engagement.id,name:'Cannot bill again as a milestone',due:'2026-11-01',amountMinor:1})
  await cmd('milestone:approve',ms,owner,400)
 }
 // Combined project cash and credits reconcile once, with receipts allocated to net line balances.
 await cmd('payment:record',{...combined,date:'2026-10-22',amountMinor:449900,reference:'MAPLE-COMBINED-HALF'})
 const paid=await(await request('/api/gauge/state?from=2026-10-01&to=2026-11-30&asOf=2026-10-23',owner)).json()
 const combinedItems=paid.cash.engagements.filter(e=>projects.some(p=>p.engagement.id===e.engagementId)).flatMap(e=>e.items.filter(i=>i.invoiceId===combined.id))
 assert.equal(combinedItems.reduce((n,i)=>n+i.amountMinor,0),900000)
 assert.equal(combinedItems.reduce((n,i)=>n+i.creditedMinor,0),200)
 assert.equal(combinedItems.reduce((n,i)=>n+i.paidMinor,0),449900)
 assert.equal(combinedItems.reduce((n,i)=>n+i.openMinor,0),449900)
 assert.deepEqual(paid.margin.filter(m=>projects.some(p=>p.engagement.id===m.engagementId)).map(m=>m.billedMinor),[499900,999900])
 // Two simultaneous approvals prepared at the same cumulative baseline cannot both reserve it.
 const p=projects[0],revision=await record(progress[0].charge.id)
 await cmd('fixed:approve',revision,owner,409)
 // Multiple fixed phases share a single project invoice and retain separate remaining budgets.
 const phased=await cmd('save:engagements',{name:'Maple phased delivery',clientId:client.id,leadId:worker.id,members:[worker.id],scope:'Two fixed phases',timezone:zone})
 const phaseTerms=await cmd('budget:approve',await cmd('save:budgets',{engagementId:phased.id,mode:'fixed',amountMinor:300003,effortSeconds:7200,roundingSeconds:60,reason:'Two approved phases',phases:[{key:'discovery',name:'Discovery',service:'Research',mode:'fixed',feeBudgetMinor:100001,hourBudgetSeconds:3600},{key:'build',name:'Build',service:'Delivery',mode:'fixed',feeBudgetMinor:200002,hourBudgetSeconds:3600}]}))
 const phaseCharges=[]
 for(const phaseKey of ['discovery','build'])phaseCharges.push(await cmd('fixed:approve',await cmd('fixed:prepare',{engagementId:phased.id,budgetId:phaseTerms.id,budgetRevision:phaseTerms.revision,phaseKey,chargeType:'deposit',cumulativeBasisPoints:2000,name:phaseKey+' deposit',date:'2026-10-15',reason:'Phase billing agreement'})))
 const phasePacket=await cmd('packet:approve',await cmd('packet:create',{engagementId:phased.id,title:'Combined phases',sources:phaseCharges.map(c=>`fixedCharges:${c.id}`)}))
 const phaseInvoice=await cmd('invoice:issue',{...phasePacket,issueDate:'2026-10-20',dueDate:'2026-11-19',billTo:'Maple Design AP',remitTo:'Agency account',reference:'MAPLE-PHASES'})
 await cmd('payment:record',{...phaseInvoice,date:'2026-10-22',amountMinor:30000,reference:'MAPLE-PHASE-HALF'})
 const phaseState=await(await request('/api/gauge/state?from=2026-10-01&to=2026-11-30&asOf=2026-10-23',owner)).json()
 const phaseLines=phaseState.data.invoices.find(i=>i.id===phaseInvoice.id).value.lines
 assert.deepEqual(phaseLines.map(l=>[l.phaseKey,l.amountMinor,l.remainingMinor]),[['discovery',20000,80001],['build',40000,160002]])
 assert.deepEqual(phaseState.phaseMargins.filter(m=>m.engagementId===phased.id).map(m=>[m.phase.key,m.billedMinor,m.paidCashMinor]),[['discovery',20000,10000],['build',40000,20000]])
 // Partial time reserves exact ranges of frozen billing seconds, never the original twice.
 const hourly=await cmd('save:engagements',{name:'Maple partial hourly',clientId:client.id,leadId:worker.id,members:[worker.id],scope:'Partial time invoices',timezone:zone})
 await cmd('save:rates',{engagementId:hourly.id,service:'*',effective:'2026-01-01',billMinor:10001})
 const hourlyTerms=await cmd('budget:approve',await cmd('save:budgets',{engagementId:hourly.id,mode:'hourly',amountMinor:100000,effortSeconds:7200,roundingSeconds:60,reason:'Hourly agreement'}))
 const task=await cmd('save:tasks',{engagementId:hourly.id,name:'Partial support',remainingSeconds:0})
 const partialBaseline=await(await request('/api/gauge/state?from=2026-10-01&to=2026-11-30&asOf=2026-10-23',owner)).json()
 const partialBaselineKnown=partialBaseline.revenueDashboard.wip.find(w=>w.currency==='USD').knownMinor
 const time=await cmd('time:approve',await cmd('time:submit',await cmd('time:save',{engagementId:hourly.id,personId:worker.id,taskId:task.id,service:'Support',billable:true,notes:'One approved hour billed in thirds',timezone:zone,start:'2026-10-12T09:00:00-04:00',end:'2026-10-12T10:00:00-04:00'})))
 const partialInput={engagementId:hourly.id,budgetId:hourlyTerms.id,budgetRevision:hourlyTerms.revision,sourceId:time.id,sourceRevision:time.revision,title:'Partial third',durationSeconds:1200}
 const cancelled=await cmd('packet:partial',partialInput);await cmd('packet:cancel',cancelled)
 await cmd('packet:partial',{...partialInput,sourceRevision:'stale'},owner,409)
 const simultaneous=await Promise.all([1,2].map(()=>post('/api/gauge/command',{...partialInput,durationSeconds:3600,key:randomUUID(),action:'packet:partial'},owner)))
 assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409],'Concurrent portions cannot reserve the same billing seconds')
 await cmd('packet:cancel',await simultaneous.find(r=>r.status===200).json())
 const gapFirst=await cmd('packet:partial',partialInput),gapSecond=await cmd('packet:partial',partialInput)
 await cmd('packet:cancel',gapFirst)
 const gapReused=await cmd('packet:partial',partialInput)
 assert.equal((await state()).data.packets.find(p=>p.id===gapReused.id).value.lines[0].offsetSeconds,0,'Cancelled holes are reused without overlapping the still-reserved middle')
 await cmd('packet:cancel',gapReused);await cmd('packet:cancel',gapSecond)
 const partials=[]
 for(let n=0;n<3;n++){
  let draft
  if(n===0){
   const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
   try{
    const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
    await context.addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
    await page.goto(h.origin+'/app/billing')
    const form=page.locator(`#partial-time [name=sourceId][value="${time.id}"]`).locator('xpath=ancestor::form')
    await form.getByLabel('Hours to bill',{exact:true}).fill('0.3333333333')
    await form.getByLabel('Packet title',{exact:true}).fill('Partial third from Billing')
    for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await form.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(process.env.GAUGE_PROGRESS_SHOTS)await form.screenshot({path:`${process.env.GAUGE_PROGRESS_SHOTS}/partial-time-${width}.png`})}
    await form.getByRole('button',{name:'Draft partial time',exact:true}).click();await page.waitForURL('**/app/billing?saved=1')
    draft=(await state()).data.packets.find(p=>p.value.title==='Partial third from Billing')
   }finally{await browser.close()}
  }else draft=await cmd('packet:partial',partialInput)
  const packet=await cmd('packet:approve',draft);partials.push(packet)
  await cmd('packet:create',{engagementId:hourly.id,title:'Full time would double bill',sources:[`time:${time.id}`]},owner,409)
  await cmd('time:correct',{...time,reason:'Refused while a portion is reserved'},owner,409)
  await cmd('invoice:issue',{...packet,issueDate:'2026-10-20',dueDate:'2026-11-19',billTo:'Maple Design AP',remitTo:'Agency account',reference:'MAPLE-PART-'+n})
 }
 await cmd('packet:partial',partialInput,owner,409)
 const partialState=await(await request('/api/gauge/state?from=2026-10-01&to=2026-11-30&asOf=2026-10-23',owner)).json()
 const partialDocs=partialState.data.invoices.filter(i=>i.value.engagementId===hourly.id)
 assert.deepEqual(partialDocs.map(i=>[i.value.lines[0].offsetSeconds,i.value.totalMinor]),[[0,3334],[1200,3333],[2400,3334]])
 assert.equal(partialDocs.reduce((n,i)=>n+i.value.totalMinor,0),10001)
 assert.equal(partialState.revenueDashboard.wip.find(w=>w.currency==='USD').knownMinor,partialBaselineKnown,'Issued portions remove exactly the original time value from WIP')
 assert.equal(partialState.cash.engagements.find(e=>e.engagementId===hourly.id).items.filter(i=>!i.issued).reduce((n,i)=>n+i.amountMinor,0),0)
 const person=await h.invite('progress-lead');await cmd('grant',{operatorId:person.id,personId:worker.id,role:'lead',enabled:true})
 await cmd('fixed:prepare',chargeInput(p,10000),person.cookie,403)
 await cmd('packet:partial',partialInput,person.cookie,403)
 const hidden=await state(person.cookie);assert.deepEqual(hidden.data.fixedCharges,[]);for(const kind of ['invoices','packets','timeSlices'])assert.deepEqual(hidden.data[kind],[])
 assert.equal((await request(`/api/gauge/history/fixedCharges/${revision.id}`,person.cookie)).status,403)
 const history=await(await request(`/api/gauge/history/fixedCharges/${revision.id}`,owner)).json();assert(history.history.some(r=>r.action==='fixed:approve'&&r.value.status==='draft'))
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
  await context.addCookies(owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  // Native forms on a third real project prove preparation and approval, then page end states at both widths.
  const third=await cmd('save:engagements',{name:'Maple research phase',clientId:client.id,leadId:worker.id,members:[],scope:'Research deposit',timezone:zone})
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:third.id,mode:'fixed',amountMinor:123455,effortSeconds:7200,roundingSeconds:60,reason:'Research terms'}))
  await page.goto(h.origin+'/app/billing')
  const form=page.locator('form').filter({has:page.locator(`[name=engagementId][value="${third.id}"]`)}).filter({has:page.locator('[name=action][value="fixed:prepare"]')})
  await form.getByLabel('Charge name',{exact:true}).fill('Research kickoff deposit')
  await form.getByRole('combobox',{name:'Charge type',exact:true}).selectOption('deposit')
  await form.getByLabel('Cumulative percentage (for example 20 or 50)',{exact:true}).fill('20')
  await form.getByLabel('Scheduled invoice date',{exact:true}).fill('2026-10-21')
  await form.getByLabel('Charge reason',{exact:true}).fill('Research kickoff on signed terms')
  await form.getByRole('button',{name:'Prepare charge',exact:true}).click();await page.waitForURL('**/app/billing?saved=1')
  d=await state();const created=d.data.fixedCharges.find(c=>c.value.engagementId===third.id)
  assert.equal(created.value.amountMinor,24691,'INVOICE-002 percentage target rounds half up to exact cents')
  await page.locator(`#fixed-${created.id}`).getByRole('button',{name:'Approve fixed charge',exact:true}).click();await page.waitForURL('**/app/billing?saved=1')
  assert.equal((await record(created.id)).value.status,'approved')
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.locator('#fixed-charges').scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`INVOICE-002 Billing fits ${width}`)
   if(process.env.GAUGE_PROGRESS_SHOTS){await mkdir(process.env.GAUGE_PROGRESS_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.GAUGE_PROGRESS_SHOTS}/billing-${width}.png`,fullPage:true});await page.locator('#fixed-charges').screenshot({path:`${process.env.GAUGE_PROGRESS_SHOTS}/charges-${width}.png`})}
  }
 }finally{await browser.close()}
 console.log('PASS INVOICE-002 / INVOICE-010 / INVOICE-011 progressJourney: two paid deposits, combined net progress, project and phase balances, partial time rounding and races, immutable sources, cash, finance scope and native 1440 and 390 forms')
}

if(import.meta.url===new URL(process.argv[1],'file:').href){
 const h=await harness({currency:'USD',timezone:'America/New_York'})
 try{const worker=await h.cmd('save:people',{name:'Morgan Wells',timezone:'America/New_York'});await progressJourney(h,worker)}finally{await h.dispose()}
}
