import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'
import { rateScenarioJourney } from './gauge-project-scenario-rates.mjs'
import { scopeScenarioJourney } from './gauge-project-scenario-scope.mjs'
import { pricingScenarioJourney } from './gauge-project-scenario-pricing.mjs'
import { deadlineScenarioJourney } from './gauge-project-scenario-deadlines.mjs'

// FINANCE-003 staffing slice: real built HTTP doors, two projects, independent arithmetic,
// exact selected human approval, stale baseline refusal and preserved historical bookings.
const h=await harness({currency:'USD',timezone:'UTC'})
let browser
try {
 const {cmd,request,post,owner}=h,asOf=new Date().toISOString().slice(0,10),day=n=>new Date(Date.parse(asOf)+n*86400000).toISOString().slice(0,10)
 const read=async(cookie=owner)=>{const r=await request(`/api/gauge/state?from=${day(-1)}&to=${day(3)}&asOf=${asOf}`,cookie);assert.equal(r.status,200);return r.json()}
 const employee=await cmd('save:people',{name:'Employee',timezone:'UTC'})
 const contractor=await cmd('save:people',{name:'Contractor',timezone:'UTC',employmentType:'contractor'})
 const unknown=await cmd('save:people',{name:'Unpriced contractor',timezone:'UTC',employmentType:'contractor'})
 const client=await cmd('save:clients',{name:'Scenario client'})
 for(const [p,cost,bill] of [[employee,9000,15000],[contractor,6000,18000]]) {
  await cmd('save:rates',{personId:p.id,service:'*',effective:day(-30),costMinor:cost,billMinor:bill})
  await cmd('save:calendars',{personId:p.id,from:day(-1),to:day(3),dailySeconds:(p.id===employee.id?8:4)*3600,weekdays:'0,1,2,3,4,5,6',timezone:'UTC'})
 }
 const projects=[],bookings=[]
 for(const [name,hours] of [['Project Alpha',2],['Project Beta',1]]) {
  const e=await cmd('save:engagements',{name,clientId:client.id,leadId:employee.id,members:[employee.id],scope:'Build',timezone:'UTC'});projects.push(e)
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:e.id,mode:'hourly',amountMinor:1000000,effortSeconds:100*3600,roundingSeconds:60,reason:'Agreed scope'}))
  bookings.push(await cmd('save:staffing',{engagementId:e.id,personId:employee.id,service:'Build',from:day(-1),to:day(3),dailySeconds:hours*3600,commitment:'committed'}))
 }
 const lead=await h.invite('scenario-lead');await cmd('grant',{operatorId:lead.id,personId:employee.id,role:'lead',enabled:true})
 const fin=await h.invite('scenario-finance');await cmd('grant',{operatorId:fin.id,personId:contractor.id,role:'finance',enabled:true})
 const staff=await h.invite('scenario-staff');await cmd('grant',{operatorId:staff.id,personId:employee.id,role:'staff',enabled:true})
 const agent=await h.invite('scenario-agent');await cmd('grant',{operatorId:agent.id,role:'agent',enabled:true,purpose:'staffing',engagementIds:projects.map(project=>project.id)})
 const changes=bookings.map(b=>({...b,personId:contractor.id,effectiveFrom:day(1)})),input={asOf,changes}
 await cmd('projectScenario:preview',{asOf,changes:[]},owner,400)
 await cmd('projectScenario:preview',{asOf,changes:Array.from({length:21},(_,i)=>({...changes[0],id:`excess-${i}`}))},owner,400)
 const liveBefore=(await read()).data
 const preview=await cmd('projectScenario:preview',input,fin.cookie)
 assert.equal(preview.asOf,asOf);assert.equal(preview.from,day(1));assert.equal(preview.to,day(3))
 for(const [i,hours] of [2,1].entries()) {
  const b=preview.baseline.projects.find(p=>p.engagementId===projects[i].id),s=preview.scenario.projects.find(p=>p.engagementId===projects[i].id)
  assert.equal(b.etcCostMinor,3*hours*9000);assert.equal(b.eacFeesMinor,3*hours*15000)
  assert.equal(s.etcCostMinor,3*hours*6000);assert.equal(s.eacFeesMinor,3*hours*18000)
  assert.equal(s.marginMinor,3*hours*(18000-6000))
  assert.deepEqual(preview.deltas.find(p=>p.engagementId===projects[i].id),{engagementId:projects[i].id,currency:'USD',etcCostMinor:-3*hours*3000,eacCostMinor:-3*hours*3000,eacFeesMinor:3*hours*3000,marginMinor:3*hours*6000})
 }
 assert.equal(preview.baseline.capacity.find(p=>p.personId===employee.id).committedSeconds,9*3600)
 const candidateCapacity=preview.scenario.capacity.find(p=>p.personId===contractor.id)
 assert.equal(candidateCapacity.availableSeconds,12*3600);assert.equal(candidateCapacity.committedSeconds,9*3600);assert.equal(candidateCapacity.utilizationPercent,75)
 const expectedCash=x=>x.cash.months.reduce((n,m)=>n+m.expectedMinor,0)
 assert.equal(expectedCash(preview.baseline),9*15000);assert.equal(expectedCash(preview.scenario),9*18000)
 assert(preview.scenario.cash.engagements.every(e=>e.termsLabel==='Net 30 assumed'))
 assert.equal(preview.scenario.cash.pendingCash,'No payments recorded')
 const prepared=await cmd('projectScenario:prepare',{...input,fingerprint:preview.fingerprint,name:'Replace on two projects',reason:'Compare contractor staffing'},fin.cookie)
 let data=await read()
 for(const k of ['staffing','engagements','rates','budgets','time'])assert.deepEqual(data.data[k],liveBefore[k],`FINANCE-003 preview/prepare leaves ${k} baseline unchanged`)
 const stored=data.data.projectScenarios.find(p=>p.id===prepared.id)
 assert.equal(stored.value.status,'prepared');assert.deepEqual(stored.value.baseline,preview.baseline)
 for(const cookie of [lead.cookie,staff.cookie,agent.cookie]) {
  await cmd('projectScenario:preview',input,cookie,403)
  await cmd('projectScenario:prepare',{...input,fingerprint:preview.fingerprint,name:'Forbidden',reason:'Forbidden'},cookie,403)
  await cmd('projectScenario:adopt',{...prepared,selectedIds:[bookings[0].id],fingerprint:preview.fingerprint,reason:'Forbidden'},cookie,403)
  assert.equal((await read(cookie)).data.projectScenarios.length,0)
  assert.equal((await request(`/api/gauge/history/projectScenarios/${prepared.id}`,cookie)).status,403)
 }
 // Malformed, missing, duplicate and past selections are refused without a write.
 for(const selectedIds of [[],[bookings[0].id,bookings[0].id],['not-a-prepared-booking']])await cmd('projectScenario:preview',{...prepared,asOf,selectedIds},owner,400)
 await cmd('projectScenario:preview',{asOf,changes:[{...changes[0],effectiveFrom:asOf}]},owner,409)
 await cmd('projectScenario:preview',{asOf,changes:[changes[0],changes[0]]},owner,400)
 await cmd('projectScenario:preview',{asOf,changes:[{...changes[0],revision:'stale'}]},owner,409)
 const unpriced=await cmd('projectScenario:preview',{asOf,changes:[{...changes[0],personId:unknown.id}]})
 assert.equal(unpriced.scenario.projects[0].complete,false);assert.equal(unpriced.scenario.projects[0].marginMinor,null)
 assert.equal(unpriced.deltas[0].eacCostMinor,null);assert(unpriced.scenario.projects[0].unpriced.length>0)
 assert.equal(unpriced.scenario.capacity.find(p=>p.personId===unknown.id).availableSeconds,null)
 // Approve only Alpha, with a comparison recomputed for that explicit subset.
 const selection={...prepared,asOf,selectedIds:[bookings[0].id]}
 const selected=await cmd('projectScenario:preview',selection)
 assert.equal(selected.scenario.projects.length,1);assert.equal(expectedCash(selected.scenario),6*18000)
 await cmd('projectScenario:adopt',{...selection,fingerprint:preview.fingerprint,reason:'Wrong full-scenario token'},owner,409)
 const adoption={...selection,key:randomUUID(),fingerprint:selected.fingerprint,reason:'Approve Alpha only'}
 const [first,second]=await Promise.all([post('/api/gauge/command',{action:'projectScenario:adopt',...adoption},owner),post('/api/gauge/command',{action:'projectScenario:adopt',...adoption},owner)])
 assert.equal(first.status,200);assert.equal(second.status,200)
 assert.deepEqual(await first.json(),await second.json(),'Concurrent same request keys return one acknowledgement')
 await cmd('projectScenario:adopt',{...adoption,key:randomUUID()},owner,409)
 data=await read()
 assert.equal(data.data.staffing.length,3,'One historical split and one future replacement, exactly once')
 assert.deepEqual(data.data.staffing.find(r=>r.id===bookings[1].id),liveBefore.staffing.find(r=>r.id===bookings[1].id),'Unselected Beta is unchanged')
 const past=data.data.staffing.find(r=>r.id===bookings[0].id),future=data.data.staffing.find(r=>r.id!==bookings[0].id&&r.value.engagementId===projects[0].id)
 assert.equal(past.value.from,day(-1));assert.equal(past.value.to,asOf);assert.equal(past.value.personId,employee.id)
 assert.equal(future.value.from,day(1));assert.equal(future.value.to,day(3));assert.equal(future.value.personId,contractor.id);assert.equal(future.value.commitment,'committed');assert.equal(future.value.dailySeconds,7200);assert.equal(future.value.service,'Build')
 assert(data.data.engagements.find(r=>r.id===projects[0].id).value.members.includes(contractor.id))
 assert(!data.data.engagements.find(r=>r.id===projects[1].id).value.members.includes(contractor.id))
 const adopted=data.data.projectScenarios.find(r=>r.id===prepared.id)
 assert.equal(adopted.value.status,'adopted');assert.deepEqual(adopted.value.selectedIds,[bookings[0].id]);assert.equal(adopted.value.adoptionReason,'Approve Alpha only')
 assert.equal(adopted.value.adoptedBy,(await(await request('/auth/session',owner)).json()).operator.id)
 const history=await(await request(`/api/gauge/history/projectScenarios/${prepared.id}`,owner)).json()
 assert.equal(history.history.length,1);assert.equal(history.history[0].value.status,'prepared');assert.equal(history.history[0].action,'projectScenario:adopt')
 assert.deepEqual(adopted.value.approvedComparison.scenario,selected.scenario)
 assert.equal(data.forecast.engagements.find(p=>p.engagementId===projects[0].id).eacFeesMinor,selected.scenario.projects[0].eacFeesMinor)
 // Any new baseline source invalidates the prior approval, including an inserted competing booking.
 const nextInput={asOf,changes:[changes[1]]},nextPreview=await cmd('projectScenario:preview',nextInput)
 const stale=await cmd('projectScenario:prepare',{...nextInput,fingerprint:nextPreview.fingerprint,name:'Stale scenario',reason:'Review current basis'})
 const staleSelection={...stale,asOf,selectedIds:[bookings[1].id]},staleReview=await cmd('projectScenario:preview',staleSelection)
 await cmd('save:staffing',{engagementId:projects[0].id,personId:contractor.id,service:'Other',from:day(2),to:day(2),dailySeconds:3600,commitment:'tentative'})
 await cmd('projectScenario:adopt',{...staleSelection,fingerprint:staleReview.fingerprint,reason:'Outdated'},owner,409)
 assert.equal((await read()).data.projectScenarios.find(p=>p.id===stale.id).value.status,'prepared')
 // Browser proof of resulting staffing through the existing capacity screen; no new UI was added.
 browser=await chromium.launch({headless:true,...(process.env.GAUGE_CHROMIUM_PATH?{executablePath:process.env.GAUGE_CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});await page.goto(`${h.origin}/app/capacity?from=${day(1)}&to=${day(3)}`)
  assert.match(await page.locator('main').innerText(),/Contractor/)
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Capacity fits ${width}`)
  if(process.env.GAUGE_SCENARIO_SHOTS){await mkdir(process.env.GAUGE_SCENARIO_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.GAUGE_SCENARIO_SHOTS}/capacity-${width}.png`,fullPage:true})}
 }
 await rateScenarioJourney(h,browser)
 await deadlineScenarioJourney(h,browser)
 await scopeScenarioJourney(h,browser)
 await pricingScenarioJourney(h,browser)
 console.log('PASS FINANCE-003 isolated two-project contractor comparison, exact cost/margin/cash/utilization, named selected future adoption, history, replay and stale/access refusals; capacity browser 1440/390')
} finally {await browser?.close();await h.dispose()}
