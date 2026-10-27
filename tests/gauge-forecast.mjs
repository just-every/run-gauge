import assert from 'node:assert/strict'
import test from 'node:test'
import {harness} from './gauge-harness.mjs'
import {forecastPackage,forecastMetadata} from './fixtures/forecast.mjs'

test('MIGRATE-003 Forecast move-in preserves source hours on reviewed working dates, with replay and strict undo',async()=>{
 const h=await harness(),pack=await forecastPackage()
 const report=async()=>{
  const response=await h.request('/api/gauge/state?from=2026-11-02&to=2026-11-08',h.owner)
  assert.equal(response.status,200)
  const state=await response.json(),{asOf,...snapshot}=state
  assert(Number.isFinite(Date.parse(asOf)),'report carries a read timestamp')
  // Reading again changes only observation time. Every business value, source
  // revision, formula and the snapshot fingerprint must remain identical.
  return {...snapshot,lineage:snapshot.lineage.map(({asOf:figureAsOf,...figure})=>{
   assert.equal(figureAsOf,asOf,'figures share the report observation time')
   return figure
  })}
 }
 const finish=async(job)=>{
  for(let n=0;n<20&&['queued','applying','undoing'].includes(job.state);n++)job=await h.cmd('import:resume',{id:job.id})
  return job
 }
 const importPack=async(source)=>{
  const before=await report(),preview=await h.cmd('import:preview',{package:source})
  assert.deepEqual(await report(),before,'preview does not write allocations')
  const job=await finish(await h.cmd('import:create',{package:source,fingerprint:preview.fingerprint}))
  assert.equal(job.state,'completed')
  return job
 }
 try{
  for(const alter of [p=>delete p.manifest.sourceCoverage.forecast,p=>p.manifest.sourceCoverage.forecast.pagesComplete=false,p=>p.manifest.sourceCoverage.forecast.administrator=false,p=>p.manifest.sourceCoverage.forecast.historyRange.to='2027-12-31']){const invalid=structuredClone(pack);alter(invalid);const p=await h.cmd('import:preview',{package:invalid});assert.equal(p.canApply,false);await h.cmd('import:create',{package:invalid,fingerprint:p.fingerprint},h.owner,400);assert.equal((await report()).data.staffing.length,0)}
  for(const workingDates of [pack.manifest.schedulePeriods.Week.workingDates,['2026-11-02','2026-11-04','2026-11-05','2026-11-06'],['2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07']]){
   pack.manifest.schedulePeriods.Week.workingDates=workingDates
   pack.manifest.schedulePeriods.Week.workingDays=workingDates.length
   const job=await importPack(pack),data=await report(),capacity=data.capacity[0]
   assert.equal(capacity.tentativeSeconds,20*3600)
   assert.equal(capacity.committedSeconds,0)
   assert.deepEqual(capacity.days.filter(day=>day.tentativeSeconds>0).map(day=>day.date),workingDates)
   for(const day of capacity.days)assert.equal(day.tentativeSeconds,workingDates.includes(day.date)?20*3600/workingDates.length:0)
   assert(data.data.staffing.every(row=>row.value.source.periodTotalSeconds===20*3600))
   assert(data.data.staffing.every(row=>row.value.source.externalId==='0:Week'),'existing Forecast source identities stay stable')
   const repeat=await importPack(pack)
   assert.equal((await report()).capacity[0].tentativeSeconds,20*3600,'replay does not duplicate hours')
   assert.equal((await finish(await h.cmd('import:undo',{id:repeat.id}))).state,'undone')
   assert.equal((await finish(await h.cmd('import:undo',{id:job.id}))).state,'undone')
   assert.equal((await report()).data.staffing.length,0)
  }
  const period=pack.manifest.schedulePeriods.Week
  for(const change of [{workingDays:4},{workingDays:5.5},{workingDates:['2026-11-02','2026-11-02','2026-11-04','2026-11-05','2026-11-06']},{workingDates:['2026-11-01','2026-11-03','2026-11-04','2026-11-05','2026-11-06']},{to:'2026-11-01'}]){
   const invalid=structuredClone(pack);invalid.manifest.schedulePeriods.Week={...period,...change}
   await h.cmd('import:preview',{package:invalid},h.owner,400)
   assert.equal((await report()).data.staffing.length,0,'invalid dates do not apply')
  }
  const editedJob=await importPack(pack),row=(await report()).data.staffing[0]
  await h.cmd('save:staffing',{...row,...row.value,dailySeconds:row.value.dailySeconds+60})
  const refused=await h.cmd('import:undo',{id:editedJob.id},h.owner,409)
  assert(refused)
  const edited=(await report()).data.staffing.find(value=>value.id===row.id)
  assert.equal(edited.value.dailySeconds,row.value.dailySeconds+60,'strict undo preserves later native edits')
 }finally{await h.dispose()}
})

