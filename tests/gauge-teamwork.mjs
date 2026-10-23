import assert from 'node:assert/strict'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {teamworkFixture} from './fixtures/teamwork.mjs'
import {sourceJourney} from './fixtures/scoro-journey.mjs'
import {inFormat} from './fixtures/scoro-formats.mjs'
export const teamworkJourney=()=>sourceJourney({provider:'teamwork',name:'Teamwork.com',pkg:teamworkFixture(),version:'v3',invalid:[['retainer deficit carry',p=>p.files['retainers.csv']=p.files['retainers.csv'].replace('"-30000"','"-29999"')],['cross-project task list',p=>p.files['tasks.csv']=p.files['tasks.csv'].replace('"list1"','"missing"')]],async verify({h,report}){
 const t=report.records.time.find(t=>t.id==='t1');assert.equal(t.minutes,90);assert.equal(t.rawSeconds,5400);assert.equal(t.workDate,'2026-03-08');assert.equal(t.auditTimestamp,'2026-03-09T00:30:00Z');assert.equal(t.billed,true);assert.equal(report.records.time.find(t=>t.id==='t2').billed,false);assert.equal(report.records.projects[0].archived,true);assert.equal(report.records.proofs[0].decision,'approved');assert.equal(report.records.tasks.find(t=>t.id==='sub1').parentId,'task1');assert.equal(report.records.dependencies[0].predecessorId,'task1');const periods=report.records.retainers.sort((a,b)=>a.from.localeCompare(b.from));assert.equal(periods[0].closingMinor,20000);assert.equal(periods[1].openingMinor,20000);assert.equal(periods[1].closingMinor,-30000);assert.equal(periods[1].carryOutMinor,-30000)
 const native=(await h.state()).data;assert.equal(native.time.find(t=>t.value.source.externalId==='t1').value.workDate,'2026-03-08');assert(native.time.every(t=>t.value.status==='draft'));assert.equal(native.invoices.length,0);assert.equal(native.retainers.length,0,'Source retainer carry has no native billing authority')
 const v1=inFormat(teamworkFixture(),'time','json',{version:'v1',pages:2});assert((await h.cmd('import:teamwork:preview',{package:v1})).canApply,'Both v1 and v3 captures are accepted')
}})
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await teamworkJourney()
