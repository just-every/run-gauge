import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

// The existing retainer suite invokes this native readiness sanity journey.
export async function retainerStewardJourney(h,browser,{client,lead,manager,agent}) {
 const {cmd,state,request}=h,zone='America/New_York'
 const person=await cmd('save:people',{name:'Readiness designer',timezone:zone}),staff=await h.invite('readiness-worker'),fin=await h.invite('readiness-finance')
 await cmd('grant',{operatorId:staff.id,personId:person.id,role:'staff',enabled:true})
 const financePerson=await cmd('save:people',{name:'Readiness finance reviewer',timezone:zone})
 await cmd('grant',{operatorId:fin.id,personId:financePerson.id,role:'finance',enabled:true})
 const project=await cmd('save:engagements',{name:'Retainer readiness review',clientId:client.id,leadId:lead.id,members:[person.id],scope:'Agreed design allowance',timezone:zone})
 const budget=await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:5000000,effortSeconds:400000,roundingSeconds:60,reason:'Ordinary project terms'});await cmd('budget:approve',budget)
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Retained design delivery',remainingSeconds:7200})
 const terms={name:'Readiness 40-hour allowance',frequency:'monthly',unit:'hours',allowance:144000,services:['Readiness design'],consumes:'billable',proration:'calendar',start:'2026-01-01',end:null,renewal:'automatic',noticeDays:0,rules:{carryCap:28800,carryPeriods:1,deficit:false,overage:'bill',overageRate:20000}}
 const save=async(t,extra={})=>{const p=await cmd('retainer:preview',{engagementId:project.id,operation:'terms',terms:t,...extra});return cmd('retainer:approve',{...p.input,fingerprint:p.fingerprint,reason:'Agreed retainer terms'})}
 const retained=await save(terms,{from:'2026-01-01',to:'2026-02-28'})
 await cmd('save:rates',{personId:person.id,service:'Readiness design',effective:'2026-01-01',billMinor:20000,costMinor:9000})
 const work=async(day,hours,approve=true)=>{let t=await cmd('time:save',{personId:person.id,engagementId:project.id,taskId:task.id,service:'Readiness design',timezone:zone,start:`${day}T06:00:00-05:00`,end:`${day}T${String(6+hours).padStart(2,'0')}:00:00-05:00`,notes:'Confirmed design work',billable:true},staff.cookie);t=await cmd('time:submit',t,staff.cookie);return approve?cmd('time:approve',t,manager.cookie):t}
 for(const day of ['05','06','07','08'])await work(`2026-01-${day}`,8)
 for(const day of ['02','03','04','05','06','09'])await work(`2026-02-${day}`,8)
 await work('2026-02-10',1)
 const pending=await work('2026-02-11',2,false)
 let report=await state(),period=report.data.retainerPeriods.find(p=>p.value.retainerId===retained.id&&p.value.periodStart==='2026-02-01')
 const door=(extra={})=>'/api/gauge/retainer-readiness?'+new URLSearchParams({engagementId:project.id,periodId:period.id,...extra})
 const preview=async(cookie=h.owner,extra={},status=200)=>{const response=await request(door(extra),cookie);assert.equal(response.status,status);return response.json()}
 const business=async()=>{const names=(await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'g_%' ORDER BY name").all()).results;return Promise.all(names.map(async({name})=>[name,(await h.db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()).results]))}
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),page=await context.newPage()
 const login=async cookie=>{await context.clearCookies();await context.addCookies(cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))}
 const capture=async name=>{if(!process.env.GAUGE_STEWARD_SHOTS)return;await mkdir(process.env.GAUGE_STEWARD_SHOTS,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.locator('#retainer-readiness').scrollIntoViewIfNeeded();await page.locator('#retainer-readiness').screenshot({path:`${process.env.GAUGE_STEWARD_SHOTS}/${name}-${width}.png`})}await page.setViewportSize({width:1440,height:1000})}
 try{
  const before=await business(),sent=h.providerRequests.length
  let p=await preview();assert.deepEqual(p.figures,{included:144000,carryOver:28800,adjustments:0,opening:172800,postedConsumption:176400,pendingSeconds:7200,postedOverage:20000,provisionalOverage:60000})
  assert.equal(p.candidate,null);assert.equal(p.status,'decisions-missing');assert(p.decisions.some(d=>d.id===pending.id&&d.kind==='reviewer'&&d.revision===pending.revision))
  assert(p.sources.some(s=>s.kind==='retainers'&&s.id===retained.id&&s.revision===retained.revision));assert(p.sources.some(s=>s.kind==='time'&&s.id===pending.id));assert.match(p.limits.join(' '),/Client overage decision is missing/)
  const financePreview=await preview(fin.cookie);assert.deepEqual(financePreview.figures,p.figures)
  await login(fin.cookie);await page.goto(h.origin+`/app/engagements?edit=${project.id}`)
  assert.equal(await page.locator('#retainer-readiness-result').count(),0,'No automatic preview')
  await page.getByLabel('Readiness period',{exact:true}).selectOption(period.id);await page.getByRole('button',{name:'Preview retainer readiness',exact:true}).click()
  const panel=page.locator('#retainer-readiness-result'),text=await panel.innerText();assert.match(text,/\$200\.00/);assert.match(text,/\$600\.00/);assert.match(text,/reviewer approval is missing/);assert.match(text,/Client overage decision is missing/)
  assert.equal(await panel.locator(`a[href="/app/review#${pending.id}"]`).count(),1)
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await capture('pending-readiness')
  assert.deepEqual(await business(),before,'HTTP and native form previews leave every business table unchanged');assert.equal(h.providerRequests.length,sent,'Readiness sends nothing')
  console.log('PROBE RECOVER-004 reconciliation: native readiness HTTP and form with 40 h + 8 h carry, 49 h approved + 2 h submitted -> 20000 posted cents, 60000 provisional cents; reviewer and client decisions missing; no writes or sends')
  await cmd('time:approve',pending,manager.cookie)
  await preview(h.owner,{fingerprint:p.fingerprint},409)
  await page.getByRole('button',{name:'Recheck exact preview',exact:true}).click();assert.match(await page.locator('body').innerText(),/sources changed/)
  p=await preview();assert.equal(p.figures.postedConsumption,183600);assert.equal(p.figures.pendingSeconds,0);assert.equal(p.figures.postedOverage,60000);assert.equal(p.figures.provisionalOverage,60000);assert.equal(p.candidate.amountMinor,60000)
  // Ordinary finance preparation is explicit and independent of the read-only preview.
  await login(h.owner);await page.goto(h.origin+`/app/engagements?edit=${project.id}`)
  const form=page.locator(`#retainers [id="${period.id}"] form`).filter({has:page.locator('[name=action][value="packet:create"]')})
  await form.getByRole('button',{name:'Draft overage packet',exact:true}).click()
  report=await state();const packet=report.data.packets.find(p=>p.value.lines.some(l=>l.kind==='retainerPeriods'&&l.sourceId===period.id));assert(packet);assert.equal(packet.value.totalMinor,60000);assert.equal(packet.value.status,'draft')
  const reservedBefore=await business(),reservedSends=h.providerRequests.length
  const reserved=await preview();assert.equal(reserved.figures.postedOverage,60000);assert.equal(reserved.reservedPacket,packet.id);assert.equal(reserved.candidate,null);assert(reserved.reservations.some(r=>r.source_id===period.id&&r.source_revision===period.revision&&r.packet_id===packet.id))
  await preview(h.owner,{fingerprint:p.fingerprint},409)
  await page.goto(h.origin+`/app/engagements?edit=${project.id}`);await page.getByLabel('Readiness period',{exact:true}).selectOption(period.id);await page.getByRole('button',{name:'Preview retainer readiness',exact:true}).click()
  assert.equal(await page.locator('#retainer-readiness-result').getByRole('link',{name:'Inspect reserved packet',exact:true}).getAttribute('href'),'/app/billing#'+packet.id)
  assert.match(await page.locator('#retainer-readiness-result').innerText(),/no duplicate billing candidate/)
  assert.equal(await page.locator('#retainer-readiness-result').getByRole('link',{name:'Review ordinary overage preparation',exact:true}).count(),0)
  await capture('reserved-readiness');assert.deepEqual(await business(),reservedBefore);assert.equal(h.providerRequests.length,reservedSends)
  await cmd('packet:create',{engagementId:project.id,title:'Duplicate readiness charge',sources:[`retainerPeriods:${period.id}`]},h.owner,409)
  console.log('PROBE RECOVER-004 reservation: approve ordinary time then explicitly draft native overage packet -> 60000 cents reserved once; preview links packet, offers no duplicate and stale fingerprints return 409')
  // A separate ordinary family supplies ambiguity, missing worker action and unknown value.
  const ambiguousTerms=await save({...terms,name:'Ambiguous March work',start:'2026-03-01',rules:{...terms.rules,carryCap:0,carryPeriods:0}})
  await save({...terms,name:'Competing March allowance',start:'2026-03-01',rules:{...terms.rules,carryCap:0,carryPeriods:0}})
  let draft=await cmd('time:save',{personId:person.id,engagementId:project.id,taskId:task.id,service:'Readiness design',timezone:zone,start:'2026-03-03T09:00:00-05:00',end:'2026-03-03T11:00:00-05:00',notes:'Awaiting worker confirmation',billable:true},staff.cookie)
  const feb=period;period=(await state()).data.retainerPeriods.find(p=>p.value.retainerId===ambiguousTerms.id)
  let held=await preview();assert(held.ambiguous.some(t=>t.id===draft.id));assert(held.decisions.some(d=>d.id===draft.id&&d.kind==='worker'));assert.equal(held.candidate,null);assert.equal(held.figures.provisionalOverage,null)
  await cmd('packet:create',{engagementId:project.id,title:'Unallocated overage',sources:[`retainerPeriods:${period.id}`]},h.owner,409)
  const ambiguousFingerprint=held.fingerprint
  draft=await cmd('retainer:allocate',{...draft,retainerRootId:ambiguousTerms.id,reason:'Ordinary human commercial allocation'},manager.cookie)
  await preview(h.owner,{fingerprint:ambiguousFingerprint},409);assert.equal((await preview()).ambiguous.length,0)
  const valued=await save({...terms,name:'Unpriced value readiness',unit:'value',allowance:10000,services:['Unknown design'],start:'2026-04-01',rules:{carryCap:0,carryPeriods:0,deficit:false,overage:'bill',overageRate:10000}})
  let unknown=await cmd('time:save',{personId:person.id,engagementId:project.id,taskId:task.id,service:'Unknown design',timezone:zone,start:'2026-04-06T09:00:00-04:00',end:'2026-04-06T11:00:00-04:00',notes:'Unpriced approved work',billable:true},staff.cookie);unknown=await cmd('time:submit',unknown,staff.cookie);await cmd('time:approve',unknown,manager.cookie)
  period=(await state()).data.retainerPeriods.find(p=>p.value.retainerId===valued.id);held=await preview();assert.equal(held.figures.postedConsumption,null);assert.equal(held.figures.postedOverage,null);assert.equal(held.candidate,null);assert(held.blockers.some(b=>b.includes('Unknown value inputs')))
  await cmd('packet:create',{engagementId:project.id,title:'Unknown value must not bill',sources:[`retainerPeriods:${period.id}`]},h.owner,409)
  console.log('PROBE RECOVER-004 incomplete inputs: ambiguous March work and unpriced April value -> explicit holds, missing worker decision, null monetary candidate and ordinary preparation refused')
  period=feb
  const deniedBefore=await business()
  for(const cookie of [staff.cookie,manager.cookie,agent.cookie]){await preview(cookie,{},403);const view=await request(door(),cookie);assert(!(await view.text()).includes('60000'))}
  await request(door(),'',{}).then(r=>assert.equal(r.status,401))
  assert.equal((await request(door(),h.owner,{headers:{authorization:'Bearer synthetic-gauge-910001'}})).status,403)
  const agentState=await state(agent.cookie);assert.deepEqual(agentState.data.retainers,[]);assert.equal(agentState.retainerBalances.length,0)
  assert.deepEqual(await business(),deniedBefore,'Refused previews change nothing')
  await cmd('grant',{operatorId:fin.id,personId:financePerson.id,role:'finance',enabled:false});await preview(fin.cookie,{},403)
  await login(fin.cookie);await page.goto(h.origin+`/app/engagements?edit=${project.id}&retainerStewardPeriod=${period.id}`);assert.equal(await page.locator('#retainer-readiness-result').count(),0)
  console.log('PROBE RECOVER-004 authority: staff, lead, agent, bearer, signed-out and revoked finance -> refused; no private amounts, writes or outbound effects')
 }finally{await context.close()}
}
