import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { floatFixture } from './fixtures/float.mjs'
import { sourceJourney } from './fixtures/scoro-journey.mjs'
export const floatJourney = () => sourceJourney({
 provider:'float',name:'Float',pkg:floatFixture(),version:'v3',
 invalid:[
  ['missed deletion coverage',p=>p.manifest.deletionCoverage={...p.manifest.deletionCoverage,missed:true,missedAt:'2026-03-05T12:00:00Z'}],
  ['incomplete deletion coverage',p=>p.manifest.deletionCoverage.complete=false],
  ['gap in deletion sequence',p=>p.manifest.deletionCoverage.toSequence=2],
  ['phase budget disagreement',p=>p.files['allocations-2026.csv']=p.files['allocations-2026.csv'].replace('"100000"','"100001"')],
  ['historical cost disagreement',p=>p.files['time-2026.csv']=p.files['time-2026.csv'].replace('"20000"','"20001"')],
  ['unproved native adoption',p=>p.manifest.nativeDrafts=true]
 ],
 async verify({h,report,preview}) {
  assert.equal(report.records.budgets.length,1,'Repeated task-row phase budgets retain one source budget')
  assert.equal(report.records.allocations.length,3,'Deleted allocation stays in historical custody')
  assert.equal(report.records.allocations.find(r=>r.id==='a3').sourceDeleted,true)
  assert.equal(report.records.deletions.length,1,'Duplicate deletion events are applied once')
  assert.deepEqual(report.records.allocations.find(r=>r.id==='a1').daily.map(d=>d.seconds),[5400,1800])
  const workweeks=report.records.workweeks.sort((a,b)=>a.from.localeCompare(b.from))
  assert.equal(workweeks[0].weekdays[1],28800);assert.equal(workweeks[1].weekdays[1],21600)
  assert.equal(report.records.leave[0].seconds,3600)
  assert.equal(report.records.time.find(t=>t.id==='t1').costMinor,9000)
  assert.equal(report.records.time.find(t=>t.id==='t2').costMinor,20000)
  assert.equal((await h.state()).data.time.length,0,'Source comparison does not create or erase native time')
  const fresh=floatFixture();fresh.manifest.deletionCoverage={complete:true,fromSequence:1,toSequence:1,missed:true,missedAt:'2026-03-05T12:00:00Z',fullComparison:{complete:true,asOf:'2026-03-06T12:00:00Z',artifacts:Object.keys(fresh.files)}}
  const reviewed=await h.cmd('import:float:preview',{package:fresh});assert(reviewed.canApply,JSON.stringify(reviewed.findings))
  fresh.manifest.deletionCoverage.fullComparison.asOf='2026-03-04T12:00:00Z';assert.equal((await h.cmd('import:float:preview',{package:fresh})).canApply,false,'Old comparison cannot repair missed deletion coverage')
  fresh.manifest.deletionCoverage.fullComparison.asOf='2026-03-06T12:00:00Z';fresh.manifest.deletionCoverage.fullComparison.artifacts=[];assert.equal((await h.cmd('import:float:preview',{package:fresh})).canApply,false,'Every original is required for fresh full comparison')
  await h.cmd('import:float:cutover',{namespace:preview.namespace},h.owner,409)
 }
})
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await floatJourney()
