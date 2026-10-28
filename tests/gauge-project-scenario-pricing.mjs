import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'

// FINANCE-003 / FINANCE-011 / FINANCE-012 / FINANCE-013 / FINANCE-014 write-down/overtime alternatives: integer arithmetic through native
// rate, scenario and forecast doors, including cross-project threshold spillover.
export async function pricingScenarioJourney(h,browser) {
 const {cmd,request,owner}=h,asOf=new Date().toISOString().slice(0,10)
 const day=n=>new Date(Date.parse(asOf)+n*86400000).toISOString().slice(0,10)
 const read=async()=>{const r=await request(`/api/gauge/state?from=${day(-1)}&to=${day(2)}&asOf=${asOf}`,owner);assert.equal(r.status,200);return r.json()}
 const person=await cmd('save:people',{name:'Taylor Brooks',timezone:'UTC'})
 const client=await cmd('save:clients',{name:'Cedar pricing review',paymentTermsDays:20,collectionPercent:80,daysLate:7})
 const original=await cmd('save:rates',{personId:person.id,service:'*',effective:day(-30),billMinor:10000,costMinor:6000})
 await cmd('save:calendars',{personId:person.id,from:day(-1),to:day(2),dailySeconds:8*3600,weekdays:'0,1,2,3,4,5,6',timezone:'UTC'})
 const projects=[]
 for(const name of ['Cedar brand','Cedar launch'])projects.push(await cmd('save:engagements',{name,clientId:client.id,leadId:person.id,members:[person.id],scope:'Creative delivery',timezone:'UTC'}))
 projects.sort((a,b)=>a.id<b.id?-1:1)
 const bookings=[]
 for(const [i,e] of projects.entries()) {
  await cmd('budget:approve',await cmd('save:budgets',{engagementId:e.id,mode:'hourly',amountMinor:1000000,effortSeconds:100*3600,roundingSeconds:60,reason:'Agreed delivery'}))
  bookings.push(await cmd('save:staffing',{engagementId:e.id,personId:person.id,service:'Creative',from:day(1),to:day(2),dailySeconds:(i?3:6)*3600,commitment:'committed'}))
 }
 const tentative=await cmd('save:staffing',{engagementId:projects[0].id,personId:person.id,service:'Creative',from:day(1),to:day(2),dailySeconds:4*3600,commitment:'tentative'})
 const task=await cmd('save:tasks',{engagementId:projects[0].id,name:'Earlier creative work',remainingSeconds:3600})
 const actual=await cmd('time:save',{personId:person.id,engagementId:projects[0].id,taskId:task.id,service:'Creative',timezone:'UTC',billable:true,start:`${day(-1)}T09:00:00Z`,end:`${day(-1)}T10:00:00Z`})
 await cmd('time:approve',await cmd('time:submit',actual))
 const before=(await read()).data
 const baseCard={personId:person.id,service:'*',effective:day(1),billMinor:10000,costMinor:6000}
 const change={type:'rate',id:'cedar-overtime-and-write-down',card:{...baseCard,overtimeAfterSeconds:8*3600,overtimeBps:15000,writeDownBps:1000}}
 const input={asOf,changes:[change]},preview=await cmd('projectScenario:preview',input)
 for(const [i,e] of projects.entries()) {
  const b=preview.baseline.projects.find(p=>p.engagementId===e.id),s=preview.scenario.projects.find(p=>p.engagementId===e.id)
  const actualFee=i?0:10000,expected=2*(i?31500:54000)+actualFee
  assert.equal(b.etcFeesMinor,2*(i?3:6)*10000)
  assert.equal(s.eacFeesMinor,expected,'FINANCE-003 8 ordinary hours across projects, premium on ninth, then 10% write-down')
  assert.equal(s.etcCostMinor,2*(i?3:6)*6000);assert.equal(s.eacCostMinor,b.eacCostMinor,'Billing premium/write-down never changes payroll cost')
  assert.equal(s.marginMinor,s.eacFeesMinor-s.eacCostMinor)
  for(const booking of bookings)assert(s.sources.staffing.includes(booking.id),'FINANCE-003 overtime traces cross-project threshold sources')
  const delta=preview.deltas.find(p=>p.engagementId===e.id)
  assert.equal(delta.etcCostMinor,0);assert.equal(delta.marginMinor,expected-b.eacFeesMinor)
 }
 assert.equal(preview.scenario.projects.find(p=>p.engagementId===projects[0].id).tentativeFeesMinor,2*4*15000*.9,'Tentative starts after all committed work')
 assert.deepEqual(preview.scenario.dates,preview.baseline.dates);assert.deepEqual(preview.scenario.capacity,preview.baseline.capacity)
 assert.equal(preview.scenario.capacity[0].utilizationPercent,112.5)
 assert(preview.scenario.capacity[0].conflicts.length>0,'Over-allocation remains visible')
 const expectedCash=(2*85500+10000)*.8
 assert.equal(preview.scenario.cash.months.reduce((n,m)=>n+m.expectedMinor,0),expectedCash)
 for(const item of preview.scenario.cash.engagements.flatMap(e=>e.items)) {
  assert.equal(item.receiptDate,new Date(Date.parse(item.invoiceDate)+20*86400000).toISOString().slice(0,10))
  assert.equal(item.historicalDate,new Date(Date.parse(item.receiptDate)+7*86400000).toISOString().slice(0,10))
 }
 const writeOnly=await cmd('projectScenario:preview',{asOf,changes:[{type:'rate',id:'write-only',card:{...baseCard,writeDownBps:1000}}]})
 assert.equal(writeOnly.scenario.projects.reduce((n,p)=>n+p.etcFeesMinor,0),2*90000*.9)
 const overtimeOnly=await cmd('projectScenario:preview',{asOf,changes:[{type:'rate',id:'overtime-only',card:{...baseCard,overtimeAfterSeconds:8*3600,overtimeBps:15000}}]})
 assert.equal(overtimeOnly.scenario.projects.reduce((n,p)=>n+p.etcFeesMinor,0),2*95000)
 const rounded=await cmd('projectScenario:preview',{asOf,changes:[{...change,card:{...change.card,billMinor:10001,writeDownBps:3333}}]})
 assert.equal(rounded.scenario.projects.find(p=>p.engagementId===projects[0].id).etcFeesMinor,2*40006,'Half-up write-down after integer ordinary fee')
 assert.equal(rounded.scenario.projects.find(p=>p.engagementId===projects[1].id).etcFeesMinor,2*23337,'Half-up premium rate, then fee segments, then write-down')
 // Every pricing field uses native validation, including boundaries.
 await cmd('projectScenario:preview',{asOf,changes:[{...change,card:{...change.card,writeDownBps:10001}}]},owner,400)
 await cmd('projectScenario:preview',{asOf,changes:[{...change,card:{...baseCard,overtimeBps:15000}}]},owner,400)
 const fullWriteDown=await cmd('projectScenario:preview',{asOf,changes:[{...change,card:{...change.card,writeDownBps:10000}}]})
 assert.equal(fullWriteDown.scenario.projects.reduce((n,p)=>n+p.etcFeesMinor,0),0)
 const prepared=await cmd('projectScenario:prepare',{...input,fingerprint:preview.fingerprint,name:'Cedar prospective billing',reason:'Compare premium and negotiated discount'})
 for(const k of ['rates','time','staffing','budgets'])assert.deepEqual((await read()).data[k],before[k],`FINANCE-003 pricing isolation ${k}`)
 const selection={...prepared,asOf,selectedIds:[change.id]},selected=await cmd('projectScenario:preview',selection)
 const approval={...selection,key:randomUUID(),fingerprint:selected.fingerprint,reason:'Approve Cedar future pricing'}
 const ack=await cmd('projectScenario:adopt',approval);assert.deepEqual(await cmd('projectScenario:adopt',approval),ack)
 const after=await read()
 assert.deepEqual(after.data.time.find(t=>t.id===actual.id),before.time.find(t=>t.id===actual.id),'Frozen actual remains unchanged')
 assert.deepEqual(after.data.rates.find(r=>r.id===original.id),before.rates.find(r=>r.id===original.id))
 const adopted=after.data.rates.find(r=>r.value.personId===person.id&&r.value.effective===day(1))
 assert.equal(adopted.value.overtimeAfterSeconds,8*3600);assert.equal(adopted.value.overtimeBps,15000);assert.equal(adopted.value.writeDownBps,1000)
 for(const p of selected.scenario.projects) {
  const real=after.forecast.engagements.find(x=>x.engagementId===p.engagementId)
  for(const k of ['eacFeesMinor','eacCostMinor','marginMinor','tentativeFeesMinor'])assert.equal(real[k],p[k],`FINANCE-003 adopted native pricing ${k}`)
 }
 assert.deepEqual(after.data.projectScenarios.find(s=>s.id===prepared.id).value.approvedComparison.scenario,selected.scenario)
 // A reduction on the first project removes the second project's premium even
 // though its own sources do not change. Both effects must be compared.
 const scope={type:'scope',...projects[0],scope:'Less creative work',allocations:[{...bookings[0],effectiveFrom:day(1),dailySeconds:4*3600}]}
 const spill=await cmd('projectScenario:preview',{asOf,changes:[scope]})
 assert.equal(spill.scenario.projects.length,2,'FINANCE-003 cross-project overtime spillover included')
 assert.equal(spill.scenario.projects.find(p=>p.engagementId===projects[1].id).etcFeesMinor,2*3*10000*.9)
 assert.equal(spill.deltas.find(p=>p.engagementId===projects[1].id).eacFeesMinor,-9000)
 assert.equal(spill.scenario.capacity[0].committedSeconds,14*3600)
 // The agency-day fence refuses yesterday's exact comparison even if no source changed.
 await cmd('projectScenario:preview',{asOf,changes:[{...scope,terms:{mode:'fixed',amountMinor:10000,effortSeconds:3600,roundingSeconds:60,reason:'Would reclassify actuals'}}]},owner,409)
 const yesterdayInput={asOf:day(-1),changes:[scope]},yesterday=await cmd('projectScenario:preview',yesterdayInput)
 const old=await cmd('projectScenario:prepare',{...yesterdayInput,fingerprint:yesterday.fingerprint,name:'Prior day scope',reason:'Prior review'})
 const oldSelection={...old,asOf:day(-1),selectedIds:[scope.id]},oldPreview=await cmd('projectScenario:preview',oldSelection)
 await cmd('projectScenario:adopt',{...oldSelection,fingerprint:oldPreview.fingerprint,reason:'Old agency day'},owner,409)
 assert.equal((await read()).data.projectScenarios.find(s=>s.id===old.id).value.status,'prepared')
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 try {
  await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000});await page.goto(`${h.origin}/app/rates`)
   assert.match(await page.locator('main').innerText(),/Taylor Brooks/)
   const pricedRow=page.getByRole('row').filter({hasText:'Taylor Brooks'}).filter({hasText:'150% after 8 h/day'})
   assert.equal(await pricedRow.count(),1);assert.match(await pricedRow.innerText(),/10% write-down/)
   await pricedRow.scrollIntoViewIfNeeded()
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Pricing fits ${width}`)
   if(process.env.GAUGE_SCENARIO_SHOTS){await mkdir(process.env.GAUGE_SCENARIO_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.GAUGE_SCENARIO_SHOTS}/pricing-adopted-${width}.png`,fullPage:false})}
   const calculation=`forecast:${projects[0].id}:etcFeesMinor`
   await page.goto(`${h.origin}/app/review?from=${day(1)}&to=${day(2)}&calculation=${encodeURIComponent(calculation)}`)
   const figure=page.locator(`[id="calculation-${calculation}"]`)
   assert.match(await figure.locator('.g-summary').innerText(),/\$1,080\.00/,'FINANCE-003 native forecast displays independently computed net remaining fees')
   for(const booking of bookings)assert.equal(await figure.locator(`a[href="/api/gauge/history/staffing/${booking.id}"]`).count(),1,'FINANCE-003 both project threshold sources have revision doors')
   await figure.evaluate(el=>el.scrollIntoView({block:'start'}))
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Forecast formula fits ${width}`)
   if(process.env.GAUGE_SCENARIO_SHOTS)await page.screenshot({path:`${process.env.GAUGE_SCENARIO_SHOTS}/pricing-lineage-${width}.png`,fullPage:false})
  }
 } finally {await context.close()}
 console.log('PASS FINANCE-003 / FINANCE-011 / FINANCE-012 / FINANCE-013 / FINANCE-014 overtime/write-downs: independent per-project fees/cost/margin/cash, shared daily threshold, tentative ordering, isolated native pricing adoption, frozen actuals, cross-project spillover and agency-day fence; 1440/390')
}
