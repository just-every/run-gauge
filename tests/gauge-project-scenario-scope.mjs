import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'

// FINANCE-003 scope: explicit future effort and native replacement terms, not a
// percentage adjustment hiding unchanged staffing. Through built HTTP doors.
export async function scopeScenarioJourney(h,browser) {
 const {cmd,request,owner}=h,asOf=new Date().toISOString().slice(0,10)
 const day=n=>new Date(Date.parse(asOf)+n*86400000).toISOString().slice(0,10)
 const read=async()=>{const r=await request(`/api/gauge/state?from=${day(-1)}&to=${day(4)}&asOf=${asOf}`,owner);assert.equal(r.status,200);return r.json()}
 const person=await cmd('save:people',{name:'Morgan Rivera',timezone:'UTC'})
 const client=await cmd('save:clients',{name:'Acorn scope review',paymentTermsDays:15,collectionPercent:75})
 await cmd('save:rates',{personId:person.id,service:'*',effective:day(-30),billMinor:12000,costMinor:6000})
 await cmd('save:calendars',{personId:person.id,from:day(-1),to:day(4),dailySeconds:8*3600,weekdays:'0,1,2,3,4,5,6',timezone:'UTC'})
 const projects=[],bookings=[],tasks=[],budgets=[]
 for(const name of ['Acorn discovery','Acorn launch']) {
  const e=await cmd('save:engagements',{name,clientId:client.id,leadId:person.id,members:[person.id],scope:'Full discovery and delivery',timezone:'UTC'});projects.push(e)
  budgets.push(await cmd('budget:approve',await cmd('save:budgets',{engagementId:e.id,mode:'hourly',amountMinor:200000,effortSeconds:20*3600,roundingSeconds:60,reason:'Original scope'})))
  bookings.push(await cmd('save:staffing',{engagementId:e.id,personId:person.id,service:'Design',from:day(-1),to:day(3),dailySeconds:2*3600,commitment:'committed'}))
  tasks.push(await cmd('save:tasks',{engagementId:e.id,name:'Future discovery',remainingSeconds:6*3600,from:day(1),to:day(3)}))
 }
 const before=(await read()).data
 const changes=projects.map((e,i)=>({type:'scope',...e,scope:'Focused discovery',allocations:[{...bookings[i],effectiveFrom:day(1),dailySeconds:3600}],tasks:[{...tasks[i],remainingSeconds:3*3600}],terms:{mode:'hourly',amountMinor:100000,effortSeconds:3*3600,roundingSeconds:60,expenseBudgetMinor:3000,expenseDate:day(3),reason:'Focused delivery and travel'}}))
 const input={asOf,changes},preview=await cmd('projectScenario:preview',input)
 for(const e of projects) {
  const b=preview.baseline.projects.find(p=>p.engagementId===e.id),s=preview.scenario.projects.find(p=>p.engagementId===e.id)
  assert.equal(b.etcCostMinor,6*6000);assert.equal(s.etcCostMinor,3*6000)
  assert.equal(b.eacFeesMinor,6*12000);assert.equal(s.eacFeesMinor,3*12000+3000)
  assert.equal(s.eacCostMinor,3*6000+3000);assert.equal(s.marginMinor,3*6000)
  const delta=preview.deltas.find(p=>p.engagementId===e.id)
  assert.equal(delta.eacFeesMinor,-33000);assert.equal(delta.eacCostMinor,-15000);assert.equal(delta.marginMinor,-18000)
 }
 assert.equal(preview.baseline.capacity[0].committedSeconds,12*3600);assert.equal(preview.scenario.capacity[0].committedSeconds,6*3600)
 assert.equal(preview.scenario.capacity[0].utilizationPercent,25)
 assert.equal(preview.scenario.cash.months.reduce((n,m)=>n+m.expectedMinor,0),2*39000*.75)
 assert.deepEqual(preview.baseline.dates.map(p=>p.tasks),preview.scenario.dates.map(p=>p.tasks),'Scope effort does not silently move task dates')
 const prepared=await cmd('projectScenario:prepare',{...input,fingerprint:preview.fingerprint,name:'Acorn focused scope',reason:'Compare smaller delivery'})
 for(const kind of ['engagements','budgets','tasks','staffing','rates','time'])assert.deepEqual((await read()).data[kind],before[kind],`FINANCE-003 scope preparation isolates ${kind}`)
 // Per-source validation and already approved commitments remain native rules.
 for(const invalid of [
  {...changes[0],revision:'old'},
  {...changes[0],allocations:[{...changes[0].allocations[0],effectiveFrom:asOf}]},
  {...changes[0],allocations:[{...changes[0].allocations[0],id:bookings[1].id,revision:bookings[1].revision}]},
  {...changes[0],tasks:[{...changes[0].tasks[0],revision:'old'}]}
 ])await cmd('projectScenario:preview',{asOf,changes:[invalid]},owner,409)
 await cmd('projectScenario:preview',{asOf,changes:[{...changes[0],allocations:[{...changes[0].allocations[0],dailySeconds:-1}]}]},owner,400)
 const selection={...prepared,asOf,selectedIds:[projects[0].id]},selected=await cmd('projectScenario:preview',selection)
 const approval={...selection,key:randomUUID(),fingerprint:selected.fingerprint,reason:'Approve Acorn discovery scope only'}
 const adopted=await cmd('projectScenario:adopt',approval);assert.deepEqual(await cmd('projectScenario:adopt',approval),adopted)
 const after=await read()
 assert.equal(after.data.engagements.find(e=>e.id===projects[0].id).value.scope,'Focused discovery')
 assert.deepEqual(after.data.engagements.find(e=>e.id===projects[1].id),before.engagements.find(e=>e.id===projects[1].id))
 assert.deepEqual(after.data.budgets.find(b=>b.id===budgets[0].id),before.budgets.find(b=>b.id===budgets[0].id),'Prior terms remain intact')
 const terms=after.data.budgets.filter(b=>b.value.engagementId===projects[0].id&&b.id!==budgets[0].id)
 assert.equal(terms.length,1);assert.equal(terms[0].value.status,'approved');assert.equal(terms[0].value.amountMinor,100000)
 assert.equal(after.data.tasks.find(t=>t.id===tasks[0].id).value.remainingSeconds,3*3600)
 assert.deepEqual(after.data.tasks.find(t=>t.id===tasks[1].id),before.tasks.find(t=>t.id===tasks[1].id))
 const historical=after.data.staffing.find(s=>s.id===bookings[0].id),future=after.data.staffing.find(s=>s.value.engagementId===projects[0].id&&s.id!==bookings[0].id)
 assert.equal(historical.value.to,asOf);assert.equal(historical.value.dailySeconds,2*3600)
 assert.equal(future.value.from,day(1));assert.equal(future.value.to,day(3));assert.equal(future.value.dailySeconds,3600)
 assert.deepEqual(after.data.staffing.find(s=>s.id===bookings[1].id),before.staffing.find(s=>s.id===bookings[1].id))
 for(const p of selected.scenario.projects) {
  const actual=after.forecast.engagements.find(e=>e.engagementId===p.engagementId)
  for(const key of ['etcCostMinor','eacCostMinor','eacFeesMinor','marginMinor'])assert.equal(actual[key],p[key],`FINANCE-003 adopted scope ${key}`)
 }
 const record=after.data.projectScenarios.find(s=>s.id===prepared.id)
 assert.deepEqual(record.value.approvedComparison.scenario,selected.scenario);assert.equal(record.value.adoptionReason,approval.reason)
 const history=await(await request(`/api/gauge/history/engagements/${projects[0].id}`,owner)).json()
 assert(history.history.some(r=>r.value.scope==='Full discovery and delivery'))
 // Fixed-fee scope cannot erase approved milestones; extra unscheduled fees are
 // explicitly incomplete instead of invented cash or a false margin.
 const fixed=await cmd('save:engagements',{name:'Acorn fixed scope',clientId:client.id,leadId:person.id,members:[person.id],scope:'Fixed delivery',timezone:'UTC'})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:fixed.id,mode:'fixed',amountMinor:50000,effortSeconds:3600,roundingSeconds:60,reason:'Agreed fixed fee'}))
 await cmd('milestone:approve',await cmd('save:milestones',{engagementId:fixed.id,name:'Delivery',amountMinor:50000,due:day(3)}))
 const fixedChange={type:'scope',...fixed,scope:'Additional delivery',terms:{mode:'fixed',amountMinor:70000,effortSeconds:7200,roundingSeconds:60,reason:'Extra scope'}}
 const incomplete=await cmd('projectScenario:preview',{asOf,changes:[fixedChange]})
 assert.equal(incomplete.scenario.projects[0].complete,false);assert.equal(incomplete.scenario.projects[0].marginMinor,null)
 assert.equal(incomplete.scenario.projects[0].unscheduledMinor,20000);assert.equal(incomplete.scenario.cash.months.reduce((n,m)=>n+m.invoicesMinor,0),50000)
 assert(incomplete.scenario.projects[0].incomplete.some(x=>x.includes('no approved milestone')))
 await cmd('projectScenario:preview',{asOf,changes:[{...fixedChange,terms:{...fixedChange.terms,amountMinor:40000}}]},owner,409)
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 try {
  await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000});await page.goto(`${h.origin}/app/engagements`)
   assert.match(await page.locator('main').innerText(),/Focused discovery/)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Scope fits ${width}`)
   if(process.env.GAUGE_SCENARIO_SHOTS){await mkdir(process.env.GAUGE_SCENARIO_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.GAUGE_SCENARIO_SHOTS}/scope-adopted-${width}.png`,fullPage:true})}
  }
 } finally {await context.close()}
 console.log('PASS FINANCE-003 scope: two-project effort/terms/cost/margin/cash/utilization, isolated baseline, exact selected native adoption, historical and unselected preservation, fixed commitment/incomplete and invalid source checks; 1440/390')
}
