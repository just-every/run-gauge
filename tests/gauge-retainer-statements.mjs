import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

// RETAINER-003: a person opens a real statement, follows approved source work,
// and sees pending work affect only its provisional projection.
export async function retainerStatementsJourney(h,browser,{client,lead,worker,staff,manager,agent}) {
 const {cmd,state,request}=h,zone='America/New_York'
 const colleague=await cmd('save:people',{name:'Jordan Analyst',timezone:zone})
 const project=await cmd('save:engagements',{name:'October strategy partnership',clientId:client.id,leadId:lead.id,members:[worker.id,colleague.id],scope:'Research and design support',timezone:zone})
 const budget=await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:5000000,effortSeconds:144000,roundingSeconds:60,reason:'Approved project terms'});await cmd('budget:approve',budget)
 const task=await cmd('save:tasks',{engagementId:project.id,name:'October design workshop',remainingSeconds:7200})
 await cmd('save:rates',{personId:colleague.id,service:'Design',effective:'2026-01-01',costMinor:12347,billMinor:23457})
 const terms={name:'October 40-hour partnership',frequency:'monthly',unit:'hours',allowance:144000,services:['Design'],consumes:'billable',proration:'calendar',start:'2026-10-01',end:null,renewal:'automatic',noticeDays:0,rules:{carryCap:28800,carryPeriods:1,deficit:false,overage:'bill',overageRate:17891}}
 const save=async t=>{const p=await cmd('retainer:preview',{engagementId:project.id,operation:'terms',terms:t},manager.cookie);return cmd('retainer:approve',{...p.input,fingerprint:p.fingerprint,reason:'Approved private commercial terms'},manager.cookie)}
 const retained=await save(terms),value=await save({...terms,name:'Private value agreement',unit:'value',allowance:987654,services:['Strategy'],rules:{carryCap:0,carryPeriods:0,deficit:false,overage:'bill',overageRate:12500}})
 const actual=async(personId,from,to,notes,cookie=h.owner)=>{let t=await cmd('time:save',{personId,engagementId:project.id,taskId:task.id,service:'Design',timezone:zone,start:`2026-10-06T${from}:00-04:00`,end:`2026-10-06T${to}:00-04:00`,notes,billable:true},cookie);return t}
 let own=await actual(worker.id,'09:00','10:00','Avery confirmed workshop',staff.cookie);own=await cmd('time:submit',own,staff.cookie);own=await cmd('time:approve',own,manager.cookie)
 let other=await actual(colleague.id,'09:00','10:00','Jordan private source details');other=await cmd('time:submit',other);other=await cmd('time:approve',other,manager.cookie)
 let pending=await actual(worker.id,'10:00','12:00','Avery pending workshop',staff.cookie)
 let report=await state(),period=report.data.retainerPeriods.find(p=>p.value.retainerId===retained.id),b=report.retainerBalances.find(b=>b.periodId===period.id)
 assert.equal(b.opening,144000);assert.equal(b.adjustments,0);assert.equal(b.rollover,0);assert(report.lineage.find(f=>f.id===`retainer:${period.id}:remaining`).sources.some(s=>s.kind==='retainers'&&s.id===retained.id));assert.equal(b.consumed,7200);assert.equal(b.remaining,136800);assert.equal(b.pending,7200);assert.equal(b.projectedRemaining,129600);assert.equal(b.provisional,true)
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage(),url=h.origin+`/app/engagements?edit=${project.id}`
 const login=async cookie=>{await context.clearCookies();await context.addCookies(cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))}
 const capture=async(name,target=page.locator('#retainers'))=>{if(!process.env.GAUGE_RETAINER_SHOTS)return;await mkdir(process.env.GAUGE_RETAINER_SHOTS,{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);await target.scrollIntoViewIfNeeded();if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)){await page.screenshot({path:`${process.env.GAUGE_RETAINER_SHOTS}/${name}-overflow-${width}.png`,fullPage:true});console.log(await page.locator('body *').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(el).position!=='fixed').slice(-8).map(el=>({tag:el.tagName,class:el.className,right:el.getBoundingClientRect().right}))));assert.fail(`${name} fits ${width}`)};await page.screenshot({path:`${process.env.GAUGE_RETAINER_SHOTS}/${name}-${width}.png`,fullPage:true});await page.screenshot({path:`${process.env.GAUGE_RETAINER_SHOTS}/${name}-viewport-${width}.png`})}}
 try{
  await login(manager.cookie);await page.goto(url);await capture('statement-manager-pending',page.locator(`#retainers [id="${period.id}"]`))
  let staffReport=await state(staff.cookie),sb=staffReport.retainerBalances.find(b=>b.periodId===period.id)
  assert.equal(sb.consumed,7200);assert.equal(sb.pending,7200);assert.equal(sb.projectedRemaining,129600);assert.equal(sb.restrictedSources,true);assert(sb.sources.includes(own.id));assert(!sb.sources.includes(other.id));assert(!('overageMinor' in sb))
  assert(!staffReport.data.retainers.some(t=>t.id===value.id));assert(!staffReport.data.retainerPeriods.some(p=>p.value.retainerId===value.id));assert(!('overageRate' in staffReport.data.retainers.find(t=>t.id===retained.id).value.terms.rules))
  const serialized=JSON.stringify(staffReport);for(const secret of ['Jordan private source details','12347','23457','17891','987654'])assert(!serialized.includes(secret),`Staff state excludes ${secret}`)
  assert.equal((await request(`/api/gauge/history/time/${other.id}`,staff.cookie)).status,403);assert.equal((await request(`/api/gauge/history/retainers/${value.id}`,staff.cookie)).status,403)
  const exported=await request(`/api/gauge/report.csv?from=${staffReport.from}&to=${staffReport.to}&fingerprint=${staffReport.fingerprint}`,staff.cookie);assert.equal(exported.status,200);const csv=await exported.text();for(const secret of ['Jordan private source details','12347','23457','17891','987654',other.id])assert(!csv.includes(secret),`Staff CSV excludes ${secret}`)
  assert(csv.includes('Supporting source work is restricted'))
  await login(staff.cookie);await page.goto(url);await capture('statement-staff-pending',page.locator(`#retainers [id="${period.id}"]`));assert(!(await page.locator('#retainers').innerText()).includes('Private value agreement'))
  await page.locator(`#retainers a[href="/app/time?edit=${own.id}"]`).click();assert.equal(new URL(page.url()).searchParams.get('edit'),own.id);assert((await page.locator('body').innerText()).includes('Avery confirmed workshop'));await capture('statement-own-approved-source',page.locator('h1'))
  pending=await cmd('time:submit',pending,staff.cookie);pending=await cmd('time:return',{...pending,reason:'Confirm workshop details'},manager.cookie)
  report=await state();assert.equal(report.retainerBalances.find(b=>b.periodId===period.id).consumed,7200);assert.equal(report.retainerBalances.find(b=>b.periodId===period.id).projectedRemaining,129600)
  pending=await cmd('time:submit',pending,staff.cookie);await cmd('time:approve',pending,manager.cookie)
  report=await state();b=report.retainerBalances.find(b=>b.periodId===period.id);assert.equal(b.consumed,14400);assert.equal(b.pending,0);assert.equal(b.remaining,129600);assert.equal(b.projectedRemaining,129600);assert.equal(b.provisional,false)
  await page.goto(url);await capture('statement-staff-posted',page.locator(`#retainers [id="${period.id}"]`))
  await login(manager.cookie);await page.goto(url);await capture('statement-manager-posted',page.locator(`#retainers [id="${period.id}"]`))
  let valued=await cmd('time:save',{personId:worker.id,engagementId:project.id,taskId:task.id,service:'Strategy',timezone:zone,start:'2026-10-08T09:00:00-04:00',end:'2026-10-08T10:00:00-04:00',notes:'Confirmed strategy delivery',billable:true},staff.cookie);valued=await cmd('time:submit',valued,staff.cookie);await cmd('time:approve',valued,manager.cookie)
  const valuePending=await cmd('time:save',{personId:worker.id,engagementId:project.id,taskId:task.id,service:'Strategy',timezone:zone,start:'2026-10-08T10:00:00-04:00',end:'2026-10-08T12:00:00-04:00',notes:'Provisional strategy delivery',billable:true},staff.cookie)
  const managerReport=await state(manager.cookie),vb=managerReport.retainerBalances.find(b=>b.retainerId===value.id);assert.equal(vb.consumed,15000);assert.equal(vb.remaining,972654);assert.equal(vb.pending,null);assert.equal(vb.projectedRemaining,null);assert.equal(vb.pendingSeconds,7200);assert(managerReport.lineage.find(f=>f.id===`retainer:${vb.periodId}:consumed`).unknownSources.some(s=>s.includes('restricted to finance')))
  await page.goto(url);await capture('statement-value-unknown-projection',page.locator(`#retainers [id="${vb.periodId}"]`))
  const suggestion=await cmd('proposal:prepare',{kind:'time',engagementId:project.id,assumptions:'Unconfirmed calendar evidence',evidence:[{source:'Worker-supplied calendar',summary:'Possible workshop follow-up'}],plan:{personId:worker.id,taskId:task.id,service:'Design',start:'2026-10-07T09:00:00-04:00',end:'2026-10-07T10:00:00-04:00',timezone:zone,notes:'Possible follow-up',billable:true}},agent.cookie)
  const unconfirmed=(await state()).retainerBalances.find(b=>b.periodId===period.id);assert.equal(unconfirmed.consumed,14400);assert.equal(unconfirmed.pending,0)
  await login(staff.cookie);await page.goto(url);assert((await page.locator('#retainers').innerText()).includes('Unconfirmed evidence'));assert(await page.locator(`#retainers a[href="/app/review#${suggestion.id}"]`).count());await capture('statement-unconfirmed-evidence',page.locator('#retainers h3'))
  // RETAINER-003: one explicit commercial family per exact source revision.
  const overflow=await save({...terms,name:'Design overflow allowance',allowance:1800,rules:{...terms.rules,carryCap:0,carryPeriods:0}})
  report=await state();const overflowPeriod=report.data.retainerPeriods.find(p=>p.value.retainerId===overflow.id)
  assert.equal(report.retainerBalances.find(b=>b.periodId===period.id).consumed,0);assert.equal(report.retainerBalances.find(b=>b.periodId===period.id).unallocatedSeconds,14400)
  await cmd('retainer:allocate',{...own,retainerRootId:overflow.id,reason:'Staff cannot allocate commercial sources'},staff.cookie,403);await cmd('retainer:allocate',{...own,retainerRootId:overflow.id,reason:'Agent cannot allocate commercial sources'},agent.cookie,403)
  await login(manager.cookie);await page.goto(url);await page.getByText('Resolve retainer source allocation',{exact:true}).click()
  const allocation=page.locator('form').filter({has:page.locator(`[name=id][value="${own.id}"]`)}).filter({has:page.locator('[name=action][value="retainer:allocate"]')})
  await allocation.getByLabel('Retainer family',{exact:true}).selectOption(overflow.id);await allocation.getByLabel('Allocation reason',{exact:true}).fill('Workshop belongs to the overflow allowance');await capture('statement-allocation-editor',allocation);await allocation.getByRole('button',{name:'Assign exact time revision',exact:true}).click()
  report=await state();let selected=report.data.time.find(t=>t.id===own.id);assert.equal(selected.value.retainerRootId,overflow.id);assert.equal(selected.value.retainerAllocation.reason,'Workshop belongs to the overflow allowance');assert.equal(report.retainerBalances.find(b=>b.periodId===overflowPeriod.id).consumed,3600);assert.equal(report.retainerBalances.find(b=>b.periodId===period.id).consumed,0)
  await cmd('retainer:allocate',{...own,retainerRootId:retained.id,reason:'Stale allocation must refuse'},manager.cookie,409)
  for(const id of [other.id,pending.id]){const row=report.data.time.find(t=>t.id===id);await cmd('retainer:allocate',{id:row.id,revision:row.revision,retainerRootId:retained.id,reason:'Work belongs to the main monthly allowance'},manager.cookie)}
  report=await state();assert.equal(report.retainerBalances.find(b=>b.periodId===period.id).consumed,10800);assert.equal(report.retainerBalances.find(b=>b.periodId===overflowPeriod.id).consumed,3600);assert.equal(report.retainerBalances.find(b=>b.periodId===overflowPeriod.id).unallocatedSeconds,0)
  const history=await(await request(`/api/gauge/history/time/${own.id}`,h.owner)).json();assert(history.history.some(h=>h.action==='retainer:allocate'))
  await page.goto(url);await capture('statement-allocation-saved',page.locator(`#retainers [id="${overflowPeriod.id}"]`))
  const protectedDraft=await cmd('packet:create',{engagementId:project.id,title:'Reviewed overflow half-hour',sources:[`retainerPeriods:${overflowPeriod.id}`]})
  await cmd('retainer:allocate',{id:selected.id,revision:selected.revision,retainerRootId:retained.id,reason:'Reserved source must not move'},manager.cookie,409)
  await cmd('packet:approve',protectedDraft)
  await cmd('retainer:allocate',{id:selected.id,revision:selected.revision,retainerRootId:retained.id,reason:'Billed source must not move'},manager.cookie,409)
  await cmd('time:correct',{id:selected.id,revision:selected.revision,reason:'Billed allowance source must remain fixed'},manager.cookie,409)
  assert.equal((await state()).data.packets.find(p=>p.id===protectedDraft.id).value.totalMinor,8946,'Half-hour at $178.91/h rounds half up to $89.46')
  const outsider=await h.invite('other-retainer-lead'),outsiderPerson=await cmd('save:people',{name:'Other project lead',timezone:zone});await cmd('grant',{operatorId:outsider.id,personId:outsiderPerson.id,role:'lead',enabled:true})
  assert(!(await state(outsider.cookie)).retainerBalances.some(b=>b.periodId===period.id));assert.equal((await request(`/api/gauge/history/retainers/${retained.id}`,outsider.cookie)).status,403)
  assert.equal((await state(agent.cookie)).retainerBalances.length,0)
  await cmd('grant',{operatorId:staff.id,personId:worker.id,role:'staff',enabled:false});assert.equal((await request('/api/gauge/state',staff.cookie)).status,403);await cmd('grant',{operatorId:staff.id,personId:worker.id,role:'staff',enabled:true})
  console.log('PASS RETAINER-003: complete hours statement, own approved source drill, provisional draft/returned/submitted projection, exact approval posting, unconfirmed evidence exclusion, scoped staff/lead/agent visibility and private state/history/CSV')
 }finally{await context.close()}
}
