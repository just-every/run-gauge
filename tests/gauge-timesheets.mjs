import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir,readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { timeReviewJourney } from './gauge-time-review.mjs'
import { harness } from './gauge-harness.mjs'

// TIME-003 / TIME-007: real favorite/grid/manual entry, atomic submission, return/correction,
// policy locks through native and import doors, and exact approval history.
const h=await harness({currency:'USD',timezone:'America/New_York'})
let browser
try {
 const {cmd,state,request,owner}=h,zone='America/New_York',hour=3600
 const lead=await cmd('save:people',{name:'Morgan Lead',timezone:zone}),worker=await cmd('save:people',{name:'Avery Designer',timezone:zone})
 const staff=await h.invite('timesheet-worker'),manager=await h.invite('timesheet-lead'),financeUser=await h.invite('timesheet-finance')
 for(const [user,person,role] of [[staff,worker,'staff'],[manager,lead,'lead'],[financeUser,lead,'finance']])await cmd('grant',{operatorId:user.id,personId:person.id,role,enabled:true})
 const client=await cmd('save:clients',{name:'Cascade Studio'}),project=await cmd('save:engagements',{name:'Autumn identity',clientId:client.id,leadId:lead.id,members:[worker.id],scope:'Brand delivery',timezone:zone})
 const task=await cmd('save:tasks',{engagementId:project.id,name:'Creative delivery',assigneeId:worker.id,remainingSeconds:40*hour})
 const terms=await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:1000000,effortSeconds:40*hour,roundingSeconds:900,reason:'Signed autumn delivery'});await cmd('budget:approve',terms)
 await cmd('save:rates',{personId:worker.id,service:'Design',effective:'2026-01-01',costMinor:5000,billMinor:15000})
 await cmd('save:calendars',{personId:worker.id,from:'2026-10-05',to:'2026-10-11',dailySeconds:8*hour,weekdays:'1,2,3,4,5',timezone:zone})
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
 const signIn=async cookie=>{await context.clearCookies();await context.addCookies(cookie.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}));await page.goto('about:blank')}
 const sheetUrl=h.origin+`/app/time?sheetFrom=2026-10-05&sheetPerson=${worker.id}`
 const capture=async(name,focus=page.locator('#timesheet'))=>{
  if(!process.env.GAUGE_TIMESHEET_SHOTS)return
  await mkdir(process.env.GAUGE_TIMESHEET_SHOTS,{recursive:true})
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}`);await focus.scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.GAUGE_TIMESHEET_SHOTS}/${name}-${width}.png`,fullPage:true});await page.screenshot({path:`${process.env.GAUGE_TIMESHEET_SHOTS}/${name}-viewport-${width}.png`})}
 }
 await signIn(staff.cookie);await page.goto(sheetUrl)
 const favoriteForm=page.locator('form').filter({has:page.locator('[name=action][value="time:favorite"]')})
 await favoriteForm.getByLabel('Favorite name',{exact:true}).fill('Morning design')
 await favoriteForm.locator('[name=taskId]').selectOption(task.id);await favoriteForm.getByLabel('Service',{exact:true}).fill('Design')
 await capture('timesheet-favorite',favoriteForm);await favoriteForm.getByRole('button',{name:'Save favorite',exact:true}).click()
 const favorite=(await state(staff.cookie)).data.timeFavorites[0];assert(favorite)
 for(const cookie of [manager.cookie,financeUser.cookie,owner])assert.equal((await state(cookie)).data.timeFavorites.length,0,'Other personas do not receive personal favorites in ordinary state')
 assert.equal((await request(`/api/gauge/history/timeFavorites/${favorite.id}`,manager.cookie)).status,403)
 const leadReport=await state(manager.cookie),leadExport=await request(`/api/gauge/report.csv?from=2026-10-01&to=2026-10-31&fingerprint=${leadReport.fingerprint}`,manager.cookie);assert.equal(leadExport.status,200);assert(!(await leadExport.text()).includes('Morning design'),'Lead report export contains no private favorite')
 await cmd('time:favorite',{...favorite,...favorite.value,name:'Unauthorized change'},manager.cookie,403)
 await signIn(owner);await page.goto(sheetUrl);assert.equal(await page.locator('[name=favorite] option').filter({hasText:'Morning design'}).count(),1,'Owner can act for the person explicitly on finance Time')
 await signIn(staff.cookie);await page.goto(sheetUrl+`&favorite=${favorite.id}`)
 const gridRow=page.locator('tr[data-work-date="2026-10-05"]')
 await gridRow.getByText('Add interval',{exact:true}).click()
 const interval=gridRow.locator('form');assert.equal(await interval.locator('[name=taskId]').inputValue(),task.id)
 await interval.getByLabel('Start clock time',{exact:true}).fill('09:00');await interval.getByLabel('End clock time',{exact:true}).fill('10:07');await interval.getByLabel('Work notes',{exact:true}).fill('Reviewed design direction')
 await capture('timesheet-week-entry');await interval.getByRole('button',{name:'Save interval',exact:true}).click()
 let entries=(await state(staff.cookie)).data.time,first=entries.find(t=>t.value.workDate==='2026-10-05');assert.equal(first.value.durationSeconds,4020);assert.equal(first.value.service,'Design')
 await page.goto(sheetUrl+'&sheetView=day');await capture('timesheet-day')
 assert.equal(await page.locator('tr[data-work-date]').count(),1)
 const cells=page.locator('tr[data-work-date="2026-10-05"] td')
 assert.equal((await cells.nth(1).innerText()).replace(/\s/g,' '),'8 h');assert.equal((await cells.nth(2).innerText()).replace(/\s/g,' '),'1.12 h');assert.equal((await cells.nth(3).innerText()).replace(/\s/g,' '),'6.88 h')
 await page.goto(sheetUrl)
 const manual=page.locator('section.g-card--form form').filter({has:page.locator('[name=action][value="time:save"]')})
 await manual.locator('[name=engagementId]').selectOption(project.id);await manual.locator('[name=taskId]').selectOption(task.id);await manual.getByLabel('Service',{exact:true}).fill('Design')
 await manual.getByLabel('Start',{exact:true}).fill('2026-10-06T09:00');await manual.getByLabel('End',{exact:true}).fill('2026-10-06T11:00');await manual.getByLabel('Work notes',{exact:true}).fill('Manual campaign session')
 await manual.getByRole('button',{name:'Save',exact:true}).click()
 entries=(await state(staff.cookie)).data.time;const second=entries.find(t=>t.value.workDate==='2026-10-06')
 await page.goto(sheetUrl+`&copyTime=${second.id}`)
 assert.equal(await page.locator('tr[data-work-date="2026-10-07"] [name=taskId]').inputValue(),task.id)
 assert.equal((await state(staff.cookie)).data.time.length,2,'Copy only prepares defaults, never fabricated actual time')
 const third=await cmd('time:save',{personId:worker.id,engagementId:project.id,taskId:task.id,service:'Design',timezone:zone,billable:true,notes:'Midweek delivery',start:'2026-10-07T09:00:00-04:00',end:'2026-10-07T10:00:00-04:00'},staff.cookie)
 await cmd('time:bulk-submit',{entries:[{id:first.id,revision:first.revision},{id:second.id,revision:'stale'}]},staff.cookie,409)
 assert((await state(staff.cookie)).data.time.every(t=>t.value.status==='draft'),'Stale bulk submission changes no entry')
 await page.goto(sheetUrl);const bulk=page.locator('form').filter({has:page.locator('[name=action][value="time:bulk-submit"]')})
 await capture('timesheet-bulk-submit',bulk);await bulk.getByRole('button',{name:'Submit selected exact revisions',exact:true}).click()
 entries=(await state(staff.cookie)).data.time;assert(entries.every(t=>t.value.status==='submitted'))
 await page.goto(sheetUrl);assert((await page.locator('tr[data-work-date="2026-10-05"] td').nth(4).innerText()).replace(/\s/g,' ').includes('submitted 1.12 h'),'Grid shows actual submitted hours separately from other approval states')
 let returned=await cmd('time:return',{id:second.id,revision:entries.find(t=>t.id===second.id).revision,reason:'Clarify delivery handoff'},manager.cookie)
 await page.goto(sheetUrl);assert((await page.locator('tr[data-work-date="2026-10-06"]').innerText()).includes('Clarify delivery handoff'));await capture('timesheet-returned')
 const originalSecond=entries.find(t=>t.id===second.id)
 returned=await cmd('time:save',{...originalSecond.value,...returned,start:'2026-10-06T09:00:00-04:00',end:'2026-10-06T10:30:01-04:00',notes:'Corrected handoff duration'},staff.cookie)
 await cmd('time:bulk-submit',{entries:[returned]},staff.cookie)
 first=(await state()).data.time.find(t=>t.id===first.id);await cmd('time:approve',first,manager.cookie)
 first=(await state()).data.time.find(t=>t.id===first.id);assert.equal(first.value.durationSeconds,4020);assert.equal(first.value.economics.roundedBillingSeconds,4500)
 // Import a historical package before locking, then demonstrate locked undo and insert refusals.
 const fixture=new URL('./fixtures/harvest/',import.meta.url),files={};for(const file of ['clients.csv','people.csv','projects.csv','time.csv','finance.json'])files[file]=await readFile(new URL(file,fixture),'utf8')
 const manifest=JSON.parse(await readFile(new URL('manifest.json',fixture),'utf8'));manifest.currency='USD';manifest.namespace='timesheet-lock-source'
 const pack={manifest,files},preview=await cmd('import:preview',{package:pack});let imported=await cmd('import:create',{package:pack,fingerprint:preview.fingerprint});while(['applying','queued'].includes(imported.state))imported=await cmd('import:resume',{id:imported.id});assert.equal(imported.state,'completed')
 const draftInput={personId:worker.id,engagementId:project.id,taskId:task.id,service:'Design',timezone:zone,billable:true,notes:'Awaiting submission',start:'2026-10-06T13:00:00-04:00',end:'2026-10-06T14:00:00-04:00'}
 const draft=await cmd('time:save',draftInput,staff.cookie)
 const timer=await cmd('timer:start',{...draftInput,start:undefined,end:undefined},staff.cookie)
 await cmd('time:policy',{lockThrough:'2099-01-01',reason:'Cannot strand a running timer'},owner,409)
 await cmd('timer:stop',timer,staff.cookie)
 let policy=await cmd('time:policy',{lockThrough:'2026-10-08',reason:'Weekly timesheet approval cutoff'})
 await cmd('time:policy',{...policy,lockThrough:null,reason:'Staff cannot reopen'},staff.cookie,403)
 await cmd('time:save',{...draftInput,...draft,start:'2026-10-09T13:00:00-04:00',end:'2026-10-09T14:00:00-04:00'},staff.cookie,409)
 await cmd('time:save',{...draftInput,start:'2026-10-05T15:00:00-04:00',end:'2026-10-05T16:00:00-04:00'},staff.cookie,409)
 await cmd('time:bulk-submit',{entries:[draft]},staff.cookie,409)
 await cmd('time:correct',{...first,reason:'Correction requires reopening'},manager.cookie,409)
 const importedTimeIds=(await state()).data.time.filter(t=>t.value.source?.namespace==='harvest:timesheet-lock-source').map(t=>t.id).sort()
 let refused=false;for(let n=0;n<12&&!refused;n++){const r=await h.post('/api/gauge/command',{key:randomUUID(),action:n?'import:resume':'import:undo',id:imported.id},owner);if(r.status===409)refused=true;else assert.equal(r.status,200)}assert(refused,'Locked imported time cannot be removed by undo')
 assert.deepEqual((await state()).data.time.filter(t=>t.value.source?.namespace==='harvest:timesheet-lock-source').map(t=>t.id).sort(),importedTimeIds)
 const another=structuredClone(pack);another.manifest.namespace='timesheet-lock-insert';const nextPreview=await cmd('import:preview',{package:another});let inserting
 let insertRefused=false;for(let n=0;n<12&&!insertRefused;n++){const r=await h.post('/api/gauge/command',{key:randomUUID(),...(n?{action:'import:resume',id:inserting.id}:{action:'import:create',package:another,fingerprint:nextPreview.fingerprint})},owner);if(r.status===409)insertRefused=true;else{assert.equal(r.status,200);inserting=await r.json()}}assert(insertRefused,'Locked historical work cannot enter through import batches')
 assert(!(await state()).data.time.some(t=>t.value.source?.namespace==='harvest:timesheet-lock-insert'))
 await page.goto(sheetUrl);await capture('timesheet-locked');await capture('timesheet-lock-policy',page.locator('#timesheet-policy'))
 await signIn(owner);await page.goto(sheetUrl)
 const policyForm=page.locator('form').filter({has:page.locator('[name=action][value="time:policy"]')})
 await policyForm.getByLabel('Locked through (blank reopens all)',{exact:true}).fill('2026-10-04');await policyForm.getByLabel('Policy change or reopening reason',{exact:true}).fill('Owner reopens the exact week for an audited correction')
 await capture('timesheet-policy-editor',policyForm);await policyForm.getByRole('button',{name:'Save policy',exact:true}).click()
 policy=(await state()).data.timePolicies[0];assert.equal(policy.value.lockThrough,'2026-10-04')
 let correction=await cmd('time:correct',{...first,reason:'Replace rounded meeting estimate with actual elapsed time'},manager.cookie)
 correction=await cmd('time:save',{...first.value,...correction,start:'2026-10-05T09:00:00-04:00',end:'2026-10-05T10:00:01-04:00',notes:'Confirmed exact elapsed interval'},staff.cookie)
 correction=await cmd('time:submit',correction,staff.cookie);await cmd('time:approve',correction,manager.cookie)
 const staffHistory=await (await request(`/api/gauge/history/time/${first.id}`,staff.cookie)).json()
 assert(staffHistory.history.some(r=>r.value.status==='approved'&&r.value.approvedBy===manager.id&&r.value.durationSeconds===4020));assert(staffHistory.history.every(r=>r.value.economics===undefined),'A worker sees original approval and duration without private rates/costs')
 const history=await (await request(`/api/gauge/history/time/${first.id}`,owner)).json()
 assert(history.history.some(r=>r.value.status==='approved'&&r.value.approvedBy===manager.id&&r.value.durationSeconds===4020&&r.value.economics.roundedBillingSeconds===4500),'Original approver, duration and billing-rounding snapshot remain in history')
 const policyHistory=await (await request(`/api/gauge/history/timePolicies/${policy.id}`,owner)).json();assert(policyHistory.history.some(r=>r.value.lockThrough==='2026-10-08'&&r.value.reason==='Weekly timesheet approval cutoff'))
 const latest=(await state()).data.time.find(t=>t.id===first.id);assert.equal(latest.value.durationSeconds,3601);assert.equal(latest.value.approvedBy,manager.id)
 await signIn(staff.cookie);await page.goto(sheetUrl);await capture('timesheet-corrected')
 await timeReviewJourney(h,{page,signIn,capture,worker,lead,staff,manager,task,project,zone})
 console.log('PASS TIME-003 / TIME-007: daily/week grid, favorites/recent copy, atomic bulk submit, missing/status, audited lock/reopen, import guards and exact approval history')
}finally{await browser?.close();await h.dispose()}
