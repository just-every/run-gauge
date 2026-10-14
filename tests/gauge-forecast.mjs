import assert from 'node:assert/strict'
import test from 'node:test'
import {harness} from './gauge-harness.mjs'
import {forecastPackage} from './fixtures/forecast.mjs'

test('Forecast move-in preserves source hours on reviewed working dates, with replay and strict undo',async()=>{
 const h=await harness(),pack=await forecastPackage()
 const report=async()=>{
  const response=await h.request('/api/gauge/state?from=2026-11-02&to=2026-11-08',h.owner)
  assert.equal(response.status,200)
  return response.json()
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
  for(const workingDates of [pack.manifest.schedulePeriods.Week.workingDates,['2026-11-02','2026-11-04','2026-11-05','2026-11-06'],['2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07']]){
   pack.manifest.schedulePeriods.Week.workingDates=workingDates
   pack.manifest.schedulePeriods.Week.workingDays=workingDates.length
   const job=await importPack(pack),data=await report(),capacity=data.capacity[0]
   assert.equal(capacity.tentativeSeconds,20*3600)
   assert.equal(capacity.committedSeconds,0)
   assert.deepEqual(capacity.days.filter(day=>day.tentativeSeconds>0).map(day=>day.date),workingDates)
   for(const day of capacity.days)assert.equal(day.tentativeSeconds,workingDates.includes(day.date)?20*3600/workingDates.length:0)
   assert(data.data.staffing.every(row=>row.value.source.periodTotalSeconds===20*3600))
   const repeat=await importPack(pack)
   assert.equal((await report()).capacity[0].tentativeSeconds,20*3600,'replay does not duplicate hours')
   assert.equal((await finish(await h.cmd('import:undo',{id:repeat.id}))).state,'undone')
   assert.equal((await finish(await h.cmd('import:undo',{id:job.id}))).state,'undone')
   assert.equal((await report()).data.staffing.length,0)
  }
  const period=pack.manifest.schedulePeriods.Week
  for(const change of [{workingDates:undefined},{workingDays:4},{workingDays:5.5},{workingDates:['2026-11-02','2026-11-02','2026-11-04','2026-11-05','2026-11-06']},{workingDates:['2026-11-01','2026-11-03','2026-11-04','2026-11-05','2026-11-06']},{to:'2026-11-01'}]){
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
