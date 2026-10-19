import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { harness } from './gauge-harness.mjs'

// RESOURCE-002 public calendar -> preview -> atomic move/split -> demand and history.
const h=await harness({currency:'USD',timezone:'America/New_York'}),hour=3600
let browser
try {
 const {cmd,owner,request}=h,from='2026-10-05',to='2026-10-09'
 const state=async(cookie=owner)=>{const r=await request(`/api/gauge/state?from=${from}&to=2026-10-16`,cookie);assert.equal(r.status,200);return r.json()}
 const leadPerson=await cmd('save:people',{name:'Morgan Lead',timezone:'America/New_York'})
 const makePerson=(name,role,skill)=>cmd('save:people',{name,timezone:'America/New_York',role,skills:[{name:skill,proficiency:4}]})
 const ava=await makePerson('Ava Designer','Designer','UX'),bo=await makePerson('Bo Developer','Developer','Engineering'),unknown=await makePerson('Cy Unknown','Designer','UX')
 for(const p of [ava,bo])await cmd('save:calendars',{personId:p.id,from,to:'2026-10-16',dailySeconds:8*hour,weekdays:'1,2,3,4,5',timezone:'America/New_York',holidays:['2026-10-12']})
 const lead=await h.invite('schedule-lead'),staff=await h.invite('schedule-staff'),outsider=await h.invite('schedule-outsider')
 for(const [user,personId,role] of [[lead,leadPerson.id,'lead'],[staff,ava.id,'staff'],[outsider,bo.id,'lead']])await cmd('grant',{operatorId:user.id,personId,role,enabled:true})
 const client=await cmd('save:clients',{name:'Juniper Studio'})
 const engagement=await cmd('save:engagements',{name:'Website launch',clientId:client.id,leadId:leadPerson.id,members:[ava.id],scope:'Design and build launch',timezone:'America/New_York'})
 const hidden=await cmd('save:engagements',{name:'Confidential audit',clientId:client.id,leadId:bo.id,members:[bo.id],scope:'Private competing booking',timezone:'America/New_York'})
 const booking=await cmd('save:staffing',{engagementId:engagement.id,personId:ava.id,from,to,dailySeconds:4*hour,commitment:'committed',service:'UX',billable:true})
 const competing=await cmd('save:staffing',{engagementId:hidden.id,personId:bo.id,from:'2026-10-12',to:'2026-10-16',dailySeconds:6*hour,commitment:'committed',service:'Engineering',billable:true})
 await cmd('save:staffing',{engagementId:engagement.id,personId:ava.id,from:'2026-10-12',to:'2026-10-16',dailySeconds:hour,commitment:'tentative',service:'UX',billable:true})
 const unfilled=await cmd('save:resourceRequests',{engagementId:engagement.id,role:'Researcher',skill:'Research',minProficiency:3,from:'2026-10-12',to:'2026-10-16',dailySeconds:2*hour,service:'Research',billable:true})
 const move={id:booking.id,revision:booking.revision,operation:'move',personId:bo.id,from:'2026-10-12',to:'2026-10-16'}
 const preview=await cmd('staffing:preview',move,lead.cookie)
 assert.equal(preview.totalSeconds,20*hour);assert.equal(preview.unfilledSeconds,10*hour)
 assert.equal((await state()).data.staffing.find(r=>r.id===booking.id).revision,booking.revision,'Preview never writes')
 const monday=preview.capacity[0].days.find(d=>d.date==='2026-10-12')
 assert.deepEqual([monday.holiday,monday.availableSeconds,monday.committedSeconds,monday.remainingSeconds],[true,0,10*hour,-10*hour])
 assert.equal(preview.capacity[0].conflicts.find(d=>d.date==='2026-10-13').seconds,2*hour)
 const publicText=JSON.stringify(preview)
 for(const privateText of [hidden.id,'Confidential audit',competing.id])assert(!publicText.includes(privateText),'Preview hides private competing records')
 const unknownPreview=await cmd('staffing:preview',{...move,personId:unknown.id},lead.cookie)
 assert.equal(unknownPreview.capacity[0].missingCalendarDays,5);assert.equal(unknownPreview.capacity[0].days[0].availableSeconds,null)
 for(const cookie of [staff.cookie,outsider.cookie]){
  await cmd('staffing:preview',move,cookie,403)
  await cmd('staffing:apply',{...move,fingerprint:preview.fingerprint},cookie,403)
 }
 assert.equal((await h.post('/api/gauge/command',{action:'staffing:preview',key:randomUUID(),...move})).status,401)
 await cmd('staffing:preview',{...move,to:'2026-10-15'},lead.cookie,400)
 const leave=await cmd('save:leave',{personId:bo.id,from:'2026-10-13',to:'2026-10-13',dailySeconds:hour,note:'Private appointment'})
 await cmd('staffing:apply',{...move,fingerprint:preview.fingerprint},lead.cookie,409)
 assert.equal((await state()).data.staffing.find(r=>r.id===booking.id).revision,booking.revision)
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 await context.addCookies(lead.cookie.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
 const shots=async(name,focus)=>{
  if(!process.env.GAUGE_SCHEDULE_SHOTS)return
  await mkdir(process.env.GAUGE_SCHEDULE_SHOTS,{recursive:true})
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}`)
   if(focus)await focus.scrollIntoViewIfNeeded()
   await page.screenshot({path:`${process.env.GAUGE_SCHEDULE_SHOTS}/${name}-${width}.png`})
  }
 }
 await page.goto(h.origin+`/app/capacity?from=${from}&edit=${booking.id}#schedule-changes`)
 const section=page.locator('#schedule-changes')
 const moveForm=section.locator('form').filter({has:page.locator('input[name=operation][value=move]')})
 await moveForm.locator('[name=personId]').selectOption(bo.id)
 await moveForm.locator('[name=from]').fill(move.from);await moveForm.locator('[name=to]').fill(move.to)
 await shots('move-form',section)
 await moveForm.getByRole('button').click()
 const confirm=section.locator('form').filter({has:page.locator('input[name=action][value="staffing:apply"]')})
 assert.equal(await confirm.count(),1)
 assert((await section.innerText()).includes('exceeds capacity'))
 assert(!(await section.innerText()).includes('Private appointment'))
 await shots('move-preview',section.getByRole('heading',{name:'Schedule change preview',exact:true}))
 const submit=await confirm.locator('input[name]').evaluateAll(inputs=>Object.fromEntries(inputs.map(i=>[i.name,i.value])))
 await confirm.getByRole('button').click()
 let data=await state(),moved=data.data.staffing.find(r=>r.id===booking.id)
 assert.deepEqual([moved.value.personId,moved.value.from,moved.value.to,moved.value.dailySeconds],[bo.id,move.from,move.to,4*hour])
 assert(data.data.engagements.find(r=>r.id===engagement.id).value.members.includes(bo.id))
 const acknowledged=await cmd('staffing:apply',submit,lead.cookie)
 assert.equal(acknowledged.revision,moved.revision)
 const split={id:moved.id,revision:moved.revision,operation:'split',splitDate:'2026-10-14',secondPersonId:ava.id}
 await cmd('staffing:preview',{...split,splitDate:'2026-10-12'},lead.cookie,400)
 await page.goto(h.origin+`/app/capacity?from=2026-10-12&edit=${booking.id}#schedule-changes`)
 const splitForm=section.locator('form').filter({has:page.locator('input[name=operation][value=split]')})
 await splitForm.locator('[name=splitDate]').fill(split.splitDate);await splitForm.locator('[name=secondPersonId]').selectOption(ava.id)
 await splitForm.getByRole('button').click();await shots('split-preview',section.getByRole('heading',{name:'Schedule change preview',exact:true}))
 const splitConfirm=section.locator('form').filter({has:page.locator('input[name=action][value="staffing:apply"]')})
 await splitConfirm.getByRole('button').click()
 data=await state()
 const parts=data.data.staffing.filter(r=>r.value.engagementId===engagement.id&&r.value.commitment==='committed')
 assert.equal(parts.length,2)
 assert.deepEqual(parts.map(r=>[r.value.personId,r.value.from,r.value.to]),[[bo.id,'2026-10-12','2026-10-13'],[ava.id,'2026-10-14','2026-10-16']])
 assert.equal(parts.reduce((n,r)=>n+((Date.parse(r.value.to)-Date.parse(r.value.from))/86400000+1)*r.value.dailySeconds,0),20*hour)
 assert(parts.every(r=>r.value.service==='UX'&&r.value.billable))
 const demand=data.resourceDemand.find(r=>r.engagementId===engagement.id)
 assert.deepEqual([demand.unfilledSeconds,demand.staffingSeconds,demand.totalSeconds],[10*hour,25*hour,35*hour])
 assert.equal(data.data.resourceRequests.find(r=>r.id===unfilled.id).value.status,'open')
 const history=await (await request(`/api/gauge/history/staffing/${booking.id}`,lead.cookie)).json()
 assert(history.history.some(r=>r.action==='staffing:move'&&r.value.from===from))
 assert(history.history.some(r=>r.action==='staffing:split'&&r.value.personId===bo.id))
 const concurrentInput={id:parts[0].id,revision:parts[0].revision,operation:'move',personId:ava.id,from:'2026-10-15',to:'2026-10-16'}
 const fresh=await cmd('staffing:preview',concurrentInput,lead.cookie)
 const responses=await Promise.all([h.post('/api/gauge/command',{...concurrentInput,action:'staffing:apply',fingerprint:fresh.fingerprint,key:randomUUID()},lead.cookie),h.post('/api/gauge/command',{...concurrentInput,action:'staffing:apply',fingerprint:fresh.fingerprint,key:randomUUID()},lead.cookie)])
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409])
 for(const [query,name,absent] of [['schedulePerson=Ava','Ava Designer','Bo Developer'],['scheduleRole=Developer','Bo Developer','Ava Designer'],['scheduleSkill=UX','Ava Designer','Bo Developer']]){
  await page.goto(h.origin+`/app/capacity?from=2026-10-12&${query}`)
  const board=page.locator('[aria-label="Staffing board"]')
  assert((await board.innerText()).includes(name));assert(!(await board.innerText()).includes(absent))
 }
 await shots('filtered-calendar',page.locator('[aria-label="Staffing board"]'))
 await page.goto(h.origin+'/app/capacity?from=2026-10-12')
 await shots('split-result',section)
 await cmd('grant',{operatorId:lead.id,personId:leadPerson.id,role:'lead',enabled:false})
 await cmd('staffing:preview',{...split,revision:parts[0].revision},lead.cookie,403)
 console.log('PASS RESOURCE-002 calendar search, holiday and hidden-project preview, unknown capacity, atomic move/split, stale/concurrent refusal, exact replay, privacy and unfilled-demand reconciliation')
}finally{await browser?.close();await h.dispose()}
