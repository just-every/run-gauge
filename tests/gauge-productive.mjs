import assert from 'node:assert/strict'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {productiveFixture} from './fixtures/productive.mjs'
import {sourceJourney} from './fixtures/scoro-journey.mjs'
import {inFormat} from './fixtures/scoro-formats.mjs'
export const productiveJourney=()=>sourceJourney({provider:'productive',name:'Productive',pkg:productiveFixture(),version:'v2',invalid:[['retainer opening mismatch',p=>p.files['retainers.csv']=p.files['retainers.csv'].replace('"25000"','"25001"')],['rate does not cover work date',p=>p.files['rates.csv']=p.files['rates.csv'].replace('"2026-03-01"','"2026-03-09"')],['missing draft attribution',p=>p.files['attributions.csv']=p.files['attributions.csv'].replace('"draft1"','""')]],async verify({h,report}){
 const draft=report.records.time.find(t=>t.id==='t1'),manual=report.records.time.find(t=>t.id==='t2');assert(draft.billed&&draft.draftInvoiced);assert(manual.billed&&manual.invoicedManually);assert.equal(draft.rawSeconds,7200);assert.equal(draft.billableSeconds,5400);assert.equal(draft.billMinor,27000);assert.equal(draft.costMinor,20000);assert.equal(draft.rateId,'r2');assert.equal(report.records.rates.find(r=>r.id==='r2').effective,'2026-03-01');assert.equal(report.records.retainers[0].openingMinor,25000);assert.equal(report.records.budgets[0].recurring,true);assert.equal(report.records.timeVersions.length,3);for(const a of report.records.attributions)assert.equal(a.invoiceNumber,'')
 const numeric=inFormat(productiveFixture(),'time','json',{version:'v2'});numeric.files['time-1.json']=numeric.files['time-1.json'].replace('\"worked\":\"120\"','\"worked\":120.000000000000000001');await h.cmd('import:productive:preview',{package:numeric},h.owner,400)
 const duplicate=inFormat(productiveFixture(),'time','json',{version:'v2'});duplicate.files['time-1.json']=duplicate.files['time-1.json'].replace('\"worked\":\"120\"','\"worked\":\"120\",\"worked\":\"120\"');await h.cmd('import:productive:preview',{package:duplicate},h.owner,400)
 const major=productiveFixture();major.manifest.objects.time[0].moneyUnit='decimal-major';major.files['time.csv']=major.files['time.csv'].replace('\"27000\"','\"270.00\"').replace('\"20000\"','\"200.00\"').replace('\"18000\"','\"180.00\"').replace('\"10000\"','\"100.00\"');assert.deepEqual((await h.cmd('import:productive:preview',{package:major})).financial,report.groups,'Exact decimal source money reconciles in integer minor units')
 const wrong=productiveFixture();wrong.manifest.units.time='hours';await h.cmd('import:productive:preview',{package:wrong},h.owner,400)
},async after({h,job}){
 const native=(await h.state()).data,project=native.engagements[0];assert.equal(native.invoices.length,0);await h.cmd('budget:approve',await h.cmd('save:budgets',{engagementId:project.id,mode:'hourly',amountMinor:200000,effortSeconds:10800,roundingSeconds:1,reason:'Fresh native review of source drafts'}))
 for(const t of native.time){assert(t.value.source.billed);const approved=await h.cmd('time:approve',await h.cmd('time:submit',t));await h.cmd('packet:create',{engagementId:project.id,title:'Must not rebill source draft or manual attribution',sources:['time:'+approved.id]},h.owner,400)}
 await h.cmd('import:productive:undo',{id:job.id},h.owner,409)
}})
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await productiveJourney()
