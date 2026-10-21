import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {harness} from './gauge-harness.mjs'

// INVOICE-002: two real fixed projects, paid deposits and cumulative progress,
// exact source reservations, failed competing approvals and separate money/delivery.
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
 let d=await state()
 for(const [index,p]of projects.entries()){
  const docs=d.data.invoices.filter(i=>i.value.engagementId===p.engagement.id)
  assert.deepEqual(docs.map(i=>i.value.totalMinor),[p.total/5,p.total*3/10])
  assert.equal(docs.reduce((n,i)=>n+i.value.totalMinor,0),p.total/2)
  const line=docs[1].value.lines[0];assert.equal(line.priorMinor,p.total/5);assert.equal(line.grossMinor,p.total/2);assert.equal(line.sourceSnapshot.revision,progress[index].charge.revision)
  const csv=await(await request(`/api/gauge/packets/${progress[index].packet.id}`,owner)).text();assert(csv.includes(progress[index].charge.id))
  const cashResponse=await request('/api/gauge/state?from=2026-10-01&to=2026-11-30&asOf=2026-10-21',owner),cash=await cashResponse.json()
  const items=cash.cash.engagements.find(e=>e.engagementId===p.engagement.id).items
  assert.equal(items.filter(i=>i.issued).reduce((n,i)=>n+i.openMinor,0),p.total*3/10)
  assert(!items.some(i=>!i.issued&&i.source.startsWith('fixedCharges:')),'INVOICE-002 issue replaces its schedule once')
  assert.equal(d.data.milestones.filter(m=>m.value.engagementId===p.engagement.id).length,0,'A deposit never invents delivery acceptance')
  await cmd('invoice:credit',{...progress[index].invoice,type:'credit',line:0,amountMinor:100,date:'2026-10-21',reason:'Reviewed fixed fee credit'})
  await cmd('fixed:prepare',chargeInput(p,5000),owner,400)
  const finals=await Promise.all([cmd('fixed:prepare',chargeInput(p,10000)),cmd('fixed:prepare',chargeInput(p,10000))])
  const race=await Promise.all(finals.map(row=>post('/api/gauge/command',{key:randomUUID(),action:'fixed:approve',...row},owner)))
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409],'INVOICE-002 competing final progress approvals reserve the balance once')
  const final=await race.find(r=>r.status===200).json()
  assert.equal((await record(final.id)).value.amountMinor,p.total/2)
  const ms=await cmd('save:milestones',{engagementId:p.engagement.id,name:'Cannot bill again as a milestone',due:'2026-11-01',amountMinor:1})
  await cmd('milestone:approve',ms,owner,400)
 }
 // Two simultaneous approvals prepared at the same cumulative baseline cannot both reserve it.
 const p=projects[0],revision=await record(progress[0].charge.id)
 await cmd('fixed:approve',revision,owner,409)
 const person=await h.invite('progress-lead');await cmd('grant',{operatorId:person.id,personId:worker.id,role:'lead',enabled:true})
 await cmd('fixed:prepare',chargeInput(p,10000),person.cookie,403)
 const hidden=await state(person.cookie);assert.deepEqual(hidden.data.fixedCharges,[])
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
 console.log('PASS INVOICE-002 deposit/progress slice: two paid 20% deposits, 50% cumulative minus deposit, exact immutable sources, no overbilling/replay/stale approval, cash and native 1440/390 forms')
}

if(import.meta.url===new URL(process.argv[1],'file:').href){
 const h=await harness({currency:'USD',timezone:'America/New_York'})
 try{const worker=await h.cmd('save:people',{name:'Morgan Wells',timezone:'America/New_York'});await progressJourney(h,worker)}finally{await h.dispose()}
}
