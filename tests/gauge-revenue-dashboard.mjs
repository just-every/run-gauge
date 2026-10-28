import assert from 'node:assert/strict'
import {invoiceDashboardJourney} from './gauge-invoices.mjs'
import {execFileSync} from 'node:child_process'
import {mkdir} from 'node:fs/promises'
import {chromium} from '@playwright/test'

// REPORT-003 / REPORT-008 native slice, composed into the cash journey rather than a new suite.
export async function revenueDashboardJourney(h,{worker,client,hourly,entry}) {
 const {cmd,owner,request}=h,asOf='2026-10-19'
 const read=async(cookie=owner)=>{const response=await request(`/api/gauge/state?from=2026-10-01&to=2026-10-31&asOf=${asOf}`,cookie);assert.equal(response.status,200);return response.json()}
 const initial=await read(),bucket=d=>d.revenueDashboard.wip.find(w=>w.currency==='USD')
 assert.equal(bucket(initial).amountMinor,60000)
 const opportunityInput={name:'Mobile redesign',clientId:client.id,ownerId:worker.id,stage:'proposal',probability:50,from:'2026-11-01',to:'2026-11-30',services:'Design',amountMinor:400000,demandSeconds:36000}
 let opportunity=await cmd('save:opportunities',opportunityInput)
 let d=await read(),pipeline=d.pipeline.find(p=>p.currency==='USD')
 assert.equal(pipeline.weightedMinor,200000)
 const beforeWon=pipeline.bookedMinor
 opportunity=await cmd('save:opportunities',{...opportunityInput,...opportunity,stage:'won',probability:100})
 d=await read();pipeline=d.pipeline.find(p=>p.currency==='USD')
 assert.equal(pipeline.weightedMinor,0);assert.equal(pipeline.bookedMinor,beforeWon+400000)
 const converted=await cmd('opportunity:convert',opportunity)
 assert(converted.id)
 d=await read();const budget=d.data.budgets.find(b=>b.value.engagementId===converted.id)
 await cmd('budget:approve',budget)
 d=await read();assert.equal(d.pipeline.find(p=>p.currency==='USD').bookedMinor,beforeWon+400000,'REPORT-003 conversion replaces won source with approved terms once')
 let packet=await cmd('packet:create',{engagementId:hourly.id,title:'Support billing preparation',sources:[`time:${entry.id}`]})
 packet=await cmd('packet:approve',packet)
 d=await read();assert.equal(bucket(d).amountMinor,60000,'REPORT-003 packet approval does not issue or remove WIP')
 const expense=await cmd('expense:save',{engagementId:hourly.id,personId:worker.id,date:'2026-10-06',description:'Client materials',amountMinor:2500,reimbursable:true})
 await cmd('expense:approve',await cmd('expense:submit',expense))
 const nonbillable=await cmd('expense:save',{engagementId:hourly.id,personId:worker.id,date:'2026-10-06',description:'Agency lunch',amountMinor:8000,reimbursable:false})
 await cmd('expense:approve',await cmd('expense:submit',nonbillable))
 const task=(await read()).data.tasks.find(t=>t.value.engagementId===hourly.id)
 const future=await cmd('time:save',{taskId:task.id,personId:worker.id,engagementId:hourly.id,service:'Support',notes:'Later approved interval',timezone:'America/New_York',billable:true,start:'2026-10-20T09:00:00-04:00',end:'2026-10-20T10:00:00-04:00'})
 await cmd('time:approve',await cmd('time:submit',future))
 d=await read();assert.equal(bucket(d).amountMinor,62500,'REPORT-003 as-of excludes future approved work and nonreimbursable expenses')
 assert(!bucket(d).sources.some(s=>s.id===future.id||s.id===nonbillable.id))
 const figure=d.lineage.find(f=>f.id==='revenue:USD:wipMinor')
 assert.equal(figure.value,62500);assert(figure.sources.some(s=>s.id===entry.id));assert(figure.sources.some(s=>s.id===expense.id));assert(figure.sources.some(s=>s.kind==='rates'));assert(figure.sources.some(s=>s.kind==='budgets'))
 const csvPath='/api/gauge/report.csv?'+new URLSearchParams({from:d.from,to:d.to,asOf,fingerprint:d.fingerprint})
 const csv=await request(csvPath,owner);assert.equal(csv.status,200)
 const rows=JSON.parse(execFileSync('python3',['-c','import csv,json,sys; print(json.dumps([r for r in csv.reader(sys.stdin) if len(r)>1 and r[1]=="revenue:USD:wipMinor"]))'],{input:await csv.text(),encoding:'utf8'}))
 assert.equal(rows.find(r=>r[0]==='figure'&&r[1]===figure.id)[3],'62500')
 await captureRevenueDashboard(h,'known')
 await invoiceDashboardJourney(h,{worker,client,hourly,entry,packet})
 const terms={name:'Design care',frequency:'monthly',unit:'hours',allowance:144000,services:['Support'],consumes:'billable',proration:'calendar',start:'2026-10-01',end:'2026-10-31',renewal:'manual',noticeDays:30}
 const preview=await cmd('retainer:preview',{engagementId:hourly.id,operation:'terms',terms})
 await cmd('retainer:approve',{...preview.input,fingerprint:preview.fingerprint,reason:'Reviewed included support'})
 d=await read();assert.equal(bucket(d).amountMinor,2500,'REPORT-003 retainer-covered work is excluded from hourly WIP, expenses remain')
 assert(d.retainerBalances.some(b=>b.engagementId===hourly.id&&b.remaining===126000))
 assert.equal((await request(csvPath,owner)).status,409,'REPORT-003 stale CSV snapshot refuses after commercial inputs change')
 // Removing a bill rate is not simulated: a second real worker has no rate at approval.
 const unknown=await cmd('save:people',{name:'Unpriced specialist',timezone:'America/New_York'})
 const project=await cmd('save:engagements',{name:'Unpriced discovery',clientId:client.id,leadId:worker.id,members:[unknown.id],scope:'Rate pending',timezone:'America/New_York'})
 await cmd('budget:approve',await cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:100000,effortSeconds:3600,roundingSeconds:1,reason:'Discovery ceiling'}))
 const missingTask=await cmd('save:tasks',{engagementId:project.id,name:'Discovery',remainingSeconds:3600})
 const missing=await cmd('time:save',{taskId:missingTask.id,personId:unknown.id,engagementId:project.id,service:'Discovery',notes:'Work pending agreed price',timezone:'America/New_York',billable:true,start:'2026-10-06T09:00:00-04:00',end:'2026-10-06T10:00:00-04:00'})
 await cmd('time:approve',await cmd('time:submit',missing))
 d=await read();assert.equal(bucket(d).amountMinor,null);assert.equal(bucket(d).knownMinor,2500);assert.deepEqual(bucket(d).unknownSources,[`time:${missing.id}`]);assert.equal(d.lineage.find(f=>f.id==='revenue:USD:wipMinor').value,null)
 for(const role of ['lead','staff','agent']){
  const person=await h.invite(`revenue-${role}`);await cmd('grant',{operatorId:person.id,personId:worker.id,role,enabled:true,...(role==='agent'?{purpose:'billing',engagementIds:[hourly.id]}:{})})
  const view=await read(person.cookie);assert.equal(view.revenueDashboard,null);assert(!view.lineage.some(f=>f.id.startsWith('revenue:')))
  assert(!(await(await request('/app/review',person.cookie)).text()).includes('id="revenue-dashboard"'))
 }
 console.log('PASS REPORT-003 / REPORT-008 native pipeline/won/conversion deduplication, exact hourly WIP and expense sources, as-of/retainer exclusions, packet distinction, unknown amounts, stale CSV and finance privacy; invoice/collection/provider acceptance remains partial')
}

export async function captureRevenueDashboard(h,name) {
 const shots=process.env.GAUGE_CASH_SHOTS
 if(!shots)return
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage()
  await context.addCookies(h.owner.split('; ').map(part=>{const at=part.indexOf('=');return {name:part.slice(0,at),value:part.slice(at+1),url:h.origin}}))
  await page.goto(h.origin+'/app/review?from=2026-10-01&to=2026-10-31&asOf=2026-10-19')
  await mkdir(shots,{recursive:true})
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`REPORT-003 ${name} fits ${width}`);await page.locator('#revenue-dashboard').screenshot({path:`${shots}/REPORT-003-${name}-${width}.png`})}
 }finally{await browser.close()}
}
