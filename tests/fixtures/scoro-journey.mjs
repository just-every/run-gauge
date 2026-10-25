import assert from 'node:assert/strict'
import {mkdir,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {chromium} from '@playwright/test'
import {harness} from '../gauge-harness.mjs'
import {csv} from './scoro.mjs'
import {inFormat,csvRows} from './scoro-formats.mjs'
import {sourceRestore} from './scoro-restore.mjs'
// Reconciliation is exercised through the same public import door for each provider.
export async function reconciliationRefusals(h,provider,pkg) {
 const action=verb=>'import:'+provider+':'+verb
 const before=await h.db.prepare('SELECT count(*) n FROM ik_jobs').first()
 const cases=[
  ['administrator',p=>delete p.manifest.administrator,/administrator/],
  ['source history',p=>delete p.manifest.historyRange,/history range/],
  ['omitted historical edge',p=>p.manifest.historyRange.from='2020-01-01',/history range/],
  ['truncated original',p=>p.manifest.objects.time[0].complete=false,/truncated/],
  ['filtered original',p=>p.manifest.objects.time[0].filters='active-only',/Filtered/],
  ['missing all controls',p=>delete p.manifest.controls,/source counts/],
  ['missing client controls',p=>delete p.manifest.controls.clientFinancial,/client, month and currency/],
  ...['rawSeconds','billableSeconds','costMinor','invoiceMinor','paidMinor','outstandingMinor','openingMinor','closingMinor','carryInMinor','carryOutMinor'].map(metric=>[metric,p=>Object.values(p.manifest.controls.clientFinancial)[0][metric]++,/client, month and currency/]),
  ['unknown outstanding',p=>Object.values(p.manifest.controls.clientFinancial)[0].outstandingMinor=null,/client, month and currency/],
  ['wrong source currency',p=>{const key=Object.keys(p.manifest.controls.clientFinancial)[0],value=p.manifest.controls.clientFinancial[key];delete p.manifest.controls.clientFinancial[key];p.manifest.controls.clientFinancial[key.replace('USD','CAD')]=value},/client, month and currency/],
 ]
 for(const [label,alter,reason]of cases){
  const bad=structuredClone(pkg);alter(bad)
  const preview=await h.cmd(action('preview'),{package:bad})
  assert.equal(preview.canApply,false,provider+' '+label)
  assert(preview.findings.some(f=>reason.test(f.reason)),JSON.stringify(preview.findings))
  await h.cmd(action('create'),{package:bad,fingerprint:preview.fingerprint,confirm:'adopt-reviewed-native-drafts'},h.owner,400)
 }
 assert.deepEqual(await h.db.prepare('SELECT count(*) n FROM ik_jobs').first(),before,'Rejected completeness creates no journal or effects')
 if(pkg.files['retainers.csv']){
  const retainerValue=(p,value)=>{const rows=csvRows(p.files['retainers.csv']),column=rows[0].indexOf(p.manifest.objects.retainers[0].columns.closingMinor);rows[1][column]=value===null?'':String(Number(rows[1][column])===0?1:-Number(rows[1][column]));p.files['retainers.csv']=csv(rows.slice(1).map(row=>Object.fromEntries(rows[0].map((header,index)=>[header,row[index]]))))}
  for(const [label,alter]of [
   ['missing retainer permission',p=>p.manifest.permissions.retainers=false],
   ['wrong signed retainer balance',p=>retainerValue(p,'signed')],
   ['unknown retainer balance',p=>retainerValue(p,null)],
   ['missing independent retainer balance',p=>delete Object.values(p.manifest.controls.clientFinancial)[0].openingMinor]
  ]){const bad=structuredClone(pkg);alter(bad);const response=await h.post('/api/gauge/command',{action:action('preview'),key:crypto.randomUUID(),package:bad},h.owner);assert([200,400].includes(response.status));const preview=await response.json();if(response.status===200){assert.equal(preview.canApply,false,label);await h.cmd(action('create'),{package:bad,fingerprint:preview.fingerprint},h.owner,400)}}
 }
 for(const [kind,metric]of [['time','costMinor'],['rates','costRateMinor'],['time','billMinor']]){
  const cfg=pkg.manifest.objects[kind]?.[0]
  if(!cfg||cfg.format!=='csv')continue
  const header=cfg.columns[metric]
  if(!header)continue
  const {csvRows}=await import('./scoro-formats.mjs'),matrix=csvRows(pkg.files[cfg.artifact]),column=matrix[0].indexOf(header)
  for(const invalid of ['', 'unknown', '0.10000000000000001', '9007199254740993']){
   const bad=structuredClone(pkg),rows=structuredClone(matrix);rows[1][column]=invalid
   bad.files[cfg.artifact]=rows.map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\n')+'\n'
   await h.cmd(action('preview'),{package:bad},h.owner,400)
  }
 }
 const corrected=await h.cmd(action('preview'),{package:pkg})
 assert(corrected.canApply);assert.deepEqual(corrected.clientFinancial,pkg.manifest.controls.clientFinancial)
 await interruptedSourceJourney(provider,pkg)
 if(pkg.files['payments.csv']){
  const later=structuredClone(pkg),paid=Object.values(pkg.manifest.controls.financial).reduce((n,v)=>n+v.paidMinor,0)
  later.files['payments.csv']=later.files['payments.csv'].replaceAll('2026-03-08','2026-04-08')
  for(const dimension of ['financial','clientFinancial']){
   const controls=later.manifest.controls[dimension],key=Object.keys(controls).find(k=>k.includes('2026-03')&&controls[k].invoiceMinor),next=key.replace('2026-03','2026-04')
   controls[key].paidMinor=0
   controls[next]??=Object.fromEntries(Object.keys(controls[key]).map(k=>[k,0]));controls[next].paidMinor=paid
  }
  const p=await h.cmd(action('preview'),{package:later});assert(p.canApply,JSON.stringify(p.findings))
  assert.deepEqual(p.clientFinancial,later.manifest.controls.clientFinancial,'Cash follows payment month; outstanding follows the original invoice cohort')
 }
 const changed=structuredClone(pkg);changed.manifest.historyRange.to='2027-12-31';changed.manifest.windows.push({from:'2027-01-01',to:'2027-12-31',complete:true})
 // History-only changes still require a fresh reviewed fingerprint.
 const renewed=await h.cmd(action('preview'),{package:changed})
 if(renewed.canApply)await h.cmd(action('create'),{package:changed,fingerprint:corrected.fingerprint,confirm:'adopt-reviewed-native-drafts'},h.owner,409)
}
async function interruptedSourceJourney(provider,pkg) {
 let fresh=await harness({currency:'USD',timezone:'America/New_York'})
 const directory=fresh.directory,action=verb=>'import:'+provider+':'+verb,source=structuredClone(pkg)
 source.manifest.nativeDrafts=false
 try {
  const preview=await fresh.cmd(action('preview'),{package:source})
  let job=await fresh.cmd(action('create'),{package:source,fingerprint:preview.fingerprint})
  assert.equal(job.state,'applying');assert(job.checkpoint>0&&job.checkpoint<job.total)
  const checkpoint=job.checkpoint
  await fresh.close();fresh=await harness({currency:'USD',persistenceDirectory:directory})
  assert.equal((await fresh.cmd(action('read'),{id:job.id})).checkpoint,checkpoint,'Actual Worker restart retains the bounded checkpoint')
  while(job.state==='applying')job=await fresh.cmd(action('resume'),{id:job.id})
  assert.equal(job.state,'completed')
  assert.deepEqual((await fresh.cmd(action('report'),{namespace:preview.namespace,groupBy:'client'})).groups,pkg.manifest.controls.clientFinancial)
  const again=await fresh.cmd(action('preview'),{package:source})
  let replay=await fresh.cmd(action('create'),{package:source,fingerprint:again.fingerprint})
  while(replay.state==='applying')replay=await fresh.cmd(action('resume'),{id:replay.id})
  assert.deepEqual((await fresh.cmd(action('report'),{namespace:preview.namespace,groupBy:'client'})).groups,pkg.manifest.controls.clientFinancial,'Restart and replay preserve exact source totals')
  for(let reverse of [replay,job]){reverse=await fresh.cmd(action('undo'),{id:reverse.id});while(reverse.state==='undoing')reverse=await fresh.cmd(action('resume'),{id:reverse.id});assert.equal(reverse.state,'undone')}
  await fresh.cmd(action('report'),{namespace:preview.namespace},fresh.owner,404)
  assert((await fresh.cmd(action('originals'),{id:job.id})).some(a=>a.name==='move-in-manifest.json'),'Undo retains controls and coverage manifest')
 } finally {await fresh.close();await rm(directory,{recursive:true,force:true})}
}
/** Shared public transport/custody assertions; provider acceptance remains in
 * its own journey callback, with independent manually supplied source totals. */
export async function sourceJourney({provider,name,pkg,verify,invalid=[],formats=['xlsx','json'],version='v1',after}){
 const h=await harness({currency:'USD',timezone:'America/New_York'}),{cmd,owner,state,request}=h,action=v=>'import:'+provider+':'+v;let browser
 try{
  const p=await cmd(action('preview'),{package:pkg});assert(p.canApply,JSON.stringify(p.findings));assert.deepEqual(p.financial,pkg.manifest.controls.financial);assert.equal((await state()).data.time.length,0)
  await reconciliationRefusals(h,provider,pkg)
  for(const [reason,alter]of [['permission',p=>p.manifest.authorized=false],['missing window',p=>p.manifest.windows[0].complete=false],...invalid]){const bad=structuredClone(pkg);alter(bad);const preview=await cmd(action('preview'),{package:bad});assert(!preview.canApply,reason);await cmd(action('create'),{package:bad,fingerprint:preview.fingerprint,confirm:'adopt-reviewed-native-drafts'},owner,400)}
  const currency=structuredClone(pkg);currency.manifest.currency='CAD';await cmd(action('preview'),{package:currency},owner,400)
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage();await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  const shots=process.env.GAUGE_MOVEIN_SHOTS;if(shots)await mkdir(shots,{recursive:true})
  const capture=async(stage,selector='#'+provider+'-import')=>{for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),provider+' '+stage+' fits '+width);const icons=await page.locator('button,a,summary').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()&&n.querySelector('svg,img')).map(n=>n.outerHTML));assert.deepEqual(icons,[],'All Imports controls have visible text');if(shots)await page.locator(selector).screenshot({path:join(shots,provider+'-'+stage+'-'+width+'.png')})}}
  await page.goto(h.origin+'/app/imports');const form=page.locator('form').filter({has:page.locator('[name=action][value="'+action('preview')+'"]')});await form.getByLabel(name+' package JSON').fill(JSON.stringify(pkg));await form.getByRole('button',{name:'Preview '+name+' import'}).click();assert.match(await page.locator('#'+provider+'-preview').innerText(),/Every declared source control reconciles/);await page.locator('#'+provider+'-preview').getByText('Independent client and currency controls',{exact:true}).click();assert((await page.locator('#'+provider+'-preview').innerText()).includes('outstandingMinor'));await capture('preview')
  const apply=async pack=>{const preview=await cmd(action('preview'),{package:pack});assert(preview.canApply,JSON.stringify(preview.findings));let j=await cmd(action('create'),{package:pack,fingerprint:preview.fingerprint,confirm:'adopt-reviewed-native-drafts'});while(j.state==='applying')j=await cmd(action('resume'),{id:j.id});assert.equal(j.state,'completed');return j}
  const job=await apply(pkg),report=await cmd(action('report'),{namespace:p.namespace});assert.deepEqual(report.groups,pkg.manifest.controls.financial);await verify({h,report,preview:p,job,apply})
  const original=await(await request('/api/gauge/imports/'+job.id,owner)).json();for(const [file,content]of Object.entries(pkg.files))assert.equal(original.find(a=>a.name===file).original.base64,/\.xlsx?$/.test(file)?content:Buffer.from(content).toString('base64'),'Original '+file)
  const count=(await state()).data.time.length;await apply(pkg);assert.equal((await state()).data.time.length,count,'Replay cannot duplicate native time')
  for(const format of formats){const pack=inFormat(pkg,'time',format,{version,pages:2});await apply(pack);assert.equal((await state()).data.time.length,count,format+' replay cannot duplicate native time')}
  await page.goto(h.origin+'/app/imports');const reportForm=page.locator('form').filter({has:page.locator('[name=action][value="'+action('report')+'"]')});await reportForm.getByRole('button',{name:'Read '+name+' source controls'}).click();assert.match(await page.locator('#'+provider+'-report').innerText(),/Historical source controls/);await capture('report')
  const staff=await h.invite(provider+'-staff'),person=(await state()).data.people[0]??await cmd('save:people',{name:'Scoped worker',timezone:'America/New_York'});await cmd('grant',{operatorId:staff.id,personId:person.id,role:'staff',enabled:true});await cmd(action('report'),{namespace:p.namespace},staff.cookie,403);await cmd(action('preview'),{package:pkg},staff.cookie,403);assert.equal((await request('/api/gauge/imports/'+job.id,staff.cookie)).status,403)
  for(const t of (await state(staff.cookie)).data.time){assert.equal(t.value.source.costMinor,undefined);assert.equal(t.value.source.billMinor,undefined);assert.equal(t.value.source.sourceEvidence,undefined)}
  const scratch=structuredClone(pkg);scratch.manifest.account='synthetic-gauge-2';scratch.manifest.nativeDrafts=false;const scratchPreview=await cmd(action('preview'),{package:scratch});let partial=await cmd(action('create'),{package:scratch,fingerprint:scratchPreview.fingerprint});assert.equal(partial.state,'applying','Source evidence applies in bounded batches');let reversed=await cmd(action('rollback'),{id:partial.id});while(reversed.state==='rolling_back')reversed=await cmd(action('resume'),{id:partial.id});assert.equal(reversed.state,'rolled_back');await cmd(action('report'),{namespace:scratchPreview.namespace},owner,404);const complete=await apply(scratch);let undone=await cmd(action('undo'),{id:complete.id});while(undone.state==='undoing')undone=await cmd(action('resume'),{id:complete.id});assert.equal(undone.state,'undone');await cmd(action('report'),{namespace:scratchPreview.namespace},owner,404);assert((await cmd(action('originals'),{id:complete.id})).length>0,'Reversal retains originals and the reviewed manifest')
  if(after)await after({h,report,preview:p,job,apply,staff,page,capture})
  if(pkg.manifest.nativeDrafts){const task=(await state()).data.tasks[0];await cmd('save:tasks',{...task,...task.value,remainingSeconds:300});let refused=false;for(let n=0;n<20&&!refused;n++){const response=await h.post('/api/gauge/command',{action:action(n===0?'undo':'resume'),id:job.id,key:'synthetic-gauge-undo-'+n},owner);if(response.status===409)refused=true;else{assert.equal(response.status,200);assert.equal((await response.json()).state,'undoing','Undo must not complete over a later native edit')}}assert(refused,'Bounded undo reaches and refuses the later native edit');assert.equal((await state()).data.tasks.find(t=>t.id===task.id).value.remainingSeconds,300,'Undo preserves later native task edits')}
  await sourceRestore(h,provider);await context.close();console.log('PASS '+provider+'Journey: provider source semantics, independent controls, original custody, format/replay/privacy/restore, public Imports at 1440/390')
 }finally{await browser?.close();await h.dispose()}
}
