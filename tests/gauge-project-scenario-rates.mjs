import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'

// FINANCE-003 / FINANCE-011 / FINANCE-012 / FINANCE-013 / FINANCE-014: future rate alternatives share the native RATE-002 / RATE-003 door and
// FINANCE-006 / FINANCE-018 / FINANCE-019/002 pricing. Frozen actuals and unselected cards remain unchanged.
export async function rateScenarioJourney(h,browser) {
 const {cmd,request,post,owner} = h, asOf = new Date().toISOString().slice(0,10)
 const day = n => new Date(Date.parse(asOf)+n*86400000).toISOString().slice(0,10)
 const next = new Date(`${asOf.slice(0,7)}-01T00:00:00Z`); next.setUTCMonth(next.getUTCMonth()+1)
 const effective = next.toISOString().slice(0,10), from = new Date(+next+86400000).toISOString().slice(0,10), to = new Date(+next+2*86400000).toISOString().slice(0,10)
 const read = async(cookie=owner) => {const r=await request(`/api/gauge/state?from=${day(-2)}&to=${to}&asOf=${asOf}`,cookie);assert.equal(r.status,200);return r.json()}
 const person = await cmd('save:people',{name:'Jordan Chen',timezone:'UTC',role:'Engineer'})
 const client = await cmd('save:clients',{name:'Northstar Studio',paymentTermsDays:30,collectionPercent:80,daysLate:10})
 const oldRate = await cmd('save:rates',{personId:person.id,service:'*',effective:day(-30),costMinor:9000,billMinor:15000})
 await cmd('save:calendars',{personId:person.id,from:effective,to,dailySeconds:8*3600,weekdays:'0,1,2,3,4,5,6',timezone:'UTC'})
 const projects=[]
 for(const [name,hours] of [['Northstar website',2],['Northstar campaign',1]]) {
  const e=await cmd('save:engagements',{name,clientId:client.id,leadId:person.id,members:[person.id],scope:'Agreed engineering work',timezone:'UTC'});projects.push(e)
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:e.id,mode:'hourly',amountMinor:1000000,effortSeconds:100*3600,roundingSeconds:60,reason:'Approved scope'}))
  await cmd('save:staffing',{engagementId:e.id,personId:person.id,service:'Build',from,to,dailySeconds:hours*3600,commitment:'committed'})
 }
 const task=await cmd('save:tasks',{engagementId:projects[0].id,name:'Engineering review',remainingSeconds:3600})
 const saved=await cmd('time:save',{personId:person.id,engagementId:projects[0].id,taskId:task.id,service:'Build',timezone:'UTC',billable:true,start:`${day(-1)}T09:00:00Z`,end:`${day(-1)}T11:00:00Z`})
 await cmd('time:approve',await cmd('time:submit',saved))
 const before=(await read()).data, frozen=before.time.find(t=>t.id===saved.id)
 const rateChange={type:'rate',id:'jordan-future-rate',card:{personId:person.id,service:'*',effective,costMinor:12000,billMinor:20000}}
 const projectChange={type:'rate',id:'campaign-special-rate',card:{engagementId:projects[1].id,service:'Build',effective,billMinor:22000}}
 const input={asOf,changes:[rateChange,projectChange]}, preview=await cmd('projectScenario:preview',input)
 for(const [index,hours] of [2,1].entries()) {
  const baseline=preview.baseline.projects.find(p=>p.engagementId===projects[index].id), scenario=preview.scenario.projects.find(p=>p.engagementId===projects[index].id)
  assert.equal(baseline.etcCostMinor,2*hours*9000);assert.equal(scenario.etcCostMinor,2*hours*12000)
  assert.equal(baseline.eacFeesMinor,2*hours*15000+(index?0:30000))
  assert.equal(scenario.eacFeesMinor,2*hours*(index?22000:20000)+(index?0:30000))
  assert.equal(scenario.actualFeesMinor,baseline.actualFeesMinor);assert.equal(scenario.actualCostMinor,baseline.actualCostMinor)
 }
 assert.deepEqual(preview.baseline.capacity,preview.scenario.capacity,'FINANCE-003 a rate changes no dated capacity or utilization')
 assert.deepEqual(preview.baseline.dates,preview.scenario.dates,'FINANCE-003 rates change no project dates')
 const newFees=preview.scenario.cash.engagements.flatMap(e=>e.items).reduce((n,i)=>n+i.amountMinor,0)
 assert.equal(newFees,30000+4*20000+2*22000)
 const expectedCash=preview.scenario.cash.engagements.flatMap(e=>e.items).reduce((n,i)=>n+i.expectedMinor,0)
 assert.equal(expectedCash,newFees*0.8)
 for(const e of preview.scenario.cash.engagements)for(const item of e.items) {
  const due=new Date(Date.parse(item.invoiceDate)+30*86400000).toISOString().slice(0,10)
  assert.equal(item.receiptDate,due);assert.equal(item.historicalDate,new Date(Date.parse(due)+10*86400000).toISOString().slice(0,10))
 }
 const prepared=await cmd('projectScenario:prepare',{...input,fingerprint:preview.fingerprint,name:'Review engineering rates',reason:'Future contract pricing'})
 for(const kind of ['staffing','budgets','rates','time','deliveryPlans'])assert.deepEqual((await read()).data[kind],before[kind],`FINANCE-003 isolated rate preparation keeps ${kind}`)
 const selection={...prepared,asOf,selectedIds:[rateChange.id]},selected=await cmd('projectScenario:preview',selection)
 assert.equal(selected.scenario.projects.find(p=>p.engagementId===projects[1].id).etcFeesMinor,2*20000)
 assert.equal(selected.deltas.find(p=>p.engagementId===projects[0].id).marginMinor,4*(5000-3000))
 const approval={...selection,key:randomUUID(),fingerprint:selected.fingerprint,reason:'Approve Jordan future rates only'}
 const ack=await cmd('projectScenario:adopt',approval)
 assert.deepEqual(await cmd('projectScenario:adopt',approval),ack)
 await cmd('projectScenario:adopt',{...approval,key:randomUUID()},owner,409)
 const after=await read(), card=after.data.rates.find(r=>r.id!==oldRate.id&&r.value.personId===person.id&&r.value.effective===effective)
 assert(card);assert.equal(card.value.billMinor,20000);assert.equal(card.value.costMinor,12000)
 assert(!after.data.rates.some(r=>r.value.engagementId===projects[1].id),'FINANCE-003 unselected project card was never created')
 assert.deepEqual(after.data.time.find(t=>t.id===saved.id),frozen,'FINANCE-003 approved duration, frozen actual prices and approval unchanged')
 assert.deepEqual(after.data.rates.find(r=>r.id===oldRate.id),before.rates.find(r=>r.id===oldRate.id),'Prior rate version remains immutable')
 for(const project of projects) {
  const actual=after.forecast.engagements.find(p=>p.engagementId===project.id),predicted=selected.scenario.projects.find(p=>p.engagementId===project.id)
  assert.equal(actual.eacFeesMinor,predicted.eacFeesMinor);assert.equal(actual.eacCostMinor,predicted.eacCostMinor);assert.equal(actual.marginMinor,predicted.marginMinor)
 }
 const adopted=after.data.projectScenarios.find(p=>p.id===prepared.id)
 assert.equal(adopted.value.status,'adopted');assert.equal(adopted.value.adoptionReason,approval.reason)
 assert.equal(adopted.value.adoptedBy,(await(await request('/auth/session',owner)).json()).operator.id)
 assert.deepEqual(adopted.value.approvedComparison.scenario,selected.scenario)
 // Native duplicate scopes, invalid retrospective pricing and stale inserts refuse.
 await cmd('projectScenario:preview',{asOf,changes:[rateChange]},owner,409)
 await cmd('projectScenario:preview',{asOf,changes:[{...rateChange,card:{...rateChange.card,effective:asOf}}]},owner,409)
 await cmd('projectScenario:preview',{asOf,changes:[{...rateChange,card:{...rateChange.card,effective:day(60),currency:'CAD'}}]},owner,400)
 const later={...rateChange,id:'later-rate',card:{...rateChange.card,effective:new Date(Date.parse(to)+86400000).toISOString().slice(0,10)}}
 await cmd('projectScenario:preview',{asOf,changes:[later]},owner,400)
 const noCostScope={type:'rate',id:'invalid-project-cost',card:{engagementId:projects[0].id,service:'Build',effective:from,billMinor:1,costMinor:1}}
 await cmd('projectScenario:preview',{asOf,changes:[noCostScope]},owner,400)
 const duplicatedScope={...rateChange,id:'second-same-scope',card:{...rateChange.card,effective:from}}
 await cmd('projectScenario:preview',{asOf,changes:[{...duplicatedScope,id:'first-same-scope'},duplicatedScope]},owner,409)
 const nextInput={asOf,changes:[{...rateChange,id:'next-future-rate',card:{...rateChange.card,effective:from}}]}
 const nextPreview=await cmd('projectScenario:preview',nextInput),stale=await cmd('projectScenario:prepare',{...nextInput,fingerprint:nextPreview.fingerprint,name:'Review later rate',reason:'Next review'})
 const staleSelection={...stale,asOf,selectedIds:['next-future-rate']},stalePreview=await cmd('projectScenario:preview',staleSelection)
 await cmd('save:rates',{personId:person.id,service:'Build',effective:day(-20),costMinor:9000,billMinor:15000})
 await cmd('projectScenario:adopt',{...staleSelection,fingerprint:stalePreview.fingerprint,reason:'Stale rate review'},owner,409)
 assert.equal((await read()).data.projectScenarios.find(p=>p.id===stale.id).value.status,'prepared')
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 try {
  await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000});await page.goto(`${h.origin}/app/rates`)
   assert.match(await page.locator('main').innerText(),/Jordan Chen/)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Rates fit ${width}`)
   if(process.env.GAUGE_SCENARIO_SHOTS){await mkdir(process.env.GAUGE_SCENARIO_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.GAUGE_SCENARIO_SHOTS}/rates-adopted-${width}.png`,fullPage:true})}
  }
 } finally {await context.close()}
 console.log('PASS FINANCE-003 / FINANCE-011 / FINANCE-012 / FINANCE-013 / FINANCE-014 rate alternatives: independent two-project ETC/EAC/margin/cash, isolated baseline, selected immutable future card, frozen actuals and native date/scope/stale refusals; rates 1440/390')
}
