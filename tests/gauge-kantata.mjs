import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve,join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { kantataFixture,oxApiFixture } from './fixtures/kantata.mjs'
import { workbook } from './fixtures/harvest-workbook.mjs'
import { harness } from './gauge-harness.mjs'
export async function kantataJourney(){
 const h=await harness({currency:'USD',timezone:'America/New_York'}),{cmd,owner,request,state}=h;let browser
 try{
  const ox=kantataFixture(),sx=kantataFixture('sx'),preview=await cmd('kantata:preview',{package:ox});assert(preview.canApply);assert.equal((await state()).data.kantataRecords.length,0,'Preview writes no product records')
  for(const [name,alter]of [['missing permission',p=>p.manifest.permissions.invoices=false],['incomplete year',p=>p.manifest.windows[1].complete=false],['count discrepancy',p=>p.manifest.controls.counts.time=3],['money discrepancy',p=>p.manifest.controls.financial['c1/2024-06/USD'].paidMinor=9999],['undefined Legacy option',p=>p.files['customValues.csv']=p.files['customValues.csv'].replace('Brand','Legacy')],['unresolved invoice relationship',p=>p.files['time.csv']=p.files['time.csv'].replace('"i1"','"missing-invoice"')]]){
   const p=structuredClone(ox);alter(p);const bad=await cmd('kantata:preview',{package:p});assert(!bad.canApply,name);assert(bad.findings.length,name);await cmd('kantata:create',{package:p,fingerprint:bad.fingerprint},owner,400);assert.equal((await state()).data.kantataRecords.length,0,name+' writes no records')
  }
  const wrong=structuredClone(sx);wrong.manifest.mapping.flavor='ox';await cmd('kantata:preview',{package:wrong},owner,400)
  const truncated=structuredClone(ox);truncated.manifest.windows[0].from='2024-02-01';await cmd('kantata:preview',{package:truncated},owner,400)
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage();await context.addCookies(owner.split('; ').map(part=>{const i=part.indexOf('=');return {name:part.slice(0,i),value:part.slice(i+1),url:h.origin}}))
  const shots=process.env.GAUGE_KANTATA_SHOTS;if(shots)await mkdir(shots,{recursive:true})
  const capture=async name=>{for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' fits '+width);if(shots)await page.locator('#kantata-import').screenshot({path:join(shots,`${name}-${width}.png`)})}}
  await page.goto(h.origin+'/app/imports');const form=page.locator('form').filter({has:page.locator('[name=action][value="kantata:preview"]')});await form.getByLabel('Kantata package JSON').fill(JSON.stringify(ox));await form.getByRole('button',{name:'Preview Kantata evidence'}).click();await capture('ox-preview');assert.match(await page.locator('#kantata-preview').innerText(),/Every declared source control reconciles/)
  let job=await cmd('kantata:create',{package:ox,fingerprint:preview.fingerprint});assert.equal(job.state,'applying','First bounded batch is resumable');const partial=(await state()).data.kantataRecords.length;assert(partial>0&&partial<18)
  const current=await cmd('kantata:read',{id:job.id});assert.equal(current.id,job.id);while(job.state==='applying')job=await cmd('kantata:resume',{id:job.id});assert.equal(job.state,'completed')
  const before=(await state()).data.kantataRecords,sourceCount=Object.values(ox.manifest.controls.counts).reduce((n,v)=>n+v,0);assert.equal(before.length,sourceCount)
  const replay=await cmd('kantata:preview',{package:ox});let repeat=await cmd('kantata:create',{package:ox,fingerprint:replay.fingerprint});while(repeat.state==='applying')repeat=await cmd('kantata:resume',{id:repeat.id});assert.equal((await state()).data.kantataRecords.length,sourceCount,'Replay does not duplicate source identities')
  const originals=await(await request('/api/gauge/imports/'+job.id,owner)).json();for(const [name,content]of Object.entries(ox.files))assert.equal(Buffer.from(originals.find(a=>a.name===name).original.base64,'base64').toString(),content,'Retained original '+name)
  const practice=await cmd('kantata:report',{namespace:preview.namespace,fieldId:'practice'}),brand=practice.groups.find(g=>g.dimension==='Brand');assert.equal(brand.timeSeconds,18000);assert.equal(brand.timeValueMinor,75000);assert.equal(brand.timeCostMinor,45000);assert.equal(brand.invoiceMinor,30000);assert.equal(brand.paidMinor,10000);assert.equal(brand.outstandingMinor,20000);assert.equal(brand.expenseMinor,2500);assert.equal(brand.wipMinor,45000)
  const office=await cmd('kantata:report',{namespace:preview.namespace,fieldId:'office'});assert.equal(office.groups.find(g=>g.dimension==='Austin').timeSeconds,18000)
  await page.goto(h.origin+'/app/imports');const reportForm=page.locator('form').filter({has:page.locator('[name=action][value="kantata:report"]')});await reportForm.getByLabel('Source account').selectOption(preview.namespace);await reportForm.getByLabel('Source custom field ID').fill('practice');await reportForm.getByRole('button',{name:'Read historical source report'}).click();await capture('ox-groups')
  const sxPreview=await cmd('kantata:preview',{package:sx});assert(sxPreview.canApply);assert.deepEqual(sxPreview.financial,ox.manifest.controls.financial)
  let sxJob=await cmd('kantata:create',{package:sx,fingerprint:sxPreview.fingerprint});while(sxJob.state==='applying')sxJob=await cmd('kantata:resume',{id:sxJob.id});assert.equal(sxJob.state,'completed');assert.equal((await state()).data.kantataRecords.length,2*sourceCount)
  const sxOriginals=await(await request('/api/gauge/imports/'+sxJob.id,owner)).json();assert.equal(sxOriginals.find(a=>a.name==='salesforce.zip').original.base64,sx.zip,'Salesforce object ZIP retains its exact original bytes')
  const sxGroups=await cmd('kantata:report',{namespace:sxPreview.namespace,fieldId:'practice'});assert.equal(sxGroups.groups.find(g=>g.dimension==='Brand').timeValueMinor,75000)
  const api=oxApiFixture(),apiPreview=await cmd('kantata:preview',{package:api});assert(apiPreview.canApply);const incompleteApi=structuredClone(api);incompleteApi.manifest.exportJob.status='running';assert(!(await cmd('kantata:preview',{package:incompleteApi})).canApply)
  // OX detailed time XLSX uses the bounded value-only decoder and exact year windows.
  const xlsx=structuredClone(ox);xlsx.manifest.account='synthetic-gauge-ox-xlsx';const headers=Object.values(xlsx.manifest.mapping.objects.time.columns),rows=[headers,['t2024','p1','u1','task1','i1','2024-06-05','7200','true','30000','18000','USD'],['t2025','p1','u1','task1','','2025-06-05','10800','true','45000','27000','USD']];delete xlsx.files['time.csv'];xlsx.manifest.mapping.objects.time={...xlsx.manifest.mapping.objects.time,artifact:'time.xlsx',format:'xlsx',worksheet:'Detailed time'};xlsx.workbooks={'time.xlsx':workbook(rows).toString('base64')};assert((await cmd('kantata:preview',{package:xlsx})).canApply)
  // Reversal is bounded and refuses a later native edit; unrelated namespaces survive.
  let reversed=await cmd('kantata:undo',{id:sxJob.id});while(['undoing','reversing'].includes(reversed.state))reversed=await cmd('kantata:resume',{id:sxJob.id});assert.equal((await state()).data.kantataRecords.length,sourceCount)
  assert.equal((await state()).data.invoices.length,0);assert.equal((await state()).data.payments.length,0,'Historical source finance never creates issuance or settlement authority')
  const worker=await cmd('save:people',{name:'Migration boundary worker',timezone:'America/New_York'}),staff=await h.invite('kantata-staff');await cmd('grant',{operatorId:staff.id,personId:worker.id,role:'staff',enabled:true})
  await cmd('kantata:preview',{package:ox},staff.cookie,403);await cmd('kantata:report',{namespace:preview.namespace},staff.cookie,403);assert.equal((await state(staff.cookie)).data.kantataRecords.length,0);assert.equal((await request('/api/gauge/history/kantataRecords/'+before[0].id,staff.cookie)).status,403)
  await context.close();console.log('PASS MIGRATE-004 bounded historical OX two-year and SX ZIP custody, distinct maps, complete-window/permission controls, joins, Practice/Office groups, XLSX/API preview, idempotent bounded apply/undo and 1440/390 (PARTIAL: native adoption/cutover remain)')
 }finally{await browser?.close();await h.dispose()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await kantataJourney()