test('MIGRATE-003 Project/Team rows/columns, weekly/monthly aggregates, API availability, holiday, leave and placeholders reconcile through import doors',async()=>{
 const h=await harness(),state=async()=>(await(await h.request('/api/gauge/state?from=2026-11-02&to=2026-11-08',h.owner)).json())
 const finish=async(job)=>{for(let n=0;n<30&&['queued','applying','undoing'].includes(job.state);n++)job=await h.cmd('import:resume',{id:job.id});return job}
 const apply=async(pack)=>{const preview=await h.cmd('import:preview',{package:pack}),job=await finish(await h.cmd('import:create',{package:pack,fingerprint:preview.fingerprint}));assert.equal(job.state,'completed');return {preview,job}}
 const undo=async(job)=>assert.equal((await finish(await h.cmd('import:undo',{id:job.id}))).state,'undone')
 try{
  for(const view of ['project','team'])for(const orientation of ['rows','columns'])for(const monthly of [false,true]){
   const pack=await forecastPackage(),period=pack.manifest.schedulePeriods.Week
   period.to=monthly?'2026-11-30':'2026-11-08';period.workingDates=['2026-11-02','2026-11-03','2026-11-05','2026-11-06'];period.workingDays=4
   pack.manifest.forecast={view,orientation,commitment:'committed'}
   const headers=view==='project'?'Person,Client,Project':'Person',values=view==='project'?'Synthetic person,Synthetic client,Synthetic project':'Synthetic person'
   pack.files['forecast.csv']=orientation==='rows'?`${headers},Period,Hours\n${values},Week,20\n`:`${headers},Week\n${values},20\n`
   forecastMetadata(pack)
   const {preview,job}=await apply(pack),data=await state()
   assert.equal(preview.schedule[0].totalSeconds,72000)
   assert.deepEqual(preview.schedule[0].workingDates,period.workingDates)
   assert.equal(data.capacity[0].committedSeconds,view==='project'?72000:0,'Team totals never manufacture project allocations')
   assert.equal(data.capacity[0].days.find(d=>d.date==='2026-11-04').committedSeconds,0,'holiday excluded by reviewed mapping')
   assert.equal(data.data.archives.filter(r=>r.value.forecast).length,1)
   assert.equal(preview.schedule[0].resolution,view==='project'?'Reviewed distribution; not original daily facts':'Aggregate only; excluded from daily staffing')
   const retained=data.data.archives.find(r=>r.value.forecast),download=await h.request('/api/gauge/archives/'+retained.id,h.owner)
   assert.equal(download.headers.get('content-type'),'application/json')
   const source=await download.json();assert.equal(source.totalSeconds,72000);assert.equal(source.view,view);assert.deepEqual(source.raw,orientation==='rows'?{Person:'Synthetic person',...(view==='project'?{Client:'Synthetic client',Project:'Synthetic project'}:{}),Period:'Week',Hours:'20'}:{Person:'Synthetic person',...(view==='project'?{Client:'Synthetic client',Project:'Synthetic project'}:{}),Week:'20'})
   await undo(job)
  }
  const aggregate=await forecastPackage();delete aggregate.manifest.schedulePeriods.Week.workingDates
  const {preview,job}=await apply(aggregate)
  assert.equal(preview.schedule[0].resolution,'Aggregate only; excluded from daily staffing');assert.equal((await state()).data.staffing.length,0)
  assert.equal((await state()).data.archives[0].value.forecast.totalSeconds,72000)
  await undo(job)
  const {capturedForecastPackage}=await import('./fixtures/forecast.mjs'),pack=await capturedForecastPackage()
  const remapped=structuredClone(pack),raw=JSON.parse(remapped.files['forecast.json'])
  remapped.manifest.forecastApi.durationUnit='decimal-hours'
  remapped.manifest.forecastApi.arrays={assignments:'bookings'}
  remapped.manifest.forecastApi.fields={assignments:{totalSeconds:'hours',personId:'person_id'},availability:{dailySeconds:'hours_per_day'}}
  raw.bookings={...raw.assignments,pages:raw.assignments.pages.map(page=>({...page,data:page.data.map(({totalSeconds,personId,...r})=>({...r,hours:totalSeconds/3600,person_id:personId}))}))};delete raw.assignments
  raw.availability.pages[0].data=raw.availability.pages[0].data.map(({dailySeconds,...r})=>({...r,hours_per_day:dailySeconds/3600}))
  remapped.files['forecast.json']=JSON.stringify(raw)
  const mapped=await h.cmd('import:preview',{package:remapped})
  assert.equal(mapped.schedule.find(r=>r.view==='assignment'&&!r.placeholder).totalSeconds,72000,'mapped capture fields use declared hours units')
  assert.equal(mapped.schedule.find(r=>r.view==='availability').dailySeconds,28800)
  for(const [label,alter]of [
   ['missing metadata',p=>delete p.files['forecast-metadata.json']],
   ['wrong independent count',p=>{const d=JSON.parse(p.files['forecast-metadata.json']);d.counts.people++;p.files['forecast-metadata.json']=JSON.stringify(d)}],
   ['wrong captured window',p=>{const d=JSON.parse(p.files['forecast-metadata.json']);d.historyRange.from='2025-01-01';p.files['forecast-metadata.json']=JSON.stringify(d)}],
   ['missing page',p=>{const d=JSON.parse(p.files['forecast.json']);d.people.pages[0].totalPages=2;d.people.pages[0].next='synthetic-gauge-page-2';p.files['forecast.json']=JSON.stringify(d)}],
   ['empty object count',p=>{const d=JSON.parse(p.files['forecast.json']);d.availability.pages[0].data=[];p.files['forecast.json']=JSON.stringify(d)}]
  ]){const bad=structuredClone(pack);alter(bad);const preview=await h.cmd('import:preview',{package:bad});assert.equal(preview.canApply,false,label);await h.cmd('import:create',{package:bad,fingerprint:preview.fingerprint},h.owner,400)}
  const paged=JSON.parse(pack.files['forecast.json']),peopleRows=paged.people.pages[0].data
  paged.people.pages=[{page:1,totalPages:2,totalCount:2,next:'synthetic-gauge-page-2',data:peopleRows.slice(0,1)},{page:2,cursor:'synthetic-gauge-page-2',totalPages:2,totalCount:2,next:null,data:peopleRows.slice(1)}]
  pack.files['forecast.json']=JSON.stringify(paged)
  const captured=await apply(pack),data=await state(),cap=data.capacity[0]
  assert.equal(cap.availableSeconds,30*3600,'four workdays minus two hours of leave')
  assert.equal(cap.committedSeconds,20*3600)
  assert.equal(cap.tentativeSeconds,0,'placeholder demand stays unfilled, not assigned to a real person')
  assert.equal(cap.days.find(d=>d.date==='2026-11-04').availableSeconds,0)
  assert.equal(cap.days.find(d=>d.date==='2026-11-05').leaveSeconds,7200)
  assert.equal(data.data.people.length,1,'placeholder creates no real person or authority')
  assert.equal(data.data.archives.find(r=>r.value.forecast?.placeholder).value.forecast.totalSeconds,36000)
  assert.equal(data.data.staffing.reduce((n,r)=>n+r.value.dailySeconds,0),72000,'project total matches independent API control')
  const replay=await apply(pack);assert.equal((await state()).data.staffing.length,4);await undo(replay.job)
  const originals=await(await h.request('/api/gauge/imports/'+captured.job.id,h.owner)).json()
  assert(JSON.stringify(originals).includes('forecast.json'),'retained API original is downloadable')
  const person=data.data.people[0],staff=await h.invite('forecast-staff');await h.cmd('grant',{operatorId:staff.id,personId:person.id,role:'staff',enabled:true})
  await h.cmd('import:preview',{package:pack},staff.cookie,403)
  const restricted=await(await h.request('/api/gauge/state?from=2026-11-02&to=2026-11-08',staff.cookie)).json()
  assert.equal(restricted.data.archives.length,0,'source snapshots use existing finance-only archive rights')
  const denied=await h.request('/api/gauge/archives/'+data.data.archives[0].id,staff.cookie);assert.equal(denied.status,403)
  for(const mutate of [p=>p.manifest.forecastApi.authorized=false,p=>p.manifest.forecastApi.durationUnit=undefined,p=>p.manifest.forecastApi.allocations.a1[0].seconds=1,p=>{const c=JSON.parse(p.files['forecast.json']);c.assignments.pages[0].data[0].personId='absent';p.files['forecast.json']=JSON.stringify(c)}]){const invalid=structuredClone(pack);mutate(invalid);await h.cmd('import:preview',{package:invalid},h.owner,400)}
  if(process.env.GAUGE_FORECAST_BROWSER){
   const {inspectForecast}=await import('./journeys/forecast-browser.mjs');await inspectForecast(h,pack)
  }
  const calendar=data.data.calendars[0];await h.cmd('save:calendars',{...calendar,...calendar.value,dailySeconds:25200})
  await h.cmd('import:undo',{id:captured.job.id},h.owner,409)
  assert.equal((await state()).data.calendars[0].value.dailySeconds,25200,'strict undo preserves native availability edits')
 }finally{await h.dispose()}
})
