import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { adoptedOutcome } from './fixtures/recovery-outcomes.mjs'

// One end-to-end sanity journey, folded into the existing scenario suite and budget.
export async function recoveryOutcomeJourney(h,browser) {
 const {cmd,owner}=h,fixture=await adoptedOutcome(h),{asOf,day,person,replacement,client,projects,bookings,tasks,adopted,retained}=fixture
 const input={id:adopted.id,revision:adopted.revision}
 const capture=()=>cmd('recovery:outcome-capture',input)
 const compare=async(cookie=owner)=>{const records=(await h.state()).data,network=h.providerRequests.length;const result=await cmd('recovery:outcome-compare',await capture(),cookie);assert.deepEqual((await h.state()).data,records,'Outcome reads change no business records, cases or approvals');assert.equal(h.providerRequests.length,network,'Outcome reads send nothing');return result}
 await cmd('case:open',{type:'scope-risk',title:'synthetic-gauge-9311 recovery remains open',sourceRef:`engagements:${projects[0].id}@${(await h.state()).data.engagements.find(p=>p.id===projects[0].id).revision}`,ownerId:person.id,nextAction:'Review native variance separately',dueAt:new Date(Date.parse(day(1))).toISOString(),reason:'Ordinary owned case remains unchanged'})
 const before=(await h.state()).data,traffic=h.providerRequests.length
 const initial=await compare()
 assert.deepEqual(initial.before,retained.before);assert.deepEqual(initial.expected,retained.expected)
 assert(initial.projects.every(p=>p.marginVarianceMinor===0&&p.costVarianceMinor===0&&p.feesVarianceMinor===0))
 assert(initial.months.every(m=>m.varianceMinor===0&&m.historicalVarianceMinor===0))
 assert(initial.loads.every(d=>d.varianceSeconds===0&&d.capacityVarianceSeconds===0))
 assert.deepEqual(initial.changedInputs,[])
 assert.equal(initial.observed.projects.find(p=>p.engagementId===projects[0].id).marginMinor,1000000-8*9000)
 assert.equal(initial.observed.projects.find(p=>p.engagementId===projects[1].id).marginMinor,4*(20000-5000))
 assert.equal(initial.months.reduce((n,m)=>n+m.observedMinor,0),Math.floor((1000000+4*20000)/2))
 assert.equal(initial.observed.dates.find(d=>d.engagementId===projects[0].id).finish,day(5))
 assert.deepEqual((await h.state()).data,before,'Read-only comparison changes no records, cases or approvals')
 assert.equal(h.providerRequests.length,traffic,'No outbound send or provider execution')
 console.log('PROBE RECOVER-003 retained: adopted HTTP scenario -> fixed baseline, expected and current margin, dates, global load and monthly cash reconcile with zero variance')
 // Caller claims cannot replace observed records, nor select a different date, window or project set.
 for(const forged of [{observed:{marginMinor:99999999}},{success:true},{status:'closed'},{asOf:day(10)},{from:day(1)},{projectIds:[projects[1].id]},{basis:'other'}])await cmd('recovery:outcome-compare',{...await capture(),...forged},owner,400)
 await cmd('recovery:outcome-capture',{...input,revision:'stale'},owner,409)
 const fin=await h.invite('synthetic-gauge-9301'),lead=await h.invite('synthetic-gauge-9302'),staff=await h.invite('synthetic-gauge-9303'),agent=await h.invite('synthetic-gauge-9304'),clientUser=await h.invite('synthetic-gauge-9305')
 for(const [user,role] of [[fin,'finance'],[lead,'lead'],[staff,'staff']])await cmd('grant',{operatorId:user.id,personId:role==='finance'?replacement.id:person.id,role,enabled:true})
 await cmd('grant',{operatorId:agent.id,role:'agent',purpose:'staffing',engagementIds:projects.map(p=>p.id),enabled:true})
 const selectedCapture=await capture()
 const secondOwner=await h.invite('synthetic-gauge-9312','owner')
 await cmd('recovery:outcome-compare',selectedCapture,secondOwner.cookie)
 assert.equal((await h.post('/auth/operator/status',{operatorId:secondOwner.id,status:'inactive'},owner)).status,200)
 await cmd('recovery:outcome-compare',selectedCapture,secondOwner.cookie,401)
 await cmd('recovery:outcome-compare',selectedCapture,fin.cookie)
 for(const user of [lead,staff,agent,clientUser]) {
  await cmd('recovery:outcome-capture',input,user.cookie,403)
  await cmd('recovery:outcome-compare',selectedCapture,user.cookie,403)
  assert(!(await(await h.request('/app/review',user.cookie)).text()).includes('id="recovery-outcomes"'))
 }
 await cmd('grant',{operatorId:fin.id,personId:replacement.id,role:'finance',enabled:false})
 await cmd('recovery:outcome-compare',selectedCapture,fin.cookie,403)
 // Revision race: a later native change invalidates a captured read. Current values then become exact variance.
 const staleCapture=await capture(),current=(await h.state()).data.staffing.find(b=>b.value.engagementId===projects[1].id&&b.value.personId===replacement.id)
 await cmd('save:staffing',{...current,...current.value,dailySeconds:3*3600})
 await cmd('recovery:outcome-compare',staleCapture,owner,409)
 const changed=await compare(),delta=changed.projects.find(p=>p.engagementId===projects[1].id)
 assert.equal(delta.costVarianceMinor,2*5000);assert.equal(delta.feesVarianceMinor,2*20000);assert.equal(delta.marginVarianceMinor,2*(20000-5000))
 assert.equal(changed.loads.filter(d=>d.personId===replacement.id).reduce((n,d)=>n+d.varianceSeconds,0),2*3600)
 assert.equal(changed.months.reduce((n,m)=>n+m.varianceMinor,0),20000)
 assert(changed.changedInputs.some(s=>s.kind==='staffing'&&s.id===current.id&&s.observedRevision!==s.expectedRevision))
 const raceCapture=await capture(),raceBooking=(await h.state()).data.staffing.find(b=>b.id===current.id)
 const [raceRead]=await Promise.all([
  h.post('/api/gauge/command',{action:'recovery:outcome-compare',key:crypto.randomUUID(),...raceCapture},owner),
  cmd('save:staffing',{...raceBooking,...raceBooking.value,dailySeconds:4*3600})
 ])
 const raceResult=await raceRead.json()
 assert([200,409].includes(raceRead.status),'Concurrent observation either returns the captured basis or refuses drift')
 if(raceRead.status===200){assert.equal(raceResult.projects.find(p=>p.engagementId===projects[1].id).marginVarianceMinor,30000);assert.equal(raceResult.sources.observed.find(s=>s.kind==='staffing'&&s.id===current.id).revision,raceBooking.revision)}
 const afterRace=(await h.state()).data.staffing.find(b=>b.id===current.id)
 await cmd('save:staffing',{...afterRace,...afterRace.value,dailySeconds:3*3600})
 console.log('PROBE RECOVER-003 concurrency: native staffing write overlaps captured comparison -> coherent captured result or 409 drift refusal, never mixed revisions')
 // A later probability decision changes expected cash, not the retained expected snapshot or margin.
 const currentClient=(await h.state()).data.clients.find(c=>c.id===client.id)
 await cmd('save:clients',{...currentClient,...currentClient.value,collectionPercent:25})
 const probability=await compare()
 assert.equal(probability.months.reduce((n,m)=>n+m.observedMinor,0),Math.floor((1000000+6*20000)/4))
 assert.equal(probability.months.reduce((n,m)=>n+m.varianceMinor,0),280000-540000)
 assert.deepEqual(probability.expected,initial.expected)
 assert.equal(probability.projects.find(p=>p.engagementId===projects[1].id).marginVarianceMinor,30000)
 console.log('PROBE RECOVER-003 variance: ordinary staffing and collection edits -> exact cost +10000, fees +40000, margin +30000 and expected cash -260000 cents; retained prediction unchanged')
 const laterPlan=(await h.state()).data.deliveryPlans.filter(p=>p.value.engagementId===projects[0].id).at(-1)
 const laterDates=await cmd('delivery:preview',{engagementId:projects[0].id,previousId:laterPlan.id,revision:laterPlan.revision,operation:'delay',nodeId:tasks[0].id,delayBusinessDays:1})
 await cmd('delivery:approve',{...laterDates.input,fingerprint:laterDates.fingerprint,acceptEffects:true,reason:'Later ordinary delivery decision'})
 const rescheduled=await compare()
 assert.equal(rescheduled.observed.dates.find(d=>d.engagementId===projects[0].id).finish,day(6))
 assert.equal(rescheduled.expected.dates.find(d=>d.engagementId===projects[0].id).finish,day(5))
 assert.equal(rescheduled.dateVariances.find(d=>d.engagementId===projects[0].id).finishVarianceDays,1)
 assert.equal(rescheduled.to,initial.to);assert.equal(rescheduled.asOf,asOf)
 assert(rescheduled.changedInputs.some(s=>s.kind==='deliveryPlans'))
 // Read current native invoices and user-recorded receipts, even when their sources were not in the original forecast.
 const pastTask=await cmd('save:tasks',{engagementId:projects[1].id,name:'synthetic-gauge-9306 past work',remainingSeconds:0})
 const time=await cmd('time:approve',await cmd('time:submit',await cmd('time:save',{personId:replacement.id,engagementId:projects[1].id,taskId:pastTask.id,service:'Design',notes:'Native observed work',timezone:'UTC',billable:true,start:asOf+'T09:00:00Z',end:asOf+'T10:00:00Z'})))
 const packet=await cmd('packet:approve',await cmd('packet:create',{engagementId:projects[1].id,title:'synthetic-gauge-9307',sources:[`time:${time.id}`]}))
 const invoice=await cmd('invoice:issue',{...packet,issueDate:asOf,dueDate:asOf,billTo:'Native client',remitTo:'Native agency',reference:'synthetic-gauge-9308'})
 await cmd('payment:record',{...invoice,date:asOf,amountMinor:10000,reference:'synthetic-gauge-9309'})
 const paid=await compare(),cashProject=paid.observed.cash.engagements.find(p=>p.engagementId===projects[1].id),item=cashProject.items.find(i=>i.invoiceId===invoice.id)
 assert.equal(item.paidMinor,10000);assert.equal(item.openMinor,10000);assert.equal(item.expectedMinor,2500)
 assert.match(paid.boundaries.join(' '),/user-recorded/);assert.match(paid.boundaries.join(' '),/Provider outcomes unobserved/)
 assert(paid.changedInputs.some(s=>s.kind==='invoices'&&s.id===invoice.id));assert(paid.changedInputs.some(s=>s.kind==='payments'))
 // Missing cost and calendar remain unknown. No zero may masquerade as a complete observation.
 const unknown=await cmd('save:people',{name:'synthetic-gauge-9310 unpriced',timezone:'UTC'})
 const latest=(await h.state()).data.staffing.find(b=>b.id===current.id)
 await cmd('save:staffing',{...latest,...latest.value,personId:unknown.id})
 const incomplete=await compare()
 assert.equal(incomplete.observed.projects.find(p=>p.engagementId===projects[1].id).marginMinor,null)
 assert.equal(incomplete.projects.find(p=>p.engagementId===projects[1].id).marginVarianceMinor,null)
 assert(incomplete.loads.some(d=>d.personId===unknown.id&&d.observedAvailableSeconds===null));assert(incomplete.unknowns.length)
 assert(incomplete.months.every(m=>m.observedMinor===null&&m.varianceMinor===null))
 // Remove no existing assertion: restore the ordinary booking for the screen proof.
 const unknownBooking=(await h.state()).data.staffing.find(b=>b.id===current.id)
 await cmd('save:staffing',{...unknownBooking,...unknownBooking.value,personId:replacement.id})
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),page=await context.newPage()
 try {
  await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  await page.goto(h.origin+'/app/review')
  const panel=page.locator('#recovery-outcomes')
  await panel.locator('form').filter({has:page.locator(`input[name=id][value="${adopted.id}"]`)}).getByRole('button',{name:'Capture observed inputs'}).click()
  await panel.getByRole('button',{name:'Compare current records'}).click()
  const shown=await panel.locator('#outcome-results').innerText()
  const moneyCells=panel.locator(`tr[id="${projects[1].id}"] td`)
  assert.match(await moneyCells.nth(1).innerText(),/\$240\.00/)
  assert.match(await moneyCells.nth(2).innerText(),/\$600\.00/)
  assert.match(await moneyCells.nth(3).innerText(),/\$1,050\.00/)
  assert(shown.includes(day(5)));assert(shown.includes('Provider outcomes unobserved'));assert(shown.includes('user-recorded'));assert(shown.includes('USD'))
  assert(await panel.locator('input,button,p,h2,h3,li,summary,td,th').evaluateAll(nodes=>nodes.every(n=>parseFloat(getComputedStyle(n).fontSize)>=13)))
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  if(process.env.GAUGE_OUTCOME_SHOTS) {
   await mkdir(process.env.GAUGE_OUTCOME_SHOTS,{recursive:true})
   for(const width of [1440,390]) {await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);await panel.locator('#outcome-results').screenshot({path:`${process.env.GAUGE_OUTCOME_SHOTS}/outcomes-${width}.png`})}
  }
 } finally {await context.close()}
 console.log('PROBE RECOVER-003 safeguards: built HTTP and Review forms -> forged figures and stale or unauthorized or revoked access refused; invoices and manual receipts observed; incomplete costs and calendars stay unknown; no comparison effects')
 // Incompatible historical basis is refused through the door (legacy saved data has no observation).
 const original=await h.db.prepare('SELECT data FROM g_projectScenarios WHERE id=?').bind(adopted.id).first()
 const legacy=JSON.parse(original.data);delete legacy.approvedComparison.observation
 await h.db.prepare('UPDATE g_projectScenarios SET data=? WHERE id=?').bind(JSON.stringify(legacy),adopted.id).run()
 await cmd('recovery:outcome-capture',input,owner,409)
 await h.db.prepare('UPDATE g_projectScenarios SET data=? WHERE id=?').bind(original.data,adopted.id).run()
 // Erasure invalidates old captures; a fresh read cannot disclose the erased profile.
 await cmd('privacy:policy',{personalDays:0,fileDays:0,evidenceDays:0,reason:'Bounded native erasure policy'})
 await cmd('privacy:exit',{personId:replacement.id,date:asOf,reason:'Native engagement ended'})
 const erase=await cmd('privacy:preview',{personId:replacement.id})
 assert.deepEqual(erase.blockers,[])
 await cmd('privacy:erase',{personId:replacement.id,fingerprint:erase.fingerprint,reason:'Explicit reviewed native erasure',confirm:'erase-reviewed-native-scope',lawfulReceiptRemoval:'authorized'})
 await cmd('recovery:outcome-compare',selectedCapture,owner,409)
 const erased=await compare()
 assert(!JSON.stringify(erased).includes('synthetic-gauge-9300 contractor'))
 assert.deepEqual((await h.state()).data.projectScenarios.find(s=>s.id===adopted.id).value.approvedComparison.observation,retained)
 const mixedFixture=await adoptedOutcome(h,'synthetic-gauge-9330','CAD')
 const mixed=await cmd('recovery:outcome-compare',await cmd('recovery:outcome-capture',mixedFixture.adopted))
 assert.deepEqual([...new Set(mixed.months.map(m=>m.currency))].sort(),['CAD','USD'])
 assert(mixed.months.filter(m=>m.currency==='CAD').every(m=>m.observedMinor===null&&m.varianceMinor===null))
 assert(mixed.months.filter(m=>m.currency==='USD').every(m=>m.observedMinor!==null&&m.varianceMinor===0))
 assert(mixed.unknowns.some(s=>s.includes('USD')))
 console.log('PROBE RECOVER-003 currencies: native USD and CAD projects -> separate monthly rows, unconverted CAD cost remains unknown, USD observation stays qualified')
 console.log('PASS RECOVER-003 native post-adoption outcome journey: frozen baseline and expected observations, canonical dates and global load and margin and monthly cash, exact later variance, manual records, unknowns, no closure or approval or outbound effects, strict authority and revision boundaries; native forms at 1440 and 390 proof')
}
